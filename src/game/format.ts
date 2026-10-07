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
