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
