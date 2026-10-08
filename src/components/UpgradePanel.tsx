"use client";

import { useRef } from "react";
import { BIN, TABS, UPGRADES, type UpgradeId, type UpgradeTab } from "@/game/data";
import type { Snapshot } from "@/game/engine";
import { formatWon } from "@/game/format";
import { IconBag, IconChevronUp, IconLock, IconShred, UPGRADE_ICONS } from "./Icons";

export type SheetState = "collapsed" | "half" | "full";
const NEXT_SHEET: Record<SheetState, SheetState> = { collapsed: "half", half: "full", full: "collapsed" };

interface Props {
  snap: Snapshot;
  tab: UpgradeTab;
  sheet: SheetState;
  onTab: (t: UpgradeTab) => void;
  onSheet: (s: SheetState) => void;
  onBuy: (id: UpgradeId) => void;
  onBuyBags: () => void;
  onBuyTier: () => void;
}

export default function UpgradePanel({ snap, tab, sheet, onTab, onSheet, onBuy, onBuyBags, onBuyTier }: Props) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const drag = useRef<{ y: number; moved: boolean } | null>(null);

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  // 핸들: 탭하면 접힘→절반→전체 순환, 위/아래로 밀면 펼치기/접기
  const onHandleDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, moved: false };
  };
  const onHandleUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.y;
    if (Math.abs(dy) > 30) {
      d.moved = true;
      if (dy < 0) onSheet(sheet === "collapsed" ? "half" : "full");
      else onSheet(sheet === "full" ? "half" : "collapsed");
    }
  };
  const onHandleClick = () => {
    if (drag.current?.moved) {
      drag.current = null;
      return;
    }
    drag.current = null;
    onSheet(NEXT_SHEET[sheet]);
  };

  const activeTab = TABS.find((t) => t.id === tab)!;
  const items = UPGRADES.filter((u) => u.tab === tab);

  return (
    <section className="upgrades" data-sheet={sheet} aria-labelledby="upgrades-title">
      <div className="upgrades__head">
        <h2 id="upgrades-title" className="section-title">
          업그레이드
        </h2>
        {snap.affordableCount > 0 && <span className="upgrades__badge">{snap.affordableCount}개 구매 가능</span>}
        <button
          type="button"
          className="upgrades__handle"
          aria-expanded={sheet !== "collapsed"}
          aria-controls="upgrades-body"
          aria-label={sheet === "full" ? "업그레이드 시트 접기" : "업그레이드 시트 펼치기"}
          onPointerDown={onHandleDown}
          onPointerUp={onHandleUp}
          onClick={onHandleClick}
        >
          <span className="upgrades__grip" aria-hidden="true" />
          <IconChevronUp className="upgrades__chev" />
        </button>
      </div>

      <div id="upgrades-body" className="upgrades__body">
        <div className="folder-tabs" role="tablist" aria-label="업그레이드 분류">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={t.id === tab}
              aria-controls="upgrade-panel"
              tabIndex={t.id === tab ? 0 : -1}
              className="folder-tab"
              onClick={() => onTab(t.id)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {t.lockedNote && <IconLock size={14} />}
              {t.label}
              <kbd aria-hidden="true">{i + 1}</kbd>
            </button>
          ))}
        </div>

        <div className="folder-panel" role="tabpanel" id="upgrade-panel" aria-labelledby={`tab-${tab}`} tabIndex={0}>
          {activeTab.lockedNote ? (
            <p className="postit">
              <strong>준비 중</strong>
              {activeTab.lockedNote}
            </p>
          ) : (
            <ul className="ledger">
              {tab === "shredder" && <TierRow snap={snap} onBuyTier={onBuyTier} />}
              {items.map((def) => {
                const u = snap.upgrades[def.id];
                const Icon = UPGRADE_ICONS[def.id];
                const shortBy = u.cost - snap.money;
                return (
                  <li key={def.id} className="ledger__row">
                    <span className="ledger__icon">
                      <Icon />
                    </span>
                    <div className="ledger__main">
                      <h3 className="ledger__name">
                        {def.name} <span className="ledger__lv">Lv.{u.level}</span>
                      </h3>
                      <p className="ledger__desc">{def.desc}</p>
                      <p className="ledger__effect">
                        {u.maxed ? (
                          def.effect(u.level)
                        ) : (
                          <>
                            {def.effect(u.level)} <span aria-hidden="true">→</span>
                            <span className="sr-only">에서</span> <strong>{def.effect(u.level + 1)}</strong>
                          </>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="buy-btn"
                      aria-disabled={!u.affordable}
                      onClick={() => u.affordable && onBuy(def.id)}
                      aria-label={
                        u.maxed
                          ? `${def.name} 최대 레벨`
                          : `${def.name} 레벨 ${u.level + 1} 구매, ₩${formatWon(u.cost)}${u.affordable ? "" : `, ₩${formatWon(shortBy)} 부족`}`
                      }
                    >
                      {u.maxed ? (
                        <span className="buy-btn__cost">최대</span>
                      ) : (
                        <>
                          <span className="buy-btn__cost">₩{formatWon(u.cost)}</span>
                          <span className="buy-btn__note">{u.affordable ? "구매" : `₩${formatWon(shortBy)} 부족`}</span>
                        </>
                      )}
                    </button>
                  </li>
                );
              })}
              {tab === "facility" && <BagRow snap={snap} onBuyBags={onBuyBags} />}
            </ul>
          )}
          {activeTab.note && <p className="postit upgrades__note">{activeTab.note}</p>}
        </div>
      </div>
    </section>
  );
}

/** 파쇄기 본체 교체 (티어): 컷 등급·수익 배율·기본 용량이 함께 바뀌는 큰 구매 */
function TierRow({ snap, onBuyTier }: { snap: Snapshot; onBuyTier: () => void }) {
  const cur = snap.tier;
  const next = snap.nextTier;
  const shortBy = next ? Math.max(0, next.cost - snap.money) : 0;
  return (
    <li className="ledger__row ledger__row--tier">
      <span className="ledger__icon">
        <IconShred />
      </span>
      <div className="ledger__main">
        <h3 className="ledger__name">
          본체 교체 <span className="ledger__lv">T{cur.index + 1}</span>
        </h3>
        <p className="ledger__desc">
          지금: {cur.name} · {cur.grade}
        </p>
        {next ? (
          <p className="ledger__effect">
            <span aria-hidden="true">→</span>
            <span className="sr-only">다음:</span> <strong>{next.name}</strong> ({next.grade}) · 수익 ×{next.mult} · 기본{" "}
            {next.capacity}장 · 열 ×{next.heat}
            <span className="ledger__perks">{next.perks}</span>
          </p>
        ) : (
          <p className="ledger__effect">지금 들일 수 있는 가장 좋은 본체예요. 보안용·산업용은 사무실이 커지면 들어와요.</p>
        )}
      </div>
      <button
        type="button"
        className="buy-btn"
        aria-disabled={!next?.affordable}
        onClick={() => next?.affordable && onBuyTier()}
        aria-label={
          next
            ? `${next.name}로 본체 교체, ₩${formatWon(next.cost)}${next.affordable ? "" : `, ₩${formatWon(shortBy)} 부족`}`
            : "본체 교체 최대"
        }
      >
        {next ? (
          <>
            <span className="buy-btn__cost">₩{formatWon(next.cost)}</span>
            <span className="buy-btn__note">{next.affordable ? "교체" : `₩${formatWon(shortBy)} 부족`}</span>
          </>
        ) : (
          <span className="buy-btn__cost">최대</span>
        )}
      </button>
    </li>
  );
}

/** 소모품: 쓰레기 봉투 (통 비울 때 1장씩 사용) */
function BagRow({ snap, onBuyBags }: { snap: Snapshot; onBuyBags: () => void }) {
  const shortBy = Math.max(0, snap.bagPackCost - snap.money);
  const note = snap.canBuyBags ? `${BIN.bagPack}장 구매` : shortBy > 0 ? `₩${formatWon(shortBy)} 부족` : "보관 한도";
  return (
    <li className="ledger__row">
      <span className="ledger__icon">
        <IconBag />
      </span>
      <div className="ledger__main">
        <h3 className="ledger__name">
          쓰레기 봉투 <span className="ledger__lv">소모품</span>
        </h3>
        <p className="ledger__desc">통을 비울 때 1장씩 사용</p>
        <p className={`ledger__effect${snap.bags === 0 ? " is-empty" : ""}`}>
          보유 <strong>{snap.bags}장</strong>
          {snap.bags === 0 && " · 봉투가 없으면 통을 비울 수 없어요"}
        </p>
      </div>
      <button
        type="button"
        className="buy-btn"
        aria-disabled={!snap.canBuyBags}
        onClick={() => snap.canBuyBags && onBuyBags()}
        aria-label={`쓰레기 봉투 ${BIN.bagPack}장 구매, ₩${formatWon(snap.bagPackCost)}${snap.canBuyBags ? "" : `, ${note}`}`}
      >
        <span className="buy-btn__cost">₩{formatWon(snap.bagPackCost)}</span>
        <span className="buy-btn__note">{note}</span>
      </button>
    </li>
  );
}
