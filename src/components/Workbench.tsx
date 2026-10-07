"use client";

import { capturePointer } from "./hooks";
import { useEffect, useRef, useState } from "react";
import { HAZARDS, TEMPLATES } from "@/game/data";
import type { DocView } from "@/game/engine";
import { formatWon } from "@/game/format";
import { getDocCanvas } from "@/game/render/docgen";
import { drawHazards } from "@/game/render/hazards";
import type { Hazard } from "@/game/save";
import { IconAlert, IconCheck } from "./Icons";

/** 화면 크기에 따른 작업대 종이 높이(px) */
function usePaperHeight() {
  const [h, setH] = useState(220);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 601px)");
    const update = () => setH(mq.matches ? 280 : 220);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return h;
}

/** 방해 요소 탭 영역의 중심 (mm) */
function hitCenter(h: Hazard, docW: number, docH: number): [number, number] {
  switch (h.kind) {
    case "clip":
      return [h.x + 1, h.y + 11];
    case "binder":
      return [h.x, h.y + 4];
    case "crumple":
      return [docW / 2, docH * 0.6];
    case "sleeve":
      return [docW / 2, docH * 0.85];
    default:
      return [h.x, h.y];
  }
}

function actionLabel(h: Hazard) {
  const def = HAZARDS[h.kind];
  if (h.kind === "staple") return h.left === 2 ? "스테이플 들어 올리기" : "스테이플 빼기";
  if (h.kind === "binder") return h.left === 2 ? "집게 레버 열기" : "집게 빼기";
  if (h.kind === "crumple") return `구김 펴기 (남은 ${h.left}번)`;
  if (h.kind === "sleeve") return "투명 파일에서 꺼내기";
  return `${def.name} ${def.action}`;
}

interface Props {
  doc: DocView;
  onTreat: (index: number) => void;
}

export default function Workbench({ doc, onTreat }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paperH = usePaperHeight();
  const t = TEMPLATES[doc.template];
  const scale = paperH / t.height;
  const paperW = Math.round(t.width * scale);
  const hazKey = doc.hazards.map((h) => h.left).join(",");
  const swipe = useRef<{ y: number; id: number } | null>(null);

  // 서류 + 방해 요소를 작업대 크기로 그림 (방해 요소가 바뀔 때마다 다시)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pad = 12; // 클립·집게가 종이 위로 삐져나오는 여유
    canvas.width = Math.round((paperW + pad * 2) * dpr);
    canvas.height = Math.round((paperH + pad * 2) * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, paperW + pad * 2, paperH + pad * 2);
    ctx.fillStyle = "rgba(31,42,51,0.18)";
    ctx.fillRect(pad + 4, pad + 4, paperW, paperH);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(getDocCanvas(doc), pad, pad, paperW, paperH);
    drawHazards(ctx, doc, pad, pad, scale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, hazKey, paperH, paperW, scale]);

  const pending = doc.hazards.map((h, i) => ({ h, i })).filter(({ h }) => h.left > 0);
  const sleeveIdx = pending.find(({ h }) => h.kind === "sleeve")?.i;
  const inSleeve = sleeveIdx !== undefined;
  const firstTip = pending[0] ? HAZARDS[pending[0].h.kind].tip : null;

  // 투명 파일: 서류를 위로 밀어 꺼내기 (버튼으로도 가능)
  const onPaperDown = (e: React.PointerEvent) => {
    // 버튼에서 시작한 포인터는 잡지 않는다 (캡처하면 버튼 클릭이 사라짐)
    if (!inSleeve || (e.target as HTMLElement).closest("button")) return;
    swipe.current = { y: e.clientY, id: e.pointerId };
    capturePointer(e.currentTarget as HTMLElement, e.pointerId);
  };
  const onPaperMove = (e: React.PointerEvent) => {
    const s = swipe.current;
    if (!s || s.id !== e.pointerId) return;
    if (s.y - e.clientY > 40) {
      swipe.current = null;
      onTreat(sleeveIdx!);
    }
  };
  const onPaperUp = () => {
    swipe.current = null;
  };

  return (
    <section className="workbench" aria-labelledby="workbench-title">
      <div className="workbench__head">
        <h2 id="workbench-title" className="section-title">
          작업대
        </h2>
        <span className="workbench__doc">
          No.{String(doc.id).padStart(4, "0")} {doc.rarityLabel ?? doc.templateName}
        </span>
        <span className="workbench__risk">
          <IconAlert size={16} />
          그냥 넣으면 잼 {Math.round(doc.jamRisk * 100)}%
        </span>
      </div>

      <div className="workbench__body">
        <div
          className={`workbench__paper${inSleeve ? " is-sleeved" : ""}`}
          style={{ width: paperW + 24, height: paperH + 24, touchAction: inSleeve ? "none" : "auto" }}
          onPointerDown={onPaperDown}
          onPointerMove={onPaperMove}
          onPointerUp={onPaperUp}
          onPointerCancel={onPaperUp}
        >
          <canvas ref={canvasRef} style={{ width: paperW + 24, height: paperH + 24 }} aria-hidden="true" />
          {pending.map(({ h, i }) => {
            // 파일에 든 동안은 안쪽 방해 요소를 만질 수 없음
            if (inSleeve && h.kind !== "sleeve") return null;
            const [cx, cy] = hitCenter(h, t.width, t.height);
            const chip = h.kind === "crumple" || h.kind === "sleeve";
            return (
              <button
                key={i}
                type="button"
                className={`hazard-hit hazard-hit--${h.kind}${chip ? " hazard-hit--chip" : ""}`}
                style={{ left: 12 + cx * scale, top: 12 + cy * scale }}
                onClick={() => onTreat(i)}
                aria-label={actionLabel(h)}
              >
                {chip && <span aria-hidden="true">{h.kind === "sleeve" ? "↑ 위로 밀어 꺼내기" : `펴기 ${h.left}`}</span>}
              </button>
            );
          })}
        </div>

        <div className="workbench__side">
          <ul className="workbench__todo" aria-label="할 일">
            {doc.hazards.map((h, i) => (
              <li key={i} className={h.left > 0 ? undefined : "is-done"}>
                {h.left > 0 ? <span className="todo-box" aria-hidden="true" /> : <IconCheck size={16} />}
                <span>
                  {HAZARDS[h.kind].name} {HAZARDS[h.kind].action}
                  {h.left > 0 && HAZARDS[h.kind].taps > 1 && (
                    <span className="workbench__taps">
                      {" "}
                      ({HAZARDS[h.kind].taps - h.left}/{HAZARDS[h.kind].taps})
                    </span>
                  )}
                  {h.left > 0 && inSleeve && h.kind !== "sleeve" && <span className="workbench__taps"> · 파일에서 꺼낸 뒤</span>}
                  {h.left <= 0 && <span className="sr-only"> 완료</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="workbench__value">
            처리하면 <strong>₩{formatWon(doc.potentialValue)}</strong>
            <span className="workbench__now"> (지금 ₩{formatWon(doc.value)})</span>
          </p>
          {firstTip && <p className="postit workbench__tip">{firstTip}</p>}
        </div>
      </div>
    </section>
  );
}
