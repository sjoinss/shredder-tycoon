"use client";

import { useEffect, useRef } from "react";
import { formatSeconds } from "@/game/format";
import { IconAlert, IconChevronUp } from "./Icons";

interface Props {
  open: boolean;
  onOpen: (open: boolean) => void;
  count: number;
  slots: number;
  /** 방해 요소가 남은 서류 수 */
  warn: number;
  arrivalLeft: number;
  children: React.ReactNode;
}

/** 서류 트레이 서랍: 아래 손잡이를 탭하거나 위로 끌어 올리면 파쇄기 위로 펼쳐진다 */
export default function TrayDrawer({ open, onOpen, count, slots, warn, arrivalLeft, children }: Props) {
  const drag = useRef<{ y: number; moved: boolean } | null>(null);

  // Esc로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpen]);

  const full = count >= slots;
  return (
    <div className={`drawer${open ? " is-open" : ""}`}>
      <button
          type="button"
          className="drawer__handle"
          aria-expanded={open}
          aria-controls="tray-drawer"
          onPointerDown={(e) => (drag.current = { y: e.clientY, moved: false })}
          onPointerUp={(e) => {
            const d = drag.current;
            if (!d) return;
            const dy = e.clientY - d.y;
            // 위로 밀면 펼치고 아래로 밀면 접는다 (짧은 탭은 click에서 토글)
            if (Math.abs(dy) > 24) {
              d.moved = true;
              onOpen(dy < 0);
            }
          }}
          onClick={() => {
            if (drag.current?.moved) {
              drag.current = null;
              return;
            }
            drag.current = null;
            onOpen(!open);
          }}
        >
          <span className="drawer__grip" aria-hidden="true" />
          <span className="drawer__title">
            서류 {count}/{slots}
          </span>
          {warn > 0 && (
            <span className="drawer__warn">
              <IconAlert size={14} />
              처리할 서류 {warn}
            </span>
          )}
          <span className="drawer__next">{full ? "선반 가득" : `다음 ${formatSeconds(arrivalLeft)}`}</span>
          <IconChevronUp className="drawer__chev" size={18} />
          <span className="sr-only">{open ? ", 서류 트레이 접기" : ", 서류 트레이 펼치기"}</span>
      </button>
      <div id="tray-drawer" className="drawer__panel" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
