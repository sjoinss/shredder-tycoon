"use client";

import { useEffect, useRef, useState } from "react";
import { THEMES, settingsStore, type Settings, type ThemeId } from "@/game/settings";
import { IconClose } from "./Icons";

interface Props {
  open: boolean;
  settings: Settings;
  onClose: () => void;
  onReset: () => void;
}

export default function SettingsDialog({ open, settings, onClose, onReset }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      returnFocus.current = document.activeElement as HTMLElement | null;
      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  const handleClose = () => {
    setConfirmReset(false);
    onClose();
    // 닫힌 뒤 열기 전 위치로 포커스 복귀
    returnFocus.current?.focus();
  };

  const set = (patch: Partial<Settings>) => settingsStore.set(patch);

  return (
    <dialog
      ref={ref}
      className="settings"
      aria-labelledby="settings-title"
      onClose={handleClose}
      onClick={(e) => {
        // 바깥(backdrop) 클릭 시 닫기
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="settings__sheet">
        <div className="settings__head">
          <h2 id="settings-title">설정</h2>
          <button type="button" className="icon-btn" aria-label="설정 닫기" onClick={() => ref.current?.close()}>
            <IconClose />
          </button>
        </div>

        <fieldset className="settings__group">
          <legend>테마</legend>
          <div className="theme-list">
            {THEMES.map((t) => (
              <label key={t.id} className="theme-option">
                <input
                  type="radio"
                  name="theme"
                  value={t.id}
                  checked={settings.theme === t.id}
                  onChange={() => set({ theme: t.id as ThemeId })}
                />
                <span className={`theme-swatch theme-swatch--${t.id}`} aria-hidden="true" />
                <span className="theme-option__text">
                  <span className="theme-option__name">{t.name}</span>
                  <span className="theme-option__note">{t.note}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="settings__group">
          <legend>소리</legend>
          <label className="check-row">
            <input type="checkbox" checked={settings.muted} onChange={(e) => set({ muted: e.target.checked })} />
            음소거
          </label>
          <label className="range-row">
            <span>효과음</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.sfxVolume * 100)}
              onChange={(e) => set({ sfxVolume: Number(e.target.value) / 100 })}
              disabled={settings.muted}
            />
            <output>{Math.round(settings.sfxVolume * 100)}%</output>
          </label>
          <label className="range-row">
            <span>모터음</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.motorVolume * 100)}
              onChange={(e) => set({ motorVolume: Number(e.target.value) / 100 })}
              disabled={settings.muted}
            />
            <output>{Math.round(settings.motorVolume * 100)}%</output>
          </label>
        </fieldset>

        <fieldset className="settings__group">
          <legend>움직임</legend>
          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.reduceMotion}
              onChange={(e) => set({ reduceMotion: e.target.checked })}
            />
            움직임 줄이기
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.screenShake}
              onChange={(e) => set({ screenShake: e.target.checked })}
            />
            파쇄 중 흔들림
          </label>
        </fieldset>

        <fieldset className="settings__group">
          <legend>내 이미지</legend>
          <div className="radio-row" role="radiogroup" aria-label="종이에 놓는 방식">
            <label className="check-row">
              <input
                type="radio"
                name="imageFit"
                checked={settings.imageFit === "contain"}
                onChange={() => set({ imageFit: "contain" })}
              />
              맞춤 (여백 포함)
            </label>
            <label className="check-row">
              <input
                type="radio"
                name="imageFit"
                checked={settings.imageFit === "cover"}
                onChange={() => set({ imageFit: "cover" })}
              />
              꽉 채움 (가장자리 잘림)
            </label>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={settings.imagePrint} onChange={(e) => set({ imagePrint: e.target.checked })} />
            프린트된 종이 느낌 (끄면 원본 색 그대로)
          </label>
          <p className="settings__note">다음에 올리는 이미지부터 적용돼요. 이미지는 저장되지 않아요.</p>
        </fieldset>

        <fieldset className="settings__group">
          <legend>저장 데이터</legend>
          <p className="settings__note">진행 상황은 이 브라우저에만 자동 저장됩니다.</p>
          <button
            type="button"
            className={`danger-btn${confirmReset ? " is-confirm" : ""}`}
            onClick={() => {
              if (!confirmReset) {
                setConfirmReset(true);
                return;
              }
              setConfirmReset(false);
              onReset();
              ref.current?.close();
            }}
          >
            {confirmReset ? "정말 초기화할까요? 한 번 더 누르세요" : "진행 초기화"}
          </button>
        </fieldset>
      </div>
    </dialog>
  );
}
