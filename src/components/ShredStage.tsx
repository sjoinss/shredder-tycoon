"use client";

import { capturePointer } from "./hooks";
import { useEffect, useRef, useState } from "react";
import { BIN } from "@/game/data";
import type { GameEngine, Snapshot } from "@/game/engine";
import { formatSeconds } from "@/game/format";
import { StageRenderer, type StageColors } from "@/game/render/stage";
import type { Settings } from "@/game/settings";
import { IconAlert, IconBin, IconHeat } from "./Icons";

function readColors(): StageColors {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    body: v("--stage-body"),
    bodyDark: v("--stage-body-dark"),
    line: v("--color-ink-line"),
    slot: v("--stage-slot"),
    binBack: v("--stage-bin-back"),
    glass: v("--stage-glass"),
    primary: v("--color-primary"),
    success: v("--color-success"),
    warning: v("--color-warning"),
    error: v("--color-error"),
    text: v("--color-text"),
    paper: v("--color-surface"),
  };
}

function statusOf(snap: Snapshot): { text: string; tone: "ok" | "busy" | "warn" | "danger" } {
  if (snap.jam?.stage === "stuck") return { text: snap.autoReverse ? "종이 걸림 · 자동 역회전" : "종이 걸림!", tone: "danger" };
  if (snap.jam?.stage === "pull") return { text: "걸린 종이 빼는 중", tone: "danger" };
  if (snap.overheated) return { text: `과열! 식는 중… ${Math.ceil(snap.coolEta)}초`, tone: "danger" };
  if (snap.emptyStep) return { text: "통 비우는 중", tone: "warn" };
  if (snap.binFill >= 1) return { text: "통 가득 · 정지", tone: "danger" };
  if (snap.phase === "shredding") return { text: "파쇄 중", tone: "busy" };
  if (snap.phase === "cooldown") return { text: `대기 ${formatSeconds(snap.phaseLeft)}`, tone: "warn" };
  return { text: "준비됨", tone: "ok" };
}

function Gauge({
  icon,
  label,
  percent,
  level,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  percent: number;
  level: "ok" | "warn" | "danger";
  note: string | null;
}) {
  const p = Math.round(Math.min(100, Math.max(0, percent)));
  return (
    <div
      className={`gauge gauge--${level}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={p}
      aria-valuetext={`${p}%${note ? `, ${note}` : ""}`}
    >
      <span className="gauge__label" aria-hidden="true">
        {icon}
        <span className="gauge__label-text">{label}</span>
      </span>
      <span className="gauge__track" aria-hidden="true">
        <span className="gauge__fill" style={{ width: `${p}%` }} />
      </span>
      <span className="gauge__value">
        {p}%{note && <span className="gauge__note"> {note}</span>}
      </span>
    </div>
  );
}

/** 윗줄(상태·계기판) 높이: 작업대는 그 아래부터 */
const TOP_BAR = 42;

interface Props {
  engine: GameEngine;
  settings: Settings;
  snap: Snapshot;
  /** 스테이지 위에 겹쳐 보일 알림 (토스트) */
  children?: React.ReactNode;
  /** 윗줄 오른쪽 끝에 붙는 것 (진행 중인 요청) */
  topExtra?: React.ReactNode;
  /** 크게 펼친 서류 정리 화면 (파쇄기 위에 팝업처럼) */
  desk?: React.ReactNode;
  /** 슬롯 위 서류에 고칠 게 있으면 그 이름들 (정리하기 버튼) */
  fixHint?: string | null;
  /** 정리하기 버튼이나 (고칠 게 있는) 슬롯 위 서류를 눌렀을 때 */
  onOpenDesk?: () => void;
  /** 고칠 게 없는 슬롯 위 서류를 눌렀을 때: 바로 투입 */
  onFeed?: () => void;
}

export default function ShredStage({ engine, settings, snap, children, topExtra, desk, fixHint, onOpenDesk, onFeed }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  /** 파쇄기 윗면 y: 작업대는 그 위 공간만 쓴다 */
  const [headTop, setHeadTop] = useState(0);
  // 슬롯 위 서류를 누르면: 고칠 게 있으면 크게 펼치고, 없으면 바로 투입 (캔버스 핸들러가 최신 콜백을 부르도록)
  const paperTapRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    paperTapRef.current = (fixHint ? onOpenDesk : onFeed) ?? null;
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<StageRenderer | null>(null);

  // 렌더러 + 게임 루프 (requestAnimationFrame 은 탭이 비활성일 때 자동으로 멈춘다)
  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const renderer = new StageRenderer(canvas, engine);
    rendererRef.current = renderer;
    renderer.setColors(readColors());

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        renderer.resize(width, height);
        setHeadTop(renderer.headTop);
      }
    });
    ro.observe(wrap);

    const off = engine.onEvent((e) => renderer.handleEvent(e));

    // 통 비우기 직접 조작 (드래그/탭/문지르기). 같은 조작은 액션 바 버튼으로도 가능
    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    const down = (e: PointerEvent) => {
      const [x, y] = pos(e);
      if (renderer.pointerDown(x, y)) {
        capturePointer(canvas, e.pointerId);
        e.preventDefault();
      } else if (renderer.hoverHit(x, y)) paperTapRef.current?.();
    };
    const move = (e: PointerEvent) => {
      const [x, y] = pos(e);
      renderer.pointerMove(x, y);
      canvas.style.cursor = renderer.hitTest(x, y) ? "grab" : renderer.hoverHit(x, y) && paperTapRef.current ? "pointer" : "";
    };
    const up = () => renderer.pointerUp();
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);

    // 스크롤해서 파쇄기가 화면 밖이면 그리기만 쉰다 (게임은 계속 진행)
    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(wrap);

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      engine.update(dt);
      // 조각은 진행도 기준으로 만들어지므로 쉬었다 다시 그려도 빠짐없이 따라잡는다
      if (visible) renderer.frame(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      off();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [engine]);

  // 테마가 바뀌면 캔버스 색도 다시 읽음 (시스템 다크 모드 전환 포함)
  useEffect(() => {
    const refresh = () => rendererRef.current?.setColors(readColors());
    refresh();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", refresh);
    return () => mq.removeEventListener("change", refresh);
  }, [settings.theme]);

  useEffect(() => {
    rendererRef.current?.setMotion({ reduced: settings.reduceMotion, shake: settings.screenShake });
  }, [settings.reduceMotion, settings.screenShake]);

  useEffect(() => {
    rendererRef.current?.setLowPower(settings.lowPower);
  }, [settings.lowPower]);

  useEffect(() => {
    rendererRef.current?.setHoverHidden(!!desk);
  }, [desk]);

  const status = statusOf(snap);
  const heatLevel = snap.overheated || snap.heat >= 90 ? "danger" : snap.heat >= 70 ? "warn" : "ok";
  const heatNote = snap.overheated ? "과열" : snap.heatPenalty ? "급가동" : snap.heat >= 70 ? "뜨거움" : null;
  const binPct = snap.binFill * 100;
  const binLevel = snap.binFill >= 1 ? "danger" : snap.binFill >= BIN.warnAt ? "warn" : "ok";
  const binNote = snap.binFill >= 1 ? "가득" : snap.binFill >= BIN.warnAt ? "곧 가득" : null;
  // 직접 조작 단계에서는 캔버스 위 터치가 스크롤 대신 조작이 되도록
  const interactive = (snap.emptyStep !== null && snap.emptyStep !== "replace") || snap.jam?.stage === "pull";

  return (
    <section className="stage" aria-label="파쇄기">
      <div className="stage__canvas" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="종이 파쇄기. 슬롯 위에서 기다리는 서류를 누르면 투입되고, 잘린 조각이 아래 투명 폐지통에 쌓입니다."
          style={{ touchAction: interactive ? "none" : "auto" }}
        />
      </div>
      <div className="stage__top">
        <p className={`stage__status stage__status--${status.tone}`}>
          <span className="stage__led" aria-hidden="true" />
          <span>{status.text}</span>
        </p>
        <div className="gauges">
          <Gauge icon={<IconHeat size={14} />} label="열" percent={snap.heat} level={heatLevel} note={heatNote} />
          <Gauge icon={<IconBin size={14} />} label="통" percent={binPct} level={binLevel} note={binNote} />
        </div>
        {topExtra}
      </div>
      {fixHint && headTop > 0 && (
        <button type="button" className="fix-hint" style={{ top: Math.max(TOP_BAR, headTop - 46) }} onClick={onOpenDesk}>
          <IconAlert size={16} />
          <span>{fixHint}</span>
          <strong>정리하기</strong>
        </button>
      )}
      {desk && <div className="stage__desk">{desk}</div>}
      {children}
    </section>
  );
}
