"use client";

import { useSyncExternalStore } from "react";
import type { GameEngine, Snapshot } from "@/game/engine";
import { settingsStore, type Settings } from "@/game/settings";

export function useSnapshot(engine: GameEngine): Snapshot {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
}

export function useSettings(): Settings {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.get, settingsStore.get);
}

/** 포인터 캡처 (이미 끝난 포인터면 브라우저가 예외를 던지므로 무시) */
export function capturePointer(el: Element, pointerId: number) {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    /* 캡처 없이도 동작은 이어진다 */
  }
}

/** 미디어 쿼리 일치 여부 (서버 렌더에서는 false) */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (fn) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", fn);
      return () => mq.removeEventListener("change", fn);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
