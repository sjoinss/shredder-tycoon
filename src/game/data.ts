// 서류/업그레이드/컷 등급 정의 테이블. 수치는 모두 초기값이며 플레이 테스트로 조정한다.

export type TemplateId = "official" | "ledger" | "receipt" | "memo" | "image" | "bizcard" | "card" | "cd";
export type RarityId = "gold" | "urgent";
export type UpgradeId =
  | "speed"
  | "cooldown"
  | "capacity"
  | "motor"
  | "fan"
  | "autoReverse"
  | "inbox"
  | "bin"
  | "stapleRemover"
  | "cutter"
  | "letterOpener"
  | "scissors"
  | "sorter"
  | "autoFeed"
  | "janitor"
  | "compactor"
  | "recycle";
export type UpgradeTab = "shredder" | "tools" | "automation" | "facility";
export type CutGradeId = "P-1" | "P-3" | "P-4" | "P-5";

export interface TemplateDef {
  name: string;
  /** 기본 수익(원) */
  baseValue: number;
  /** 종이 크기(mm 단위, 렌더 좌표의 기본 단위) */
  width: number;
  height: number;
  /** 등장 가중치 */
  weight: number;
  /** 두께 (열 발생량 계수) */
  thickness: number;
  /** 투입 용량을 몇 장 분 차지하는지 (명함은 두꺼워서 3장 분). 없으면 1 */
  load?: number;
  /** 전용 슬롯으로만 넣는 것 (한 번에 하나씩) */
  slot?: boolean;
  /** 누적 파쇄 장수가 이만큼 되면 도착하기 시작 */
  unlockAt?: number;
  /** 이 티어(0부터) 이상 파쇄기에서만 도착 */
  minTier?: number;
}

export const TEMPLATES: Record<TemplateId, TemplateDef> = {
  official: { name: "공문", baseValue: 12, width: 210, height: 297, weight: 3, thickness: 1 },
  ledger: { name: "장부", baseValue: 15, width: 210, height: 297, weight: 2, thickness: 1 },
  receipt: { name: "영수증", baseValue: 6, width: 80, height: 210, weight: 3, thickness: 0.6 },
  memo: { name: "메모", baseValue: 8, width: 148, height: 210, weight: 2, thickness: 0.8 },
  // 사용자가 올린 이미지로 만든 종이: 무작위로는 나오지 않음, 일반 공문과 같은 수익
  image: { name: "내 이미지", baseValue: 12, width: 210, height: 297, weight: 0, thickness: 1 },
  bizcard: { name: "명함", baseValue: 14, width: 90, height: 50, weight: 1.5, thickness: 2, load: 3, unlockAt: 320 },
  card: { name: "카드", baseValue: 45, width: 86, height: 54, weight: 1, thickness: 3, slot: true, minTier: 3 },
  cd: { name: "CD", baseValue: 35, width: 120, height: 120, weight: 1, thickness: 3.5, slot: true, minTier: 3 },
};

/** 무작위로 도착하는 양식 */
export const TEMPLATE_IDS = (Object.keys(TEMPLATES) as TemplateId[]).filter((id) => TEMPLATES[id].weight > 0);

// ---------- 방해 요소 ----------
export type HazardKind =
  | "crumple"
  | "clip"
  | "staple"
  | "binder"
  | "sleeve"
  | "postit"
  | "tape"
  | "envelope"
  | "album"
  | "chip"
  | "case";

export interface HazardDef {
  name: string;
  /** 버튼에 쓰는 동작 이름 */
  action: string;
  /** 제거에 필요한 탭 수 */
  taps: number;
  /** 처리하지 않고 넣었을 때 잼 확률 (P-1 가정용 기준: 클립/스테이플 처리 불가) */
  jam: number;
  /** 이걸로 잼이 나면 역회전만으로 안 풀림 (걸린 종이를 직접 빼야 함) */
  heavy: boolean;
  /** 누적 파쇄 장수가 이만큼 되면 등장 */
  unlockAt: number;
  tip: string;
  /** 이 양식에만 붙는다 (전용 슬롯 물건 등). 없으면 종이 서류 전반 */
  only?: TemplateId[];
  /** 처리하려면 필요한 도구 */
  tool?: UpgradeId;
}

export const HAZARDS: Record<HazardKind, HazardDef> = {
  crumple: {
    name: "구겨짐",
    action: "펴기",
    taps: 2,
    jam: 0.25,
    heavy: false,
    unlockAt: 5,
    tip: "구겨진 종이는 탭해서 펴세요. 그냥 넣으면 잘 걸려요.",
  },
  clip: {
    name: "클립",
    action: "빼기",
    taps: 1,
    jam: 0.35,
    heavy: false,
    unlockAt: 15,
    tip: "클립은 탭해서 빼세요. 가정용 파쇄기는 클립을 못 갈아요.",
  },
  staple: {
    name: "스테이플",
    action: "빼기",
    taps: 2,
    jam: 0.3,
    heavy: false,
    unlockAt: 30,
    tip: "스테이플은 한 번 탭해 들어 올리고, 한 번 더 탭해 빼요.",
  },
  binder: {
    name: "집게",
    action: "빼기",
    taps: 2,
    jam: 0.6,
    heavy: true,
    unlockAt: 60,
    tip: "집게는 레버를 열고(탭) 빼세요(탭). 걸리면 손으로 빼야 해요.",
  },
  sleeve: {
    name: "투명 파일",
    action: "꺼내기",
    taps: 1,
    jam: 0.85,
    heavy: true,
    unlockAt: 90,
    tip: "투명 파일에 든 서류는 위로 밀어 꺼내세요. 비닐은 거의 확실히 걸려요.",
  },
  postit: {
    name: "포스트잇",
    action: "떼기",
    taps: 1,
    jam: 0.2,
    heavy: false,
    unlockAt: 120,
    tip: "포스트잇은 탭해서 떼세요. 접착면이 칼날에 들러붙어요.",
  },
  tape: {
    name: "테이프",
    action: "잘라 떼기",
    taps: 3,
    jam: 0.45,
    heavy: false,
    unlockAt: 150,
    tip: "테이프는 줄을 따라 끌어서 잘라 떼요. 손으로 하면 서류가 찢어질 수 있어요 — 커터칼이 있으면 깔끔해요.",
  },
  envelope: {
    name: "봉투",
    action: "열고 꺼내기",
    // 뜯기 3번 + 꺼내기 1번
    taps: 4,
    jam: 0.5,
    heavy: false,
    unlockAt: 200,
    tip: "봉투는 윗변을 뜯어 열고 서류를 위로 꺼내요. 레터 오프너가 있으면 한 번에 열려요.",
  },
  album: {
    name: "앨범 파일",
    action: "꺼내기",
    // 서류가 든 페이지 수 (최대)
    taps: 4,
    jam: 0.9,
    heavy: true,
    unlockAt: 260,
    tip: "앨범 파일은 좌우로 넘기며 서류가 든 페이지만 꺼내세요. 빈 포켓은 건너뛰어요.",
  },
  chip: {
    name: "IC 칩",
    action: "가위로 자르기",
    taps: 1,
    jam: 0.15,
    heavy: false,
    unlockAt: 0,
    tip: "칩 카드는 가위로 칩을 잘라 내면 보너스. 금속 칩은 칼날에 걸리기도 해요.",
    only: ["card"],
    tool: "scissors",
  },
  case: {
    name: "CD 케이스",
    action: "열고 꺼내기",
    taps: 1,
    jam: 0.9,
    heavy: true,
    unlockAt: 0,
    tip: "CD는 플라스틱 케이스에서 꺼내서 넣어요. 케이스째 넣으면 단단히 걸려요.",
    only: ["cd"],
  },
};

/** 서류를 감싸는 방해 요소: 먼저 꺼내야 안쪽을 만질 수 있다 */
export const CONTAINER_KINDS: readonly HazardKind[] = ["sleeve", "envelope", "album", "case"];
/** 봉투: 남은 탭이 이 값이면 열린 상태 (꺼내기만 남음) */
export const ENVELOPE_OPENED = 1;
/** 앨범 파일 페이지 구성 */
export const ALBUM = { minPages: 4, maxPages: 6, minFilled: 2, maxFilled: 4 };
/** 앨범 페이지 상태 */
export const PAGE_EMPTY = 0;
export const PAGE_DOC = 1;
export const PAGE_TAKEN = 2;
/** 찢어진 서류 수익 배율 */
export const TORN_MULT = 0.6;

export const HAZARD_KINDS = Object.keys(HAZARDS) as HazardKind[];
/** 해금 후 서류에 방해 요소가 붙을 확률 */
export const HAZARD_CHANCE = 0.4;
/** 직접 처리한 방해 요소 하나당 수익 보너스 */
export const HAZARD_BONUS = 0.2;

/** 잼 규칙 */
export const JAM = {
  /** 역회전 버튼을 꾹 누르는 시간 */
  reverseTime: 1.5,
  /** 자동 역회전이 푸는 시간 */
  autoReverseTime: 0.6,
  /** 심한 잼: 걸린 종이를 빼는 탭 수 */
  pullTaps: 3,
  /** 걸려 있는 동안 모터 과부하로 오르는 열(%/초) */
  heatPerSec: 4,
  /** 처리 안 한 방해 요소가 이만큼 이상이면 심한 잼 */
  heavyCount: 3,
};

export interface RarityDef {
  label: string;
  mult: number;
  chance: number;
}

export const RARITIES: Record<RarityId, RarityDef> = {
  gold: { label: "금테 계약서", mult: 5, chance: 0.02 },
  urgent: { label: "긴급 서류", mult: 3, chance: 0.04 },
};

export interface CutGradeDef {
  label: string;
  mult: number;
  /** 조각 폭(mm) */
  stripWidth: number;
  /** 조각 길이 범위(mm) */
  segment: [number, number];
  /** 열 발생 계수 */
  heat: number;
  /** 폐지 단가(원/장) — 스트립 > 크로스컷 > 마이크로컷 */
  pulpPrice: number;
  /** 같은 통에 담기는 양 배율 (잘게 자를수록 촘촘히 쌓인다) */
  pack: number;
}

export const CUT_GRADES: Record<CutGradeId, CutGradeDef> = {
  "P-1": { label: "P-1 스트립", mult: 1, stripWidth: 7, segment: [38, 64], heat: 1, pulpPrice: 1.2, pack: 1 },
  "P-3": { label: "P-3 크로스컷", mult: 1, stripWidth: 5, segment: [36, 46], heat: 1, pulpPrice: 1, pack: 1.3 },
  "P-4": { label: "P-4 크로스컷", mult: 1, stripWidth: 4, segment: [24, 32], heat: 1, pulpPrice: 0.9, pack: 1.5 },
  "P-5": { label: "P-5 마이크로컷", mult: 1, stripWidth: 2, segment: [9, 13], heat: 1, pulpPrice: 0.6, pack: 1.8 },
};

// ---------- 파쇄기 본체 (티어) ----------
export interface TierDef {
  name: string;
  grade: CutGradeId;
  /** 교체 비용 (T1은 처음부터 보유) */
  cost: number;
  /** 기본 투입 용량 (용량 업그레이드가 여기에 더해짐) */
  capacity: number;
  /** 수익 배율 */
  mult: number;
  /** 열 발생 배율 */
  heat: number;
  /** 파쇄 시간 배율 */
  time: number;
  /** 처리 안 한 방해 요소의 잼 확률 배율 (기계가 갈아버릴 수 있는 것) */
  handles: Partial<Record<HazardKind, number>>;
  /** 카드/CD 전용 슬롯 */
  slot: boolean;
  /** 교체 화면에 보이는 특징 */
  perks: string;
}

export const TIERS: TierDef[] = [
  { name: "가정용 스트립", grade: "P-1", cost: 0, capacity: 1, mult: 1, heat: 1, time: 1, handles: {}, slot: false, perks: "클립·스테이플을 못 갈아요" },
  {
    name: "소형 크로스컷",
    grade: "P-3",
    cost: 1500,
    capacity: 2,
    mult: 1.6,
    heat: 1.15,
    time: 1.1,
    handles: { clip: 0, staple: 0.5 },
    slot: false,
    perks: "클립 OK, 스테이플은 반쯤",
  },
  {
    name: "사무용",
    grade: "P-4",
    cost: 12000,
    capacity: 4,
    mult: 2.4,
    heat: 1.3,
    time: 1.15,
    handles: { clip: 0, staple: 0, binder: 0.5 },
    slot: false,
    perks: "클립·스테이플 OK, 명함도 거뜬",
  },
  {
    name: "마이크로컷",
    grade: "P-5",
    cost: 60000,
    capacity: 3,
    mult: 3.6,
    heat: 1.6,
    time: 1.3,
    handles: { clip: 0, staple: 0, binder: 0.5 },
    slot: true,
    perks: "카드·CD 전용 슬롯, 열이 많이 나요",
  },
];

/** 투입 용량을 넘긴 1장 분마다 붙는 잼 확률 */
export const OVERLOAD_JAM = 0.2;

/** 실제 복사 양식지 느낌의 종이 색 (테마와 무관하게 고정) */
export const PAPER_COLORS = ["#fbfaf5", "#f7f0dd", "#e7eef5", "#f6e7e8", "#e5e3dc"];

export interface UpgradeDef {
  id: UpgradeId;
  tab: UpgradeTab;
  name: string;
  desc: string;
  baseCost: number;
  growth: number;
  maxLevel: number;
  /** 레벨별 효과를 사람이 읽을 수 있는 문자열로 */
  effect: (level: number) => string;
}

export const shredTime = (lv: number) => 2.4 * Math.pow(0.88, lv);
export const cooldownTime = (lv: number) => 1.2 * Math.pow(0.84, lv);
export const arrivalInterval = (lv: number) => 3.5 * Math.pow(0.87, lv);
export const traySlots = (lv: number) => 4 + Math.floor(lv / 2);
/** 용량 업그레이드가 본체 기본 용량에 더하는 장수 */
const CAPACITY_STEPS = [0, 1, 2, 3, 4, 5, 7];
export const capacityBonus = (lv: number) => CAPACITY_STEPS[Math.min(lv, CAPACITY_STEPS.length - 1)];
export const feedCapacity = (lv: number, tier = 0) =>
  TIERS[tier].capacity + capacityBonus(lv);
export const heatMult = (lv: number) => Math.pow(0.9, lv);
/** 초당 식는 양(%) */
export const coolRate = (lv: number) => 2 * (1 + 0.15 * lv);
/** 통이 담을 수 있는 A4 장수 */
export const binCapacity = (lv: number) => Math.round(60 * (1 + 0.25 * lv));

/** 열(과열) 규칙 — 실제 파쇄기의 듀티 사이클/열 보호 장치를 단순화 */
export const HEAT = {
  /** A4 한 장(두께 1)당 열 % */
  perSheet: 8,
  /** 이 값 이하로 식어야 재가동 */
  resumeAt: 30,
  /** 조기 재가동 가능 지점 */
  earlyAt: 60,
  /** 파쇄 중에는 덜 식는다 */
  shreddingCool: 0.4,
  /** 부채질 한 번에 식는 양 */
  fanTap: 1,
  /** 조기 재가동 후 열 발생 배율 (30% 아래로 식을 때까지) */
  earlyPenalty: 1.3,
};

// ---------- 도구 ----------
const TAPE_CUTS = [3, 2, 1, 1];
const TEAR_CHANCE = [0.3, 0.15, 0.05, 0];
/** 커터칼 레벨별: 테이프 하나를 떼는 데 필요한 동작 수 */
export const tapeCuts = (lv: number) => TAPE_CUTS[Math.min(lv, TAPE_CUTS.length - 1)];
/** 커터칼 레벨별: 테이프를 다 뗄 때 서류가 찢어질 확률 */
export const tearChance = (lv: number) => TEAR_CHANCE[Math.min(lv, TEAR_CHANCE.length - 1)];

/** 쓰레기통 규칙 */
export const BIN = {
  warnAt: 0.8,
  /** 80~99%에서 비우면 적정 타이밍 보너스 */
  bonusMult: 1.5,
  /** 이 이상 꽉 찬 봉투를 들면 터질 수 있음 */
  burstFrom: 0.98,
  burstChance: 0.4,
  tieTaps: 3,
  sweepCount: 10,
  bagPrice: 12,
  bagPack: 5,
  startBags: 3,
  maxBags: 99,
};

export const UPGRADES: UpgradeDef[] = [
  {
    id: "speed",
    tab: "shredder",
    name: "파쇄 속도",
    desc: "한 장이 슬롯을 지나가는 시간",
    baseCost: 30,
    growth: 1.15,
    maxLevel: 10,
    effect: (lv) => `${shredTime(lv).toFixed(2)}초/장`,
  },
  {
    id: "cooldown",
    tab: "shredder",
    name: "재사용 쿨타임",
    desc: "투입 사이 대기 시간",
    baseCost: 45,
    growth: 1.15,
    maxLevel: 10,
    effect: (lv) => `${cooldownTime(lv).toFixed(2)}초`,
  },
  {
    id: "capacity",
    tab: "shredder",
    name: "투입 용량",
    desc: "본체 기본 용량에 더해 한 번에 넣는 장수 (서류 여러 장을 묶어 투입)",
    baseCost: 120,
    growth: 1.5,
    maxLevel: 6,
    effect: (lv) => `본체 +${capacityBonus(lv)}장`,
  },
  {
    id: "motor",
    tab: "shredder",
    name: "모터 출력",
    desc: "같은 일을 해도 열이 덜 남 (연속 가동 시간↑)",
    baseCost: 60,
    growth: 1.15,
    maxLevel: 10,
    effect: (lv) => `열 ×${heatMult(lv).toFixed(2)}`,
  },
  {
    id: "fan",
    tab: "shredder",
    name: "냉각 팬",
    desc: "식는 속도, 과열 정지 시간 단축",
    baseCost: 50,
    growth: 1.15,
    maxLevel: 10,
    effect: (lv) => `${coolRate(lv).toFixed(1)}%/초`,
  },
  {
    id: "autoReverse",
    tab: "shredder",
    name: "자동 역회전",
    desc: "종이가 걸리면 알아서 역회전 (심한 잼은 손으로 빼야 함)",
    baseCost: 400,
    growth: 1,
    maxLevel: 1,
    effect: (lv) => (lv > 0 ? "자동" : "수동 (꾹 누르기)"),
  },
  {
    id: "inbox",
    tab: "facility",
    name: "인박스 선반",
    desc: "서류 도착 간격과 대기 칸",
    baseCost: 35,
    growth: 1.15,
    maxLevel: 10,
    effect: (lv) => `${arrivalInterval(lv).toFixed(1)}초 · ${traySlots(lv)}칸`,
  },
  {
    id: "bin",
    tab: "facility",
    name: "대형 봉투",
    desc: "통 용량 — 비우는 빈도↓",
    baseCost: 70,
    growth: 1.15,
    maxLevel: 10,
    effect: (lv) => `${binCapacity(lv)}장 분량`,
  },
  {
    id: "stapleRemover",
    tab: "tools",
    name: "스테이플러 제거기",
    desc: "스테이플을 한 번에 뽑음 (Lv.2: 서류의 스테이플 전부)",
    baseCost: 250,
    growth: 3,
    maxLevel: 2,
    effect: (lv) => (lv >= 2 ? "전부 한 번에" : lv === 1 ? "1번에 1개" : "손톱으로 2번"),
  },
  {
    id: "cutter",
    tab: "tools",
    name: "커터칼",
    desc: "테이프를 적게 끌어도 잘리고, 서류가 덜 찢어짐",
    baseCost: 300,
    growth: 2,
    maxLevel: 3,
    effect: (lv) => `${tapeCuts(lv)}번 · 찢어짐 ${Math.round(tearChance(lv) * 100)}%`,
  },
  {
    id: "letterOpener",
    tab: "tools",
    name: "레터 오프너",
    desc: "봉투 윗변을 한 번에 깔끔하게 엶",
    baseCost: 450,
    growth: 1,
    maxLevel: 1,
    effect: (lv) => (lv > 0 ? "한 번에 열기" : "손으로 3번 뜯기"),
  },
  {
    id: "scissors",
    tab: "tools",
    name: "가위",
    desc: "칩 카드의 IC 칩을 잘라 냄 (보너스)",
    baseCost: 2500,
    growth: 1,
    maxLevel: 1,
    effect: (lv) => (lv > 0 ? "칩 자르기 가능" : "없음"),
  },
  {
    id: "sorter",
    tab: "automation",
    name: "정리 알바",
    desc: "트레이 서류의 방해 요소를 알아서 처리 (도구가 필요한 건 도구가 있어야)",
    baseCost: 800,
    growth: 2.5,
    maxLevel: 3,
    effect: (lv) => (lv > 0 ? `${sorterInterval(lv)}초마다 1번` : "없음"),
  },
  {
    id: "autoFeed",
    tab: "automation",
    name: "급지 담당",
    desc: "처리할 게 없는 서류를 알아서 투입 (열 75% 이상이면 쉼). 자리를 비운 동안에도 일부 벌어요",
    baseCost: 2000,
    growth: 3,
    maxLevel: 3,
    effect: (lv) =>
      lv > 0 ? `${FEEDER_NAMES[lv - 1]} · ${feedDelay(lv)}초 뒤 · 오프라인 ${offlineCapHours(lv)}시간` : "없음",
  },
  {
    id: "janitor",
    tab: "automation",
    name: "청소 담당",
    desc: "통이 80% 차면 알아서 비움 (폐지 수익은 70%만, 봉투는 씀)",
    baseCost: 3000,
    growth: 1,
    maxLevel: 1,
    effect: (lv) => (lv > 0 ? "자동 비우기" : "없음"),
  },
  {
    id: "compactor",
    tab: "facility",
    name: "폐지 압축기",
    desc: "같은 통에 조각을 눌러 담음",
    baseCost: 6000,
    growth: 1,
    maxLevel: 1,
    effect: (lv) => `통 용량 ×${compactorMult(lv)}`,
  },
  {
    id: "recycle",
    tab: "facility",
    name: "재활용 업체 계약",
    desc: "폐지 단가 인상",
    baseCost: 1500,
    growth: 1.6,
    maxLevel: 5,
    effect: (lv) => `폐지 ×${recycleMult(lv).toFixed(2)}`,
  },
];

export const upgradeCost = (def: UpgradeDef, level: number) =>
  Math.ceil(def.baseCost * Math.pow(def.growth, level));

export const TABS: { id: UpgradeTab; label: string; lockedNote?: string; note?: string }[] = [
  { id: "shredder", label: "파쇄기" },
  { id: "tools", label: "도구", note: "라벨 리무버는 코팅 서류가 들어오면 입고돼요." },
  { id: "automation", label: "자동화" },
  { id: "facility", label: "시설" },
];

// ---------- 자동화 ----------
const FEEDER_NAMES = ["급지 알바", "급지 담당", "자동 급지 장치"];
/** 정리 알바가 방해 요소에 한 번 손대는 간격(초) */
export const sorterInterval = (lv: number) => [0, 5, 3, 1.8][Math.min(lv, 3)];
/** 급지 담당이 준비된 뒤 투입하기까지(초) */
export const feedDelay = (lv: number) => [0, 4, 2, 0.7][Math.min(lv, 3)];
/** 자리를 비운 동안 벌 수 있는 최대 시간 */
export const offlineCapHours = (lv: number) => [0, 1, 2, 4][Math.min(lv, 3)];
/** 급지 담당은 열이 이만큼 이상이면 쉰다 */
export const FEEDER_HEAT_LIMIT = 75;
/** 청소 담당이 비울 때 받는 폐지 수익 비율 */
export const JANITOR_SHARE = 0.7;
export const compactorMult = (lv: number) => (lv > 0 ? 2 : 1);
export const recycleMult = (lv: number) => 1 + 0.25 * lv;

/** 오프라인 수익 규칙: 실제 플레이보다 덜 번다 (과열·통·방해 요소를 처리할 사람이 없음) */
export const OFFLINE = {
  efficiency: 0.35,
  /** 이보다 짧게 비웠으면 계산하지 않음(초) */
  minAway: 60,
};

// ---------- 의뢰 / 평판 ----------
export const CLIENTS = ["한빛상사", "푸른회계사무소", "새솔법무법인", "다온의원", "미래물산", "청람건설", "온누리여행사", "가람출판"];

export const ORDERS = {
  /** 누적 파쇄 장수가 이만큼 되면 의뢰가 들어옴 */
  unlockAt: 40,
  maxOffers: 3,
  /** 새 의뢰가 들어오는 간격(초) */
  offerEvery: 45,
  /** 같은 양을 그냥 갈 때보다 더 주는 배율 */
  rewardMult: 2.5,
  /** 시간 안에 못 끝내면 잃는 평판 */
  failRep: 2,
};

/** 평판 1점당 수익 +0.5% (최대 +100%) */
export const repMult = (rep: number) => 1 + Math.min(rep, 200) * 0.005;

// ---------- 지점 확장 (프레스티지) ----------
export const PRESTIGE = {
  /** 이 티어(0부터) 이상 본체가 있어야 함 */
  minTier: 3,
  /** 이번 지점에서 번 돈이 이만큼 있어야 함 */
  minEarned: 200000,
  /** 지점 하나당 영구 수익 배율 */
  perBranch: 0.5,
};

export const branchMult = (branches: number) => 1 + PRESTIGE.perBranch * branches;
