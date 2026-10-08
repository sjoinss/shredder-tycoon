import {
  ALBUM,
  BIN,
  HAZARDS,
  PAGE_DOC,
  PAGE_TAKEN,
  TEMPLATES,
  TIERS,
  RARITIES,
  UPGRADES,
  type HazardKind,
  type TemplateId,
  type RarityId,
  type UpgradeId,
} from "./data";

export const SAVE_KEY = "shredder.save";
export const SAVE_VERSION = 4;

export interface Hazard {
  kind: HazardKind;
  /** 서류 위 위치(mm) — 그림과 탭 영역이 같은 좌표를 쓴다 */
  x: number;
  y: number;
  /** 남은 탭 수 (0이면 없어짐) */
  left: number;
  /** 직접 처리했는지 (역회전으로 튕겨 나간 건 false → 보너스 없음) */
  removed: boolean;
  /** 앨범 파일 페이지: 0 빈 포켓, 1 서류 있음, 2 꺼냄 */
  pages?: number[];
}

export interface DocData {
  id: number;
  seed: number;
  template: TemplateId;
  rarity: RarityId | null;
  hazards: Hazard[];
  /** 사용자가 올린 이미지 서류 (저장하지 않음) */
  image?: boolean;
  /** 테이프를 떼다 찢어짐 (수익↓) */
  torn?: boolean;
  /** 묶음 장수 (앨범 파일에서 나온 서류 뭉치). 없으면 1 */
  sheets?: number;
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
  /** 파쇄기 본체 티어 (0 = 가정용) */
  tier: number;
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
  tier: 0,
  levels: {
    speed: 0,
    cooldown: 0,
    capacity: 0,
    motor: 0,
    fan: 0,
    autoReverse: 0,
    inbox: 0,
    bin: 0,
    stapleRemover: 0,
    cutter: 0,
    letterOpener: 0,
    scissors: 0,
  },
  tray: [],
  nextDocId: 1,
});

export type LoadResult = { ok: true; data: SaveData; fresh: boolean } | { ok: false; reason: string };

const num = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;

/** 저장 데이터는 신뢰하지 않는다: 알려진 필드만 범위 검사 후 사용. 이전 버전은 새 필드를 기본값으로 채움 */
function sanitize(raw: unknown): SaveData {
  if (!raw || typeof raw !== "object") throw new Error("형식이 올바르지 않습니다");
  const r = raw as Record<string, unknown>;
  if (r.version !== 1 && r.version !== 2 && r.version !== 3 && r.version !== SAVE_VERSION)
    throw new Error(`지원하지 않는 저장 버전입니다 (${String(r.version)})`);

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
  if (r.version !== 1) {
    base.bags = Math.floor(num(r.bags, 0, BIN.maxBags));
    base.heat = num(r.heat, 0, 100);
    base.overheated = r.overheated === true;
    base.tier = Math.floor(num(r.tier, 0, TIERS.length - 1));
  }

  const tray = Array.isArray(r.tray) ? r.tray : [];
  for (const d of tray.slice(0, 20)) {
    if (!d || typeof d !== "object") continue;
    const doc = d as Record<string, unknown>;
    if (typeof doc.template !== "string" || !(doc.template in TEMPLATES) || doc.template === "image") continue;
    // 지금 파쇄기로는 넣을 수 없는 물건 (전용 슬롯 없음)
    if ((TEMPLATES[doc.template as TemplateId].minTier ?? 0) > base.tier) continue;
    const rarity = typeof doc.rarity === "string" && doc.rarity in RARITIES ? (doc.rarity as RarityId) : null;
    const id = Math.floor(num(doc.id, 1));
    const out: DocData = {
      id,
      seed: Math.floor(num(doc.seed, 0, 0xffffffff)),
      template: doc.template as TemplateId,
      rarity,
      hazards: sanitizeHazards(doc.hazards),
    };
    if (doc.torn === true) out.torn = true;
    const sheets = Math.floor(num(doc.sheets, 1, ALBUM.maxFilled));
    if (sheets > 1) out.sheets = sheets;
    base.tray.push(out);
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
    const hazard: Hazard = {
      kind,
      x: num(r.x, 0, 300),
      y: num(r.y, 0, 300),
      left: Math.floor(num(r.left, 0, HAZARDS[kind].taps)),
      removed: r.removed === true,
    };
    if (kind === "album") {
      // 페이지 구성이 없거나 이상하면 버림. 남은 탭 수는 페이지에서 다시 계산
      if (!Array.isArray(r.pages) || r.pages.length < 1 || r.pages.length > ALBUM.maxPages) continue;
      const pages = r.pages.map((p) => Math.floor(num(p, 0, PAGE_TAKEN)));
      hazard.pages = pages;
      if (hazard.left > 0) hazard.left = Math.min(HAZARDS.album.taps, pages.filter((p) => p === PAGE_DOC).length);
    }
    out.push(hazard);
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
