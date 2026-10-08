"use client";

import { capturePointer } from "./hooks";
import { useEffect, useRef, useState } from "react";
import { CONTAINER_KINDS, ENVELOPE_OPENED, HAZARDS, PAGE_DOC, PAGE_TAKEN, TEMPLATES, TORN_MULT, tapeCuts } from "@/game/data";
import { actionsLeft, type DocView, type ToolLevels } from "@/game/engine";
import { formatWon } from "@/game/format";
import { getDocCanvas } from "@/game/render/docgen";
import { POSTIT_SIZE, TAPE_LENGTH, drawHazards } from "@/game/render/hazards";
import type { Hazard } from "@/game/save";
import { IconAlert, IconCheck } from "./Icons";

const PAD = 12; // 클립·집게가 종이 위로 삐져나오는 여유

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
    case "case":
      return [docW / 2, docH * 0.82];
    case "chip":
      return [h.x, h.y + 16];
    case "sleeve":
      return [docW / 2, docH * 0.85];
    case "postit":
      return [h.x + POSTIT_SIZE / 2, h.y + POSTIT_SIZE / 2];
    case "envelope":
      return h.left > ENVELOPE_OPENED ? [docW / 2, 6] : [docW / 2, docH * 0.85];
    default:
      return [h.x, h.y];
  }
}

function actionLabel(h: Hazard, tools: ToolLevels) {
  const def = HAZARDS[h.kind];
  const n = actionsLeft(h, tools);
  switch (h.kind) {
    case "staple":
      if (tools.stapleRemover >= 2) return "제거기로 스테이플 전부 빼기";
      if (tools.stapleRemover > 0) return "제거기로 스테이플 빼기";
      return h.left === 2 ? "스테이플 들어 올리기" : "스테이플 빼기";
    case "binder":
      return h.left === 2 ? "집게 레버 열기" : "집게 빼기";
    case "crumple":
      return `구김 펴기 (남은 ${h.left}번)`;
    case "chip":
      return tools.scissors > 0 ? "가위로 IC 칩 잘라 내기" : "IC 칩 자르기 (가위가 필요해요)";
    case "case":
      return "CD 케이스 열고 꺼내기";
    case "sleeve":
      return "투명 파일에서 꺼내기";
    case "tape":
      return `${tools.cutter > 0 ? "커터칼로 테이프 자르기" : "테이프 손으로 뜯기"} (남은 ${n}번)`;
    case "envelope":
      if (h.left <= ENVELOPE_OPENED) return "봉투에서 서류 꺼내기";
      return tools.letterOpener > 0 ? "레터 오프너로 봉투 열기" : `봉투 윗변 뜯기 (남은 ${h.left - ENVELOPE_OPENED}번)`;
    default:
      return `${def.name} ${def.action}`;
  }
}

/** 칩 버튼에 보이는 짧은 글자 (없으면 동그란 탭 영역) */
function chipText(h: Hazard, tools: ToolLevels): string | null {
  switch (h.kind) {
    case "crumple":
      return `펴기 ${h.left}`;
    case "case":
      return "케이스 열고 꺼내기";
    case "chip":
      return tools.scissors > 0 ? "✂ 칩 자르기" : "✂ 가위 필요";
    case "sleeve":
      return "↑ 위로 밀어 꺼내기";
    case "envelope":
      if (h.left <= ENVELOPE_OPENED) return "↑ 위로 밀어 꺼내기";
      return tools.letterOpener > 0 ? "레터 오프너로 열기" : `윗변 뜯기 ${h.left - ENVELOPE_OPENED}`;
    default:
      return null;
  }
}

interface Props {
  doc: DocView;
  tools: ToolLevels;
  onTreat: (index: number, page?: number) => void;
}

export default function Workbench({ doc, tools, onTreat }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const box = usePaperHeight();
  const t = TEMPLATES[doc.template];
  // 긴 변이 작업대 칸에 맞도록 (카드·CD처럼 가로가 긴 물건도)
  const scale = Math.min(box / t.height, box / t.width);
  const paperW = Math.round(t.width * scale);
  const paperH = Math.round(t.height * scale);
  const hazKey = doc.hazards.map((h) => h.left).join(",") + (doc.torn ? "t" : "");
  const swipe = useRef<{ y: number; id: number } | null>(null);

  const pending = doc.hazards.map((h, i) => ({ h, i })).filter(({ h }) => h.left > 0);
  const album = pending.find(({ h }) => h.kind === "album");
  // 위로 밀어 꺼내는 것: 투명 파일, 열린 봉투
  const slideOut = pending.find(
    ({ h }) => h.kind === "sleeve" || (h.kind === "envelope" && h.left <= ENVELOPE_OPENED),
  );
  const wrap = pending.find(({ h }) => CONTAINER_KINDS.includes(h.kind));
  const firstTip = pending[0] ? HAZARDS[pending[0].h.kind].tip : null;

  // 서류 + 방해 요소를 작업대 크기로 그림 (방해 요소가 바뀔 때마다 다시)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round((paperW + PAD * 2) * dpr);
    canvas.height = Math.round((paperH + PAD * 2) * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, paperW + PAD * 2, paperH + PAD * 2);
    ctx.fillStyle = "rgba(31,42,51,0.18)";
    if (doc.template !== "cd") ctx.fillRect(PAD + 4, PAD + 4, paperW, paperH);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(getDocCanvas(doc), PAD, PAD, paperW, paperH);
    drawHazards(ctx, doc, PAD, PAD, scale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, hazKey, paperH, paperW, scale, !!album]);

  // 투명 파일 / 열린 봉투: 서류를 위로 밀어 꺼내기 (버튼으로도 가능)
  const onPaperDown = (e: React.PointerEvent) => {
    // 버튼에서 시작한 포인터는 잡지 않는다 (캡처하면 버튼 클릭이 사라짐)
    if (!slideOut || (e.target as HTMLElement).closest("button")) return;
    swipe.current = { y: e.clientY, id: e.pointerId };
    capturePointer(e.currentTarget as HTMLElement, e.pointerId);
  };
  const onPaperMove = (e: React.PointerEvent) => {
    const s = swipe.current;
    if (!s || s.id !== e.pointerId) return;
    if (s.y - e.clientY > 40) {
      swipe.current = null;
      onTreat(slideOut!.i);
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
          {(doc.sheets ?? 1) > 1 && ` · ${doc.sheets}장 뭉치`}
        </span>
        <span className="workbench__risk">
          <IconAlert size={16} />
          그냥 넣으면 잼 {Math.round(doc.jamRisk * 100)}%
        </span>
      </div>

      <div className="workbench__body">
        {album ? (
          <AlbumView
            key={doc.id}
            doc={doc}
            album={album.h}
            width={paperW + PAD * 2}
            height={paperH + PAD * 2}
            onTake={(page) => onTreat(album.i, page)}
          />
        ) : (
          <div
            className={`workbench__paper${slideOut ? " is-sleeved" : ""}`}
            style={{ width: paperW + PAD * 2, height: paperH + PAD * 2, touchAction: slideOut ? "none" : "auto" }}
            onPointerDown={onPaperDown}
            onPointerMove={onPaperMove}
            onPointerUp={onPaperUp}
            onPointerCancel={onPaperUp}
          >
            <canvas ref={canvasRef} style={{ width: paperW + PAD * 2, height: paperH + PAD * 2 }} aria-hidden="true" />
            {pending.map(({ h, i }) => {
              // 감싼 것에서 꺼내기 전에는 안쪽 방해 요소를 만질 수 없음
              if (wrap && wrap.i !== i) return null;
              if (h.kind === "tape") {
                return (
                  <TapeHit
                    key={i}
                    hazard={h}
                    docW={t.width}
                    scale={scale}
                    cuts={tapeCuts(tools.cutter)}
                    label={actionLabel(h, tools)}
                    onCut={() => onTreat(i)}
                  />
                );
              }
              const [cx, cy] = hitCenter(h, t.width, t.height);
              const chip = chipText(h, tools);
              return (
                <button
                  key={i}
                  type="button"
                  className={`hazard-hit hazard-hit--${h.kind}${chip ? " hazard-hit--chip" : ""}`}
                  style={{ left: PAD + cx * scale, top: PAD + cy * scale }}
                  onClick={() => onTreat(i)}
                  aria-label={actionLabel(h, tools)}
                >
                  {chip && <span aria-hidden="true">{chip}</span>}
                </button>
              );
            })}
          </div>
        )}

        <div className="workbench__side">
          <ul className="workbench__todo" aria-label="할 일">
            {doc.hazards.map((h, i) => {
              const n = actionsLeft(h, tools);
              return (
                <li key={i} className={h.left > 0 ? undefined : "is-done"}>
                  {h.left > 0 ? <span className="todo-box" aria-hidden="true" /> : <IconCheck size={16} />}
                  <span>
                    {HAZARDS[h.kind].name} {HAZARDS[h.kind].action}
                    {h.left > 0 && h.kind === "chip" && tools.scissors <= 0 && (
                      <span className="workbench__taps"> (가위 필요 · 도구 탭)</span>
                    )}
                    {h.left > 0 && h.kind === "album" &&<span className="workbench__taps"> (서류 {h.left}장 남음)</span>}
                    {h.left > 0 && h.kind !== "album" && n > 1 && <span className="workbench__taps"> (남은 {n}번)</span>}
                    {h.left > 0 && wrap && wrap.i !== i && (
                      <span className="workbench__taps"> · {HAZARDS[wrap.h.kind].name}에서 꺼낸 뒤</span>
                    )}
                    {h.left <= 0 && <span className="sr-only"> 완료</span>}
                  </span>
                </li>
              );
            })}
          </ul>
          {doc.torn && (
            <p className="workbench__torn">
              <IconAlert size={16} />
              찢어진 서류 · 수익 ×{TORN_MULT}
            </p>
          )}
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

/** 테이프: 줄을 따라 끌면 일정 거리마다 한 번씩 잘린다. 탭(클릭)도 한 번 자르기 */
function TapeHit({
  hazard,
  docW,
  scale,
  cuts: cutCount,
  label,
  onCut,
}: {
  hazard: Hazard;
  docW: number;
  scale: number;
  cuts: number;
  label: string;
  onCut: () => void;
}) {
  const drag = useRef<{ x: number; id: number; dragged: boolean } | null>(null);
  const len = docW * TAPE_LENGTH * scale;
  // 한 번 자르는 데 끌어야 하는 거리 (너무 짧으면 실수로 잘리므로 최소 28px)
  const seg = Math.max(28, len / cutCount);

  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, id: e.pointerId, dragged: false };
    capturePointer(e.currentTarget, e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    // 이벤트가 듬성듬성 와도 끈 거리만큼 자른다
    const cuts = Math.floor(Math.abs(e.clientX - d.x) / seg);
    if (cuts > 0) {
      d.x += Math.sign(e.clientX - d.x) * cuts * seg;
      d.dragged = true;
      for (let i = 0; i < cuts; i++) onCut();
    }
  };
  const onUp = (e: React.PointerEvent) => {
    // dragged 표시는 남겨 둔다: 끌어서 자른 뒤 이어지는 click을 무시하기 위해
    if (drag.current?.id === e.pointerId) drag.current.id = -1;
  };
  const onClick = (e: React.MouseEvent) => {
    const dragged = drag.current?.dragged;
    drag.current = null;
    // 키보드(Enter/Space)로 누른 click은 detail이 0
    if (dragged && e.detail !== 0) return;
    onCut();
  };

  return (
    <button
      type="button"
      className="hazard-hit hazard-hit--tape"
      style={{ left: PAD + hazard.x * scale, top: PAD + hazard.y * scale, width: len }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onClick={onClick}
      aria-label={label}
    >
      <span aria-hidden="true">✂ 끌어서 자르기</span>
    </button>
  );
}

/** 앨범 파일: 좌우로 넘기며 서류가 든 페이지만 꺼낸다 (버튼·방향키로도 가능) */
function AlbumView({
  doc,
  album,
  width,
  height,
  onTake,
}: {
  doc: DocView;
  album: Hazard;
  width: number;
  height: number;
  onTake: (page: number) => void;
}) {
  const pages = album.pages ?? [];
  const [page, setPage] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const swipe = useRef<{ x: number; id: number } | null>(null);
  const state = pages[page];
  const flip = (dir: number) => setPage((p) => Math.min(pages.length - 1, Math.max(0, p + dir)));

  // 포켓 안의 서류 (꺼냈거나 빈 포켓이면 비닐만)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    // 앨범 속지 (남색 표지 위 흰 대지)
    ctx.fillStyle = "#2c3f63";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#eef0f2";
    ctx.fillRect(6, 6, width - 12, height - 12);
    // 링 구멍
    ctx.fillStyle = "#c3c8ce";
    for (const k of [0.2, 0.5, 0.8]) {
      ctx.beginPath();
      ctx.arc(12, height * k, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (state === PAGE_DOC) {
      const tilt = ((page * 37) % 7) - 3;
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.rotate((tilt * Math.PI) / 360);
      ctx.fillStyle = "rgba(31,42,51,0.18)";
      ctx.fillRect(-width / 2 + PAD + 4, -height / 2 + PAD + 4, width - PAD * 2, height - PAD * 2);
      ctx.drawImage(getDocCanvas(doc), -width / 2 + PAD, -height / 2 + PAD, width - PAD * 2, height - PAD * 2);
      ctx.restore();
    }
    // 비닐 포켓 광택
    ctx.fillStyle = "rgba(190,215,235,0.25)";
    ctx.fillRect(PAD - 4, PAD - 4, width - PAD * 2 + 8, height - PAD * 2 + 8);
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.moveTo(width * 0.2, PAD - 4);
    ctx.lineTo(width * 0.42, PAD - 4);
    ctx.lineTo(PAD - 4, height * 0.45);
    ctx.lineTo(PAD - 4, height * 0.25);
    ctx.closePath();
    ctx.fill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, page, state, width, height]);

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    swipe.current = { x: e.clientX, id: e.pointerId };
    capturePointer(e.currentTarget as HTMLElement, e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const s = swipe.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 40) {
      swipe.current = null;
      // 왼쪽으로 밀면 다음 페이지
      flip(dx < 0 ? 1 : -1);
    }
  };
  const onUp = () => {
    swipe.current = null;
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") flip(1);
    else if (e.key === "ArrowLeft") flip(-1);
    else return;
    e.preventDefault();
  };

  const status = state === PAGE_DOC ? "서류가 들어 있어요" : state === PAGE_TAKEN ? "꺼낸 페이지" : "빈 포켓";

  return (
    <div className="album">
      <div
        className="album__page workbench__paper"
        style={{ width, height, touchAction: "pan-y" }}
        tabIndex={0}
        role="group"
        aria-roledescription="앨범 페이지"
        aria-label={`${pages.length}쪽 중 ${page + 1}쪽, ${status}. 좌우 방향키로 넘기기`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
      >
        <canvas ref={canvasRef} style={{ width, height }} aria-hidden="true" />
        {state !== PAGE_DOC && (
          <span className="album__empty" aria-hidden="true">
            {state === PAGE_TAKEN ? "꺼냄 ✓" : "빈 포켓"}
          </span>
        )}
        {state === PAGE_DOC && (
          <button type="button" className="hazard-hit hazard-hit--chip album__take" onClick={() => onTake(page)}>
            이 페이지 꺼내기
          </button>
        )}
      </div>
      <div className="album__nav">
        <button
          type="button"
          className="secondary-btn album__btn"
          onClick={() => flip(-1)}
          aria-disabled={page === 0}
          aria-label="이전 페이지"
        >
          ◀
        </button>
        <span className="album__count" aria-hidden="true">
          {page + 1} / {pages.length}
        </span>
        <button
          type="button"
          className="secondary-btn album__btn"
          onClick={() => flip(1)}
          aria-disabled={page === pages.length - 1}
          aria-label="다음 페이지"
        >
          ▶
        </button>
      </div>
    </div>
  );
}
