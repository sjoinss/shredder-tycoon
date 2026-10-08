"use client";

import { capturePointer, useSettings } from "./hooks";
import { useEffect, useRef, useState } from "react";
import { CONTAINER_KINDS, ENVELOPE_OPENED, HAZARDS, TIERS, PAGE_DOC, PAGE_TAKEN, TEMPLATES, tapeCuts } from "@/game/data";
import { actionsLeft, type DocView, type ToolLevels } from "@/game/engine";
import { getDocCanvas } from "@/game/render/docgen";
import { POSTIT_SIZE, TAPE_LENGTH, drawHazards } from "@/game/render/hazards";
import type { Hazard } from "@/game/save";
import { settingsStore } from "@/game/settings";
import { IconClose } from "./Icons";

const PAD = 12; // 클립·집게가 종이 위로 삐져나오는 여유

/** 요소 크기(px)를 따라간다: 작업대는 파쇄기 위 남은 공간에 맞춰 종이 크기를 정한다 */
function useBoxSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((s) => (Math.abs(s.w - width) < 1 && Math.abs(s.h - height) < 1 ? s : { w: width, h: height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** 포스트잇 너비 */
const noteWidth = (w: number) => (w >= 520 ? 150 : 112);
const ALBUM_NAV = 52;

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
  /** 지금 본체 티어 (그냥 갈 수 있는 방해 요소 안내용) */
  tier: number;
  onTreat: (index: number, page?: number) => void;
  onClose: () => void;
}

/** 서류를 크게 펼쳐 방해 요소를 고치는 화면 (파쇄기 위에 팝업처럼) */
export default function Workbench({ doc, tools, tier, onTreat, onClose }: Props) {
  const settings = useSettings();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const body = useBoxSize(bodyRef);
  const t = TEMPLATES[doc.template];
  // 남은 공간(할 일 칸 제외)에 종이가 통째로 들어가게. 앨범은 아래 넘기기 버튼 자리를 뺀다
  const hasAlbum = doc.hazards.some((h) => h.kind === "album" && h.left > 0);
  const noteW = noteWidth(body.w);
  const maxW = Math.max(40, body.w - noteW - 12 - PAD * 2);
  const maxH = Math.max(40, body.h - PAD * 2 - (hasAlbum ? ALBUM_NAV : 0));
  const scale = Math.min(maxH / t.height, maxW / t.width);
  const paperW = Math.round(t.width * scale);
  const paperH = Math.round(t.height * scale);
  const hazKey = doc.hazards.map((h) => h.left).join(",") + (doc.torn ? "t" : "");
  const swipe = useRef<{ y: number; id: number } | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  /** 지난 렌더 때 포커스가 작업대 안에 있었는지 (키보드·스크린리더 사용자) */
  const hadFocus = useRef(false);

  // 처리한 방해 요소의 버튼이 사라지면 포커스가 페이지 맨 위(body)로 튄다 → 다음 할 일로 옮긴다.
  // 포커스 이벤트에 기대지 않고 매 렌더 뒤 위치를 기록해 둔다
  useEffect(() => {
    const sec = sectionRef.current;
    if (!sec) return;
    if (hadFocus.current && document.activeElement === document.body) {
      const next = sec.querySelector<HTMLElement>(".hazard-hit, .album__page") ?? sec.querySelector<HTMLElement>("h2");
      next?.focus({ preventScroll: true });
    }
    hadFocus.current = sec.contains(document.activeElement);
  });

  // 다 처리해서 작업대가 닫히면 투입 버튼으로
  useEffect(
    () => () => {
      if (!hadFocus.current) return;
      // 작업대가 DOM에서 빠진 뒤에 옮긴다
      setTimeout(() => {
        if (document.activeElement === document.body) document.querySelector<HTMLElement>(".feed-btn")?.focus({ preventScroll: true });
      }, 0);
    },
    [],
  );

  const pending = doc.hazards.map((h, i) => ({ h, i })).filter(({ h }) => h.left > 0);
  const album = pending.find(({ h }) => h.kind === "album");
  // 위로 밀어 꺼내는 것: 투명 파일, 열린 봉투
  const slideOut = pending.find(
    ({ h }) => h.kind === "sleeve" || (h.kind === "envelope" && h.left <= ENVELOPE_OPENED),
  );
  const wrap = pending.find(({ h }) => CONTAINER_KINDS.includes(h.kind));
  // 처음 만난 방해 요소만 한 번 설명 (지금 본체가 그냥 갈아버리는 것이면 그렇게 안내)
  const newKind = pending.find(({ h }) => !settings.seenTips.includes(h.kind))?.h.kind;
  const tutorial = newKind
    ? TIERS[tier].handles[newKind] === 0
      ? `지금 파쇄기는 ${HAZARDS[newKind].name}도 그냥 갈아요. 직접 빼면 수익 보너스를 받아요.`
      : HAZARDS[newKind].tip
    : null;

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
    <section
      ref={sectionRef}
      className="workbench"
      aria-labelledby="workbench-title"
    >
      <h2 id="workbench-title" className="sr-only" tabIndex={-1}>
        서류 정리: No.{String(doc.id).padStart(4, "0")} {doc.rarityLabel ?? doc.templateName}
      </h2>
      <button type="button" className="workbench__close" onClick={onClose} aria-label="서류 정리 닫기">
        <IconClose size={20} />
      </button>
      {newKind && tutorial && (
        <div className="workbench__tutorial" role="note">
          <p>
            <strong>처음 보는 {HAZARDS[newKind].name}</strong>
            {tutorial}
          </p>
          <button
            type="button"
            className="workbench__tutorial-ok"
            onClick={() => settingsStore.set({ seenTips: [...settings.seenTips, newKind] })}
          >
            알겠어요
          </button>
        </div>
      )}

      <div className="workbench__body" ref={bodyRef}>
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

        {/* 서류 옆 포스트잇: 고칠 것만 */}
        <div className="workbench__note" style={{ width: noteW }}>
          <p className="workbench__note-head" aria-hidden="true">
            할 일
          </p>
          <ul className="workbench__todo" aria-label="할 일">
            {pending.map(({ h, i }) => {
              const n = actionsLeft(h, tools);
              return (
                <li key={i}>
                  <span className="todo-box" aria-hidden="true" />
                  <span>
                    {HAZARDS[h.kind].name}
                    {h.kind === "chip" && tools.scissors <= 0 && <span className="workbench__taps"> (가위 필요)</span>}
                    {h.kind === "album" ? (
                      <span className="workbench__taps"> {h.left}장</span>
                    ) : (
                      n > 1 && <span className="workbench__taps"> ×{n}</span>
                    )}
                    {wrap && wrap.i !== i && <span className="sr-only"> ({HAZARDS[wrap.h.kind].name}에서 꺼낸 뒤)</span>}
                  </span>
                </li>
              );
            })}
          </ul>
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
