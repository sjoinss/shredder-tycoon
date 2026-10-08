const UNITS: [number, string][] = [
  [1e16, "경"],
  [1e12, "조"],
  [1e8, "억"],
  [1e4, "만"],
];

/** 금액 표기: 9,999 까지는 그대로, 그 이상은 만/억/조/경 단위 */
export function formatWon(n: number): string {
  const v = Math.floor(n);
  for (const [size, unit] of UNITS) {
    if (v >= size) {
      const scaled = v / size;
      const digits = scaled >= 1000 ? 0 : scaled >= 100 ? 1 : 2;
      return `${trimZeros(scaled.toFixed(digits))}${unit}`;
    }
  }
  return v.toLocaleString("ko-KR");
}

function trimZeros(s: string) {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

export const formatSeconds = (s: number) => `${Math.max(0, s).toFixed(1)}초`;

/** 남은 시간 m:ss (1시간 넘으면 h:mm:ss) */
export function formatClock(s: number): string {
  const t = Math.max(0, Math.ceil(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** 길이 표기: "1시간 20분", "5분", "40초" */
export function formatDuration(s: number): string {
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  const sec = t % 60;
  if (m > 0) return m < 10 && sec > 0 ? `${m}분 ${sec}초` : `${m}분`;
  return `${t}초`;
}
