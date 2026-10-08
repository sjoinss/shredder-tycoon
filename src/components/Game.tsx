"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CUT_GRADES,
  HAZARDS,
  RARITIES,
  TABS,
  TEMPLATES,
  TIERS,
  TORN_MULT,
  UPGRADES,
  shredTime,
  type UpgradeId,
  type UpgradeTab,
} from "@/game/data";
import { SoundBoard } from "@/game/audio";
import { GameEngine, type FeedBlock, type GameEvent } from "@/game/engine";
import { formatWon } from "@/game/format";
import { registerImageCanvas } from "@/game/render/docgen";
import { ImagePaperError, MAX_IMAGES_AT_ONCE, makeImagePaper } from "@/game/render/imagepaper";
import { settingsStore } from "@/game/settings";
import ActionBar from "./ActionBar";
import Workbench from "./Workbench";
import Hud from "./Hud";
import { IconAlert, IconCheck, IconCoin } from "./Icons";
import SettingsDialog from "./SettingsDialog";
import ShredStage from "./ShredStage";
import Tray from "./Tray";
import UpgradePanel, { type SheetState } from "./UpgradePanel";
import { useSettings, useSnapshot } from "./hooks";

type ToastKind = "success" | "money" | "warn" | "error";
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

const TOAST_ICON = { success: IconCheck, money: IconCoin, warn: IconAlert, error: IconAlert };

const FEED_FAIL: Partial<Record<NonNullable<FeedBlock>, string>> = {
  noDoc: "처리할 서류가 없어요",
  binFull: "통이 가득 찼어요. 비워주세요",
  overheat: "과열! 식는 중이에요",
  emptying: "통을 비우는 중이에요",
};
const ANNOUNCE_GAP = 1500;

export default function Game() {
  const [engine] = useState(() => new GameEngine());
  const [sound] = useState(() => new SoundBoard(settingsStore.get()));
  const snap = useSnapshot(engine);
  const settings = useSettings();

  const [tab, setTab] = useState<UpgradeTab>("shredder");
  const [sheet, setSheet] = useState<SheetState>("collapsed");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const toastId = useRef(0);
  const lastAnnounce = useRef(0);
  const pendingAnnounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((kind: ToastKind, text: string, ms = 2600) => {
    const id = ++toastId.current;
    setToasts((list) => [...list.slice(-2), { id, kind, text }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), ms);
  }, []);

  /** 스크린리더 안내: 너무 자주 발화하지 않도록 최신 메시지만 간격을 두고 전달 */
  const announce = useCallback((text: string) => {
    const wait = Math.max(0, lastAnnounce.current + ANNOUNCE_GAP - Date.now());
    if (pendingAnnounce.current) clearTimeout(pendingAnnounce.current);
    pendingAnnounce.current = setTimeout(() => {
      lastAnnounce.current = Date.now();
      setAnnouncement(text);
    }, wait);
  }, []);

  // 설정 → 사운드
  useEffect(() => sound.applySettings(settings), [sound, settings]);

  // 모바일 오디오 정책: 첫 입력에서 AudioContext 생성/재개
  useEffect(() => {
    const unlock = () => sound.unlock();
    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("keydown", unlock, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
      sound.dispose();
    };
  }, [sound]);

  // 게임 이벤트 → 소리 / 토스트 / 안내
  useEffect(() => {
    return engine.onEvent((e: GameEvent) => {
      sound.handleEvent(e, shredTime(0) / shredTime(engine.data.levels.speed));
      switch (e.type) {
        case "shredDone": {
          const rare = e.docs.find((d) => d.rarity);
          if (rare?.rarity) {
            toast("money", `${RARITIES[rare.rarity].label} 파쇄! +₩${formatWon(e.reward)}`);
            announce(`${RARITIES[rare.rarity].label} 파쇄, ${formatWon(e.reward)}원 획득`);
          }
          break;
        }
        case "overheat":
          toast("error", "과열! 열 보호 장치가 작동했어요");
          announce("과열로 정지했어요. 30퍼센트까지 식으면 다시 가동할 수 있어요");
          break;
        case "cooled":
          toast("success", "다 식었어요. 다시 가동할 수 있어요");
          announce("다시 가동할 수 있어요");
          break;
        case "earlyRestart":
          announce("조기 재가동. 한동안 열이 더 빨리 올라요");
          break;
        case "binWarn":
          toast("warn", "통이 80% 찼어요. 지금 비우면 보너스!");
          announce("통이 80퍼센트 찼어요");
          break;
        case "binFull":
          toast("error", "통이 가득 찼어요. 비워주세요");
          announce("통이 가득 차서 파쇄기가 멈췄어요. 비워주세요");
          break;
        case "emptyStep":
          if (e.step === "tie") announce("통을 꺼냈어요. 봉투를 묶으세요");
          else if (e.step === "carry") announce("봉투를 묶었어요. 수거함에 넣으세요");
          break;
        case "bagBurst":
          toast("error", "봉투가 터졌어요! 바닥을 쓸어 담으세요");
          announce("봉투가 터졌어요. 바닥을 쓸어 담으세요");
          break;
        case "binEmptied":
          if (e.burst) {
            toast("warn", "다 치웠어요. 이번 폐지는 수익이 없어요");
            announce("청소 완료. 새 봉투를 끼웠어요");
          } else {
            toast("money", `폐지 재활용 +₩${formatWon(e.reward)}${e.bonus ? " (적정 타이밍 보너스)" : ""}`);
            announce(`통 비우기 완료, ${formatWon(e.reward)}원${e.bonus ? ", 적정 타이밍 보너스" : ""}`);
          }
          break;
        case "buyBags":
          toast("success", `쓰레기 봉투 ${e.count}장 구매`);
          announce(`쓰레기 봉투 ${e.count}장 구매 완료`);
          break;
        case "jam":
          if (engine.data.levels.autoReverse > 0) {
            toast("warn", "종이가 걸렸어요. 자동 역회전 중…");
            announce("종이가 걸렸어요. 자동 역회전 중");
          } else {
            toast("error", "종이가 걸렸어요! 역회전을 꾹 누르세요");
            announce("종이가 걸렸어요. 역회전 버튼이나 R 키를 꾹 누르세요");
          }
          break;
        case "jamPull":
          if (e.pulled === 0) {
            toast("warn", "역회전만으로는 안 빠져요. 걸린 종이를 손으로 빼세요");
            announce("역회전만으로는 안 빠져요. 걸린 종이 빼기를 세 번 누르세요");
          }
          break;
        case "jamCleared":
          if (e.lost) {
            toast("warn", "걸린 서류를 빼서 버렸어요");
            announce("걸린 서류를 빼서 버렸어요");
          } else {
            toast("success", "풀렸어요! 튕겨 나간 방해 요소는 보너스가 없어요");
            announce("잼이 풀렸어요. 파쇄를 계속해요");
          }
          break;
        case "hazardTreated":
          if (e.torn) {
            toast("warn", `테이프를 떼다 서류가 찢어졌어요 (수익 ×${TORN_MULT})`);
            announce("테이프를 떼다 서류가 찢어졌어요. 수익이 줄어요");
          } else if (e.done) announce(`${HAZARDS[e.kind].name} 처리 완료`);
          break;
        case "templateUnlocked": {
          const t = TEMPLATES[e.template];
          const msg = `새 서류: ${t.name} — 두꺼워서 1장이 투입 용량 ${t.load ?? 1}장 분이에요. 용량을 넘기면 잘 걸려요.`;
          toast("warn", msg, 6000);
          announce(msg);
          break;
        }
        case "tierUp": {
          const t = TIERS[e.tier];
          const slot = t.slot ? " 카드·CD 전용 슬롯이 생겼어요!" : "";
          toast("success", `${t.name} 파쇄기로 교체! (${CUT_GRADES[t.grade].label})${slot}`, 5000);
          announce(`${t.name} 파쇄기로 교체했어요. 수익 ${t.mult}배.${slot}`);
          break;
        }
        case "hazardUnlocked":
          toast("warn", `새 방해 요소: ${HAZARDS[e.kind].name} — ${HAZARDS[e.kind].tip}`, 6000);
          announce(`새 방해 요소 등장: ${HAZARDS[e.kind].name}. ${HAZARDS[e.kind].tip}`);
          break;
        case "actionFailed":
          toast("warn", e.reason);
          announce(e.reason);
          break;
        case "arrive":
          if (e.doc.rarity) announce(`${RARITIES[e.doc.rarity].label}가 도착했어요`);
          break;
        case "trayFull":
          announce("서류 트레이가 가득 찼어요");
          break;
        case "buy": {
          const def = UPGRADES.find((u) => u.id === e.id)!;
          toast("success", `${def.name} Lv.${e.level}`);
          announce(`${def.name} 레벨 ${e.level} 구매 완료`);
          break;
        }
        case "saveFailed":
          toast("error", "저장하지 못했어요. 브라우저 저장 공간이나 사생활 보호 모드를 확인해주세요.");
          announce("진행 상황을 저장하지 못했어요");
          break;
      }
    });
  }, [engine, sound, toast, announce]);

  // 페이지를 떠날 때 저장
  useEffect(() => {
    const save = () => engine.save();
    const onVis = () => document.visibilityState === "hidden" && save();
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [engine]);

  const feed = useCallback(() => {
    const block = engine.feedBlock();
    if (engine.feed()) return;
    const reason = block && FEED_FAIL[block];
    if (reason) {
      sound.error();
      announce(reason);
    }
  }, [engine, sound, announce]);

  const buy = useCallback((id: UpgradeId) => engine.buy(id), [engine]);
  const advanceEmpty = useCallback(() => engine.advanceEmpty(), [engine]);

  /** 내 이미지 → 종이 (브라우저 안에서만 처리, 저장·전송 없음) */
  const addImages = useCallback(
    async (files: File[]) => {
      if (files.length > MAX_IMAGES_AT_ONCE) {
        toast("warn", `한 번에 ${MAX_IMAGES_AT_ONCE}장까지만 올릴 수 있어요. 앞의 ${MAX_IMAGES_AT_ONCE}장만 넣을게요.`, 4000);
      }
      const { imageFit, imagePrint } = settingsStore.get();
      let added = 0;
      for (const file of files.slice(0, MAX_IMAGES_AT_ONCE)) {
        try {
          const canvas = await makeImagePaper(file, { fit: imageFit, print: imagePrint });
          const doc = engine.createImageDoc();
          registerImageCanvas(doc.id, canvas);
          engine.addDoc(doc);
          added++;
        } catch (err) {
          const msg = err instanceof ImagePaperError ? err.message : "이미지를 종이로 바꾸지 못했어요. 다른 이미지로 시도해주세요.";
          toast("error", msg, 5000);
          announce(msg);
        }
      }
      if (added > 0) {
        toast("success", `내 이미지 ${added}장을 트레이에 올렸어요`);
        announce(`내 이미지 ${added}장을 트레이에 올렸어요. 선택해서 투입하세요`);
      }
    },
    [engine, toast, announce],
  );

  const selectTab = useCallback((t: UpgradeTab) => {
    setTab(t);
    setSheet((s) => (s === "collapsed" ? "half" : s));
  }, []);

  // 단축키: Space 투입, E 통 비우기(단계 진행), 1~4 탭 전환
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (settingsOpen || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable;
      if (typing) return;
      if (e.code === "Space") {
        // 포커스된 버튼은 Space로 자기 자신을 누르게 둔다
        if (tag === "BUTTON" || tag === "A") return;
        e.preventDefault();
        if (!e.repeat) feed();
      } else if (e.code === "KeyR") {
        // 역회전: 누르고 있는 동안
        if (!e.repeat) engine.setReversing(true);
      } else if (e.code === "KeyE") {
        if (!e.repeat) advanceEmpty();
      } else if (/^[1-4]$/.test(e.key)) {
        const t = TABS[Number(e.key) - 1];
        if (t) {
          setTab(t.id);
          setSheet((s) => (s === "collapsed" ? "half" : s));
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "KeyR") engine.setReversing(false);
    };
    // 창을 벗어나면 누르고 있던 키가 풀린 것으로 본다
    const release = () => engine.setReversing(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", release);
    };
  }, [engine, feed, advanceEmpty, settingsOpen]);

  const selected = snap.tray.find((d) => d.id === snap.selectedId) ?? null;

  return (
    <div className="app" data-reduce-motion={settings.reduceMotion || undefined}>
      <Hud
        money={snap.money}
        incomePerSec={snap.incomePerSec}
        muted={settings.muted}
        onToggleMute={() => settingsStore.set({ muted: !settings.muted })}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="main">
        {snap.loadError && (
          <section className="load-error" role="alert">
            <h2>저장 데이터를 불러오지 못했어요</h2>
            <p>원인: {snap.loadError}</p>
            <p>다시 시도해도 같다면 초기화 후 새로 시작할 수 있어요. 초기화하면 이전 진행은 사라집니다.</p>
            <div className="load-error__actions">
              <button type="button" className="secondary-btn" onClick={() => engine.retryLoad()}>
                다시 시도
              </button>
              <button type="button" className="danger-btn" onClick={() => engine.reset()}>
                초기화하고 새로 시작
              </button>
            </div>
          </section>
        )}
        <ShredStage engine={engine} settings={settings} snap={snap}>
          <ol className="toasts" aria-hidden="true">
            {toasts.map((t) => {
              const Icon = TOAST_ICON[t.kind];
              return (
                <li key={t.id} className={`toast toast--${t.kind}`}>
                  <Icon size={18} />
                  {t.text}
                </li>
              );
            })}
          </ol>
        </ShredStage>
        <Tray
          tray={snap.tray}
          selectedId={snap.selectedId}
          batchIds={snap.batchIds}
          slots={snap.traySlots}
          arrivalLeft={snap.arrivalLeft}
          onSelect={(id) => engine.select(id)}
          onImages={addImages}
        />
        {selected && selected.pendingCount > 0 && (
          <Workbench
            doc={selected}
            tools={snap.tools}
            onTreat={(i, page) => engine.treatHazard(selected.id, i, page)}
          />
        )}
        <ActionBar
          snap={snap}
          onFeed={feed}
          onFan={() => engine.fanTap()}
          onEarlyRestart={() => engine.earlyRestart()}
          onEmpty={advanceEmpty}
          onCancelEmpty={() => engine.cancelEmpty()}
          onReverse={(on) => engine.setReversing(on)}
          onPullJam={() => engine.pullJam()}
        />
      </main>

      <aside className="goals" aria-labelledby="goals-title">
        <h2 id="goals-title" className="section-title">
          업무 일지
        </h2>
        <dl className="goals__ledger">
          <div>
            <dt>총 파쇄</dt>
            <dd>{snap.totalShredded.toLocaleString("ko-KR")}장</dd>
          </div>
          <div>
            <dt>총 수익</dt>
            <dd>₩{formatWon(snap.totalEarned)}</dd>
          </div>
          <div>
            <dt>컷 등급</dt>
            <dd>{snap.tier.grade}</dd>
          </div>
          <div>
            <dt>투입 용량</dt>
            <dd>{snap.capacity}장</dd>
          </div>
          <div>
            <dt>통 용량</dt>
            <dd>{snap.binCapacity}장 분량</dd>
          </div>
          <div>
            <dt>쓰레기 봉투</dt>
            <dd>{snap.bags}장</dd>
          </div>
        </dl>
        <p className="postit">
          <strong>의뢰 게시판</strong>
          거래처 의뢰는 사무실이 커지면 이곳에 붙어요.
        </p>
      </aside>

      <UpgradePanel
        snap={snap}
        tab={tab}
        sheet={sheet}
        onTab={selectTab}
        onSheet={setSheet}
        onBuy={buy}
        onBuyBags={() => engine.buyBags()}
        onBuyTier={() => engine.buyTier()}
      />

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onReset={() => {
          engine.reset();
          toast("success", "새 사무실에서 다시 시작합니다");
        }}
      />
    </div>
  );
}
