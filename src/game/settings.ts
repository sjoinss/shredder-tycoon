export type ThemeId = "green" | "navy" | "night" | "system";

export interface Settings {
  theme: ThemeId;
  muted: boolean;
  sfxVolume: number;
  motorVolume: number;
  reduceMotion: boolean;
  screenShake: boolean;
  /** 내 이미지: 맞춤(여백) / 꽉 채움 */
  imageFit: "contain" | "cover";
  /** 내 이미지: 프린트된 종이 느낌 */
  imagePrint: boolean;
}

export const THEMES: { id: ThemeId; name: string; note: string }[] = [
  { id: "green", name: "오피스 그린", note: "캐비닛·데스크 매트" },
  { id: "navy", name: "딥 네이비", note: "정장·결재 서류" },
  { id: "night", name: "야간 사무실", note: "퇴근 후 어두운 사무실" },
  { id: "system", name: "시스템 설정 따르기", note: "OS 라이트/다크에 맞춤" },
];

/** layout.tsx 인라인 스크립트도 같은 키를 읽는다 */
export const THEME_KEY = "shredder.theme";
const SETTINGS_KEY = "shredder.settings";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function defaults(): Settings {
  return {
    theme: "green",
    muted: false,
    sfxVolume: 0.7,
    motorVolume: 0.5,
    reduceMotion: !!prefersReducedMotion(),
    screenShake: true,
    imageFit: "contain",
    imagePrint: true,
  };
}

const vol = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

function load(): Settings {
  const s = defaults();
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (THEMES.some((x) => x.id === t)) s.theme = t as ThemeId;
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    if (raw && typeof raw === "object") {
      s.muted = raw.muted === true;
      s.sfxVolume = vol(raw.sfxVolume, s.sfxVolume);
      s.motorVolume = vol(raw.motorVolume, s.motorVolume);
      if (typeof raw.reduceMotion === "boolean") s.reduceMotion = raw.reduceMotion;
      if (typeof raw.screenShake === "boolean") s.screenShake = raw.screenShake;
      if (raw.imageFit === "contain" || raw.imageFit === "cover") s.imageFit = raw.imageFit;
      if (typeof raw.imagePrint === "boolean") s.imagePrint = raw.imagePrint;
    }
  } catch {
    /* 저장 실패/손상 시 기본값으로 동작 */
  }
  return s;
}

let current: Settings | null = null;
const listeners = new Set<() => void>();

export const settingsStore = {
  get(): Settings {
    if (!current) current = load();
    return current;
  },
  set(patch: Partial<Settings>) {
    current = { ...settingsStore.get(), ...patch };
    if (patch.theme) document.documentElement.setAttribute("data-theme", patch.theme);
    try {
      localStorage.setItem(THEME_KEY, current.theme);
      const { theme: _theme, ...rest } = current;
      void _theme;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(rest));
    } catch {
      /* 무시: 이번 세션 동안만 적용 */
    }
    listeners.forEach((fn) => fn());
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
