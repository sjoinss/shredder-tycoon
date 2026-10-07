import { BIN, HAZARDS, TEMPLATES, RARITIES, UPGRADES, type HazardKind, type TemplateId, type RarityId, type UpgradeId } from "./data";

export const SAVE_KEY = "shredder.save";
export const SAVE_VERSION = 2;

export interface Hazard {
  kind: HazardKind;
  /** 서류 위 위치(mm) — 그림과 탭 영역이 같은 좌표를 쓴다 */
  x: number;
  y: number;
  /** 남은 탭 수 (0이면 없어짐) */
  left: number;
  /** 직접 처리했는지 (역회전으로 튕겨 나간 건 false → 보너스 없음) */
  removed: boolean;
}

export interface DocData {
  id: number;
  seed: number;
  template: TemplateId;
  rarity: RarityId | null;
  hazards: Hazard[];
  /** 사용자가 올린 이미지 서류 (저장하지 않음) */
  image?: boolean;
}

export interface SaveData {
  version: number;
  money: number;
  totalEarned: number;
  totalShredded: number;
  /** 통 채움 0..1 */
  binFill: number;
  /** 쓰레기 봉투 재고 */
  bags: number;
  /** 열 0..100 */
  heat: number;
  overheated: boolean;
  levels: Record<UpgradeId, number>;
  tray: DocData[];
  nextDocId: number;
}

export const defaultSave = (): SaveData => ({
  version: SAVE_VERSION,
  money: 0,
  totalEarned: 0,
  totalShredded: 0,
  binFill: 0,
  bags: BIN.startBags,
  heat: 0,
  overheated: false,
  levels: { speed: 0, cooldown: 0, capacity: 0, motor: 0, fan: 0, autoReverse: 0, inbox: 0, bin: 0 },
  tray: [],
  nextDocId: 1,
});

export type LoadResult = { ok: true; data: SaveData; fresh: boolean } | { ok: false; reason: string };

const num = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;

/** 저장 데이터는 신뢰하지 않는다: 알려진 필드만 범위 검사 후 사용. v1 → v2는 새 필드를 기본값으로 채움 */
function sanitize(raw: unknown): SaveData {
  if (!raw || typeof raw !== "object") throw new Error("형식이 올바르지 않습니다");
  const r = raw as Record<string, unknown>;
  if (r.version !== 1 && r.version !== SAVE_VERSION) throw new Error(`지원하지 않는 저장 버전입니다 (${String(r.version)})`);

  const base = defaultSave();
  const levelsRaw = (r.levels ?? {}) as Record<string, unknown>;
  for (const def of UPGRADES) {
    base.levels[def.id] = Math.floor(num(levelsRaw[def.id], 0, def.maxLevel));
  }
  base.money = num(r.money);
  base.totalEarned = num(r.totalEarned);
  base.totalShredded = Math.floor(num(r.totalShredded));
  base.binFill = num(r.binFill, 0, 1);
  base.nextDocId = Math.floor(num(r.nextDocId, 1));
  if (r.version === SAVE_VERSION) {
    base.bags = Math.floor(num(r.bags, 0, BIN.maxBags));
    base.heat = num(r.heat, 0, 100);
    base.overheated = r.overheated === true;
  }

  const tray = Array.isArray(r.tray) ? r.tray : [];
  for (const d of tray.slice(0, 20)) {
    if (!d || typeof d !== "object") continue;
    const doc = d as Record<string, unknown>;
    if (typeof doc.template !== "string" || !(doc.template in TEMPLATES) || doc.template === "image") continue;
    const rarity = typeof doc.rarity === "string" && doc.rarity in RARITIES ? (doc.rarity as RarityId) : null;
    const id = Math.floor(num(doc.id, 1));
    base.tray.push({
      id,
      seed: Math.floor(num(doc.seed, 0, 0xffffffff)),
      template: doc.template as TemplateId,
      rarity,
      hazards: sanitizeHazards(doc.hazards),
    });
    base.nextDocId = Math.max(base.nextDocId, id + 1);
  }
  return base;
}

function sanitizeHazards(raw: unknown): Hazard[] {
  if (!Array.isArray(raw)) return [];
  const out: Hazard[] = [];
  for (const h of raw.slice(0, 6)) {
    if (!h || typeof h !== "object") continue;
    const r = h as Record<string, unknown>;
    if (typeof r.kind !== "string" || !(r.kind in HAZARDS)) continue;
    const kind = r.kind as HazardKind;
    out.push({
      kind,
      x: num(r.x, 0, 300),
      y: num(r.y, 0, 300),
      left: Math.floor(num(r.left, 0, HAZARDS[kind].taps)),
      removed: r.removed === true,
    });
  }
  return out;
}

export function loadSave(): LoadResult {
  let text: string | null;
  try {
    text = localStorage.getItem(SAVE_KEY);
  } catch {
    // 저장소 접근 불가(사생활 보호 모드 등): 새 게임으로 진행
    return { ok: true, data: defaultSave(), fresh: true };
  }
  if (!text) return { ok: true, data: defaultSave(), fresh: true };
  try {
    return { ok: true, data: sanitize(JSON.parse(text)), fresh: false };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "알 수 없는 오류" };
  }
}

export function writeSave(data: SaveData): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* 무시 */
  }
}
