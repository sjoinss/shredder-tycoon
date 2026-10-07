"use client";

import { capturePointer } from "./hooks";
import { BIN } from "@/game/data";
import type { EmptyStep, FeedBlock, Snapshot } from "@/game/engine";
import { formatSeconds, formatWon } from "@/game/format";
import { JAM } from "@/game/data";
import { IconAlert, IconBin, IconCheck, IconFan, IconHand, IconReverse, IconShred } from "./Icons";

const BLOCK_REASON: Record<Exclude<FeedBlock, null | "busy">, string> = {
  loadError: "저장 데이터 문제를 먼저 해결해주세요",
  emptying: "통을 비우는 중이에요",
  overheat: "과열! 식는 중이에요",
  binFull: "통이 가득 찼어요. 비워주세요",
  noDoc: "트레이에 서류가 없어요",
};

const STEPS: { id: EmptyStep; label: string }[] = [
  { id: "pull", label: "통 꺼내기" },
  { id: "tie", label: "봉투 묶기" },
  { id: "carry", label: "수거함에 넣기" },
  { id: "replace", label: "새 봉투 끼우기" },
];
/** 쓸기는 3단계(수거함)에서 생긴 사고이므로 3단계로 표시 */
const stepIndex = (s: EmptyStep) => (s === "sweep" ? 2 : STEPS.findIndex((x) => x.id === s));

interface Props {
  snap: Snapshot;
  onFeed: () => void;
  onFan: () => void;
  onEarlyRestart: () => void;
  onEmpty: () => void;
  onCancelEmpty: () => void;
  onReverse: (on: boolean) => void;
  onPullJam: () => void;
}

export default function ActionBar(props: Props) {
  const { snap } = props;
  if (snap.jam) return <JamPanel {...props} />;
  if (snap.emptyStep) return <EmptyPanel {...props} step={snap.emptyStep} />;
  if (snap.overheated) return <OverheatPanel {...props} />;
  return <FeedPanel {...props} />;
}

function BinButton({ snap, onEmpty, compact = false }: Pick<Props, "snap" | "onEmpty"> & { compact?: boolean }) {
  const pct = Math.round(snap.binFill * 100);
  const can = snap.binFill > 0 && snap.phase !== "shredding" && snap.bags > 0 && !snap.loadError;
  let sub = `${pct}%`;
  if (snap.bags <= 0) sub = "봉투 없음";
  else if (snap.binFill > 0) sub = `${pct}% · ₩${formatWon(snap.recycleEstimate)}${snap.recycleBonus ? " ↑" : ""}`;
  return (
    <button
      type="button"
      className={`bin-btn${snap.binFill >= BIN.warnAt ? " is-warn" : ""}${compact ? " is-compact" : ""}`}
      aria-disabled={!can}
      onClick={onEmpty}
      aria-keyshortcuts="E"
    >
      <IconBin size={22} />
      <span className="bin-btn__text">
        <span className="bin-btn__label">통 비우기</span>
        <span className="bin-btn__sub">
          {sub}
          {snap.recycleBonus && <span className="sr-only">, 적정 타이밍 보너스</span>}
        </span>
      </span>
      <kbd className="key-hint" aria-hidden="true">
        E
      </kbd>
    </button>
  );
}

function FeedPanel({ snap, onFeed, onEmpty }: Props) {
  const block = snap.feedBlock;
  const ready = block === null;
  const progress = snap.phase === "idle" || snap.phaseTotal <= 0 ? 0 : 1 - snap.phaseLeft / snap.phaseTotal;
  const batch = snap.batchIds.map((id) => snap.tray.find((d) => d.id === id)!).filter(Boolean);
  const first = batch[0];
  const total = batch.reduce((s, d) => s + d.value, 0);

  let label = "투입";
  if (snap.phase === "shredding") label = "파쇄 중…";
  else if (snap.phase === "cooldown") label = `대기 ${formatSeconds(snap.phaseLeft)}`;
  else if (block === "binFull") label = "통 가득";
  else if (batch.length > 1) label = `${batch.length}장 투입`;

  const reason = block && block !== "busy" ? BLOCK_REASON[block] : null;

  return (
    <div className="actionbar">
      <p className="actionbar__info" id="feed-info">
        {first && !reason ? (
          <>
            <span className="actionbar__k">선택</span> {first.rarityLabel ?? first.templateName} · No.
            {String(first.id).padStart(4, "0")}
            {batch.length > 1 && ` 외 ${batch.length - 1}장`} · <strong>₩{formatWon(total)}</strong>
            {snap.batchJamRisk > 0 && (
              <span className="actionbar__risk">
                {" "}
                <IconAlert size={15} /> 잼 위험 {Math.round(snap.batchJamRisk * 100)}%
              </span>
            )}
          </>
        ) : (
          <span className={block === "binFull" ? "actionbar__warn" : undefined}>
            {block === "binFull" && <IconAlert size={16} />} {reason ?? "서류를 기다리는 중"}
          </span>
        )}
      </p>
      <div className="actionbar__row">
        <button
          type="button"
          className={`feed-btn feed-btn--${snap.phase}`}
          onClick={onFeed}
          aria-disabled={!ready}
          aria-describedby="feed-info"
          aria-keyshortcuts="Space"
          style={{ "--progress": progress } as React.CSSProperties}
        >
          <span className="feed-btn__fill" aria-hidden="true" />
          <IconShred size={24} />
          <span className="feed-btn__label">{label}</span>
          <kbd className="key-hint" aria-hidden="true">
            Space
          </kbd>
        </button>
        <BinButton snap={snap} onEmpty={onEmpty} />
      </div>
    </div>
  );
}

function OverheatPanel({ snap, onFan, onEarlyRestart, onEmpty }: Props) {
  return (
    <div className="actionbar">
      <div className="alert-panel alert-panel--danger">
        <p className="alert-panel__title">
          <IconAlert size={18} />
          <strong>과열! 열 보호 장치 작동</strong>
        </p>
        <p className="alert-panel__text">
          열 {Math.round(snap.heat)}% · 30%까지 식으면 재가동 (약 {Math.ceil(snap.coolEta)}초). 부채질하면 더 빨리 식어요.
          쉬는 동안 통을 비우면 시간 낭비가 없어요.
        </p>
      </div>
      <div className="actionbar__row">
        <button type="button" className="fan-btn" onClick={onFan}>
          <IconFan size={24} />
          부채질
          <span className="fan-btn__sub">연타</span>
        </button>
        <button
          type="button"
          className="secondary-btn early-btn"
          aria-disabled={!snap.canEarlyRestart}
          onClick={onEarlyRestart}
          aria-describedby="early-note"
        >
          조기 재가동
          <span id="early-note" className="early-btn__sub">
            {snap.canEarlyRestart ? "열 발생 ×1.3 페널티" : "60% 이하부터"}
          </span>
        </button>
        <BinButton snap={snap} onEmpty={onEmpty} compact />
      </div>
    </div>
  );
}

function EmptyPanel({ snap, step, onEmpty, onCancelEmpty }: Props & { step: EmptyStep }) {
  const current = stepIndex(step);
  let hint = "";
  let action = "";
  switch (step) {
    case "pull":
      hint = "통 손잡이를 아래로 끌어내리세요.";
      action = "통 꺼내기";
      break;
    case "tie":
      hint = `봉투 입구를 탭해서 묶으세요 (${snap.tieTaps}/${BIN.tieTaps}).`;
      action = `봉투 묶기 ${snap.tieTaps}/${BIN.tieTaps}`;
      break;
    case "carry":
      hint =
        snap.binFill >= BIN.burstFrom
          ? "봉투를 오른쪽 폐지 수거함으로 끌어다 놓으세요. 꽉 찬 봉투라 터질 수도 있어요!"
          : "봉투를 오른쪽 폐지 수거함으로 끌어다 놓으세요.";
      action = "수거함에 넣기";
      break;
    case "sweep":
      hint = `봉투가 터졌어요! 바닥을 문질러 쓸어 담으세요 (남은 ${snap.sweepLeft}).`;
      action = `쓸기 (남은 ${snap.sweepLeft})`;
      break;
    case "replace":
      hint = "새 봉투를 끼우는 중…";
      action = "새 봉투 끼우는 중";
      break;
  }

  return (
    <div className="actionbar">
      <div className={`empty-panel${step === "sweep" ? " is-danger" : ""}`}>
        <ol className="steps" aria-label="통 비우기 단계">
          {STEPS.map((s, i) => {
            const done = i < current;
            const now = i === current;
            return (
              <li
                key={s.id}
                className={`steps__item${done ? " is-done" : ""}${now ? " is-current" : ""}`}
                aria-current={now ? "step" : undefined}
              >
                <span className="steps__num" aria-hidden="true">
                  {done ? <IconCheck size={14} /> : i + 1}
                </span>
                <span className="steps__label">
                  {s.label}
                  {done && <span className="sr-only"> 완료</span>}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="empty-panel__hint">{hint}</p>
      </div>
      <div className="actionbar__row">
        <button
          type="button"
          className="step-btn"
          onClick={onEmpty}
          aria-disabled={step === "replace"}
          aria-keyshortcuts="E"
        >
          {action}
          <kbd className="key-hint" aria-hidden="true">
            E
          </kbd>
        </button>
        {step === "pull" && (
          <button type="button" className="secondary-btn" onClick={onCancelEmpty}>
            취소
          </button>
        )}
      </div>
    </div>
  );
}

/** 잼: 역회전 꾹 누르기 → (심하면) 걸린 종이 손으로 빼기 */
function JamPanel({ snap, onReverse, onPullJam }: Props) {
  const jam = snap.jam!;
  const stuck = jam.stage === "stuck";

  let title = "종이가 걸렸어요!";
  let text = "역회전 버튼을 꾹 누르세요 (1.5초). 손을 떼면 처음부터 다시예요. 걸려 있는 동안 모터가 뜨거워져요.";
  if (stuck && snap.autoReverse) text = "자동 역회전으로 푸는 중…";
  if (stuck && jam.heavy) text += " 심하게 걸려서 역회전 뒤에 손으로 빼야 해요.";
  if (!stuck) {
    title = "역회전만으로는 안 빠져요";
    text = `걸린 종이를 당겨서 빼세요 (${jam.pulled}/${JAM.pullTaps}). 파쇄기 위 종이를 탭해도 돼요. 걸린 서류는 버려집니다.`;
  }

  return (
    <div className="actionbar">
      <div className="alert-panel alert-panel--danger">
        <p className="alert-panel__title">
          <IconAlert size={18} />
          <strong>{title}</strong>
        </p>
        <p className="alert-panel__text">{text}</p>
      </div>
      <div className="actionbar__row">
        {stuck ? (
          <button
            type="button"
            className={`reverse-btn${snap.reversing ? " is-holding" : ""}`}
            style={{ "--progress": jam.reverse } as React.CSSProperties}
            aria-keyshortcuts="R"
            aria-describedby="reverse-progress"
            onPointerDown={(e) => {
              capturePointer(e.currentTarget, e.pointerId);
              onReverse(true);
            }}
            onPointerUp={() => onReverse(false)}
            onPointerCancel={() => onReverse(false)}
            onLostPointerCapture={() => onReverse(false)}
            onContextMenu={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                e.preventDefault();
                onReverse(true);
              }
            }}
            onKeyUp={(e) => {
              if (e.key === " " || e.key === "Enter") onReverse(false);
            }}
            onBlur={() => onReverse(false)}
          >
            <span className="feed-btn__fill" aria-hidden="true" />
            <IconReverse size={24} />
            <span>역회전 (꾹 누르기)</span>
            <span id="reverse-progress" className="sr-only">
              진행 {Math.round(jam.reverse * 100)}%
            </span>
            <kbd className="key-hint" aria-hidden="true">
              R
            </kbd>
          </button>
        ) : (
          <button type="button" className="step-btn" onClick={onPullJam}>
            <IconHand size={24} />
            걸린 종이 빼기 {jam.pulled}/{JAM.pullTaps}
          </button>
        )}
      </div>
    </div>
  );
}
