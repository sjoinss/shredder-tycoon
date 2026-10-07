"use client";

import { formatWon } from "@/game/format";
import { IconGear, IconMute, IconSound } from "./Icons";

interface Props {
  money: number;
  incomePerSec: number;
  muted: boolean;
  onToggleMute: () => void;
  onOpenSettings: () => void;
}

export default function Hud({ money, incomePerSec, muted, onToggleMute, onOpenSettings }: Props) {
  const rate = incomePerSec >= 100 ? formatWon(incomePerSec) : incomePerSec.toFixed(1);
  return (
    <header className="hud">
      <span className="hud__clip" aria-hidden="true" />
      <div className="hud__ledger">
        <p className="hud__label">보유 금액</p>
        <p className="hud__money">
          <span className="hud__currency">₩</span>
          {formatWon(money)}
        </p>
      </div>
      <p className="hud__rate">
        <span className="sr-only">초당 수익 </span>+₩{rate}
        <span className="hud__rate-unit">/초</span>
      </p>
      <div className="hud__actions">
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleMute}
          aria-pressed={muted}
          aria-label={muted ? "소리 켜기" : "소리 끄기"}
        >
          {muted ? <IconMute /> : <IconSound />}
        </button>
        <button type="button" className="icon-btn" onClick={onOpenSettings} aria-label="설정" aria-haspopup="dialog">
          <IconGear />
        </button>
      </div>
    </header>
  );
}
