"use client";

import { CUT_GRADES, ORDERS, TEMPLATES, TIERS } from "@/game/data";
import type { Snapshot } from "@/game/engine";
import { formatClock, formatDuration, formatWon } from "@/game/format";
import type { Order } from "@/game/save";
import { IconCheck, IconClose, IconTimer } from "./Icons";

/** "공문 20장 · P-3 이상" */
export function orderTitle(o: Order) {
  const t = o.template ? TEMPLATES[o.template] : null;
  const unit = t?.slot ? "개" : "장";
  const what = t ? t.name : "종이 서류 아무거나";
  const grade = o.minTier > 0 ? ` · ${CUT_GRADES[TIERS[o.minTier].grade].label.split(" ")[0]} 이상` : "";
  return `${what} ${o.count}${unit}${grade}`;
}

interface Props {
  snap: Snapshot;
  onAccept: (id: number) => void;
  onDecline: (id: number) => void;
  onAbandon: () => void;
}

export default function OrdersBoard({ snap, onAccept, onDecline, onAbandon }: Props) {
  const a = snap.activeOrder;
  return (
    <section className="orders" aria-labelledby="orders-title">
      <div className="orders__head">
        <h2 id="orders-title" className="section-title">
          파쇄 요청
        </h2>
        <span className="orders__rep">
          평판 {snap.reputation} · 수익 ×{snap.bonusMult.toFixed(2)}
        </span>
      </div>

      {!snap.ordersUnlocked ? (
        <p className="postit">
          누적 {ORDERS.unlockAt}장을 갈면 다른 팀에서 파쇄 요청이 들어와요. (지금 {snap.totalShredded}장)
        </p>
      ) : (
        <>
          {a && (
            <article className="order order--active" aria-label={`진행 중인 요청: ${a.client}`}>
              <div className="order__top">
                <strong className="order__client">{a.client}</strong>
                <span className={`order__time${a.left < 30 ? " is-urgent" : ""}`}>
                  <IconTimer size={14} />
                  {formatClock(a.left)}
                  <span className="sr-only"> 남음</span>
                </span>
              </div>
              <p className="order__title">{orderTitle(a)}</p>
              {snap.tier.index < a.minTier && <p className="order__warn">지금 본체로는 셈하지 않아요 (등급 부족)</p>}
              <div
                className="order__bar"
                role="progressbar"
                aria-label="요청 진행"
                aria-valuemin={0}
                aria-valuemax={a.count}
                aria-valuenow={a.progress}
              >
                <span style={{ width: `${(a.progress / a.count) * 100}%` }} />
              </div>
              <div className="order__bottom">
                <span className="order__progress">
                  {a.progress}/{a.count}
                </span>
                <span className="order__reward">
                  ₩{formatWon(a.reward)} · 평판 +{a.rep}
                </span>
                <button type="button" className="order__abandon" onClick={onAbandon}>
                  포기 (평판 −{ORDERS.failRep})
                </button>
              </div>
            </article>
          )}

          {snap.offers.length === 0 ? (
            !a && <p className="orders__empty">새 요청을 기다리는 중이에요.</p>
          ) : (
            <ul className="orders__list">
              {snap.offers.map((o) => (
                <li key={o.id} className="order">
                  <div className="order__top">
                    <strong className="order__client">{o.client}</strong>
                    <span className="order__time">
                      <IconTimer size={14} />
                      {formatDuration(o.time)} 안에
                    </span>
                  </div>
                  <p className="order__title">{orderTitle(o)}</p>
                  <div className="order__bottom">
                    <span className="order__reward">
                      ₩{formatWon(o.reward)} · 평판 +{o.rep}
                    </span>
                    <button
                      type="button"
                      className="order__btn order__btn--accept"
                      aria-disabled={!!a}
                      onClick={() => onAccept(o.id)}
                      aria-label={`${o.client} 요청 받기: ${orderTitle(o)}${a ? " (진행 중인 요청을 먼저 끝내세요)" : ""}`}
                    >
                      <IconCheck size={16} />
                      받기
                    </button>
                    <button
                      type="button"
                      className="order__btn"
                      onClick={() => onDecline(o.id)}
                      aria-label={`${o.client} 요청 거절`}
                    >
                      <IconClose size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
