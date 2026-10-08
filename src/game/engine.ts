import {
  ALBUM,
  BIN,
  REQUESTERS,
  FEEDER_HEAT_LIMIT,
  JANITOR_SHARE,
  OFFLINE,
  ORDERS,
  PRESTIGE,
  branchMult,
  compactorMult,
  feedDelay,
  offlineCapHours,
  recycleMult,
  repMult,
  sorterInterval,
  CONTAINER_KINDS,
  CUT_GRADES,
  ENVELOPE_OPENED,
  HAZARDS,
  HAZARD_BONUS,
  HAZARD_CHANCE,
  HAZARD_KINDS,
  HEAT,
  JAM,
  OVERLOAD_JAM,
  PAGE_DOC,
  PAGE_EMPTY,
  PAGE_TAKEN,
  RARITIES,
  TEMPLATES,
  TEMPLATE_IDS,
  TIERS,
  TORN_MULT,
  UPGRADES,
  arrivalInterval,
  binCapacity,
  coolRate,
  cooldownTime,
  feedCapacity,
  heatMult,
  shredTime,
  tapeCuts,
  traySlots,
  tearChance,
  upgradeCost,
  type CutGradeId,
  type HazardKind,
  type RarityId,
  type TemplateId,
  type UpgradeId,
} from "./data";
import { createRng, randomSeed, type Rng } from "./rng";
import {
  clearSave,
  defaultSave,
  loadSave,
  writeSave,
  type Certificate,
  type DocData,
  type Hazard,
  type Order,
  type SaveData,
} from "./save";

export type Phase = "idle" | "shredding" | "cooldown";
/** 통 비우기 단계: 꺼내기 → 묶기 → 수거함에 넣기 → (터지면 쓸기) → 새 봉투 끼우기 */
export type EmptyStep = "pull" | "tie" | "carry" | "sweep" | "replace";
export type FeedBlock = "loadError" | "emptying" | "overheat" | "binFull" | "busy" | "noDoc" | null;

export type GameEvent =
  | { type: "shredStart"; docs: DocData[]; duration: number }
  | { type: "shredDone"; docs: DocData[]; reward: number }
  | { type: "ready" }
  | { type: "arrive"; doc: DocData }
  | { type: "trayFull" }
  | { type: "buy"; id: UpgradeId; level: number }
  | { type: "buyBags"; count: number }
  | { type: "overheat" }
  | { type: "cooled" }
  | { type: "earlyRestart" }
  | { type: "fanTap" }
  | { type: "binWarn" }
  | { type: "binFull" }
  | { type: "emptyStep"; step: EmptyStep | null }
  | { type: "tieTap"; taps: number }
  | { type: "bagBurst" }
  | { type: "sweep"; left: number }
  | { type: "binEmptied"; reward: number; bonus: boolean; burst: boolean; auto?: boolean }
  | { type: "janitorNoBags" }
  | { type: "orderOffered"; order: Order }
  | { type: "orderAccepted"; order: Order }
  | { type: "orderDone"; order: Order }
  | { type: "orderFailed"; order: Order }
  | { type: "prestige"; certificate: Certificate }
  | { type: "jam"; heavy: boolean }
  | { type: "reverse"; on: boolean }
  | { type: "jamPull"; pulled: number }
  | { type: "jamCleared"; lost: boolean; docs: DocData[] }
  | { type: "hazardTreated"; docId: number; kind: HazardKind; done: boolean; torn?: boolean; auto?: boolean }
  | { type: "hazardUnlocked"; kind: HazardKind }
  | { type: "templateUnlocked"; template: TemplateId }
  | { type: "tierUp"; tier: number }
  | { type: "imageAdded"; doc: DocData }
  | { type: "actionFailed"; reason: string }
  | { type: "saveFailed" }
  | { type: "reset" };

export interface DocView extends DocData {
  value: number;
  /** 남은 방해 요소를 모두 처리했을 때의 수익 */
  potentialValue: number;
  /** 아직 처리 안 한 방해 요소 수 */
  pendingCount: number;
  /** 이대로 넣었을 때 잼 확률 */
  jamRisk: number;
  templateName: string;
  /** 투입 용량을 차지하는 장수 */
  load: number;
  /** 전용 슬롯으로 넣는 물건 */
  slot: boolean;
  rarityLabel: string | null;
}

export interface JamView {
  heavy: boolean;
  stage: "stuck" | "pull";
  /** 역회전 진행 0..1 */
  reverse: number;
  pulled: number;
}

export interface TierView {
  index: number;
  name: string;
  grade: string;
  mult: number;
  capacity: number;
  heat: number;
  slot: boolean;
  perks: string;
}

const tierView = (i: number): TierView => {
  const t = TIERS[i];
  return {
    index: i,
    name: t.name,
    grade: CUT_GRADES[t.grade].label,
    mult: t.mult,
    capacity: t.capacity,
    heat: t.heat,
    slot: t.slot,
    perks: t.perks,
  };
};

export interface UpgradeView {
  id: UpgradeId;
  level: number;
  maxed: boolean;
  cost: number;
  affordable: boolean;
}

export interface Snapshot {
  money: number;
  incomePerSec: number;
  totalEarned: number;
  totalShredded: number;
  phase: Phase;
  phaseLeft: number;
  phaseTotal: number;
  tray: DocView[];
  selectedId: number | null;
  /** 다음 투입에 함께 들어갈 서류 (선택한 서류가 첫 번째) */
  batchIds: number[];
  capacity: number;
  traySlots: number;
  arrivalLeft: number;
  arrivalTotal: number;
  heat: number;
  overheated: boolean;
  heatPenalty: boolean;
  /** 과열 해제까지 예상 시간(초) */
  coolEta: number;
  canEarlyRestart: boolean;
  binFill: number;
  binCapacity: number;
  bags: number;
  bagPackCost: number;
  canBuyBags: boolean;
  recycleEstimate: number;
  recycleBonus: boolean;
  emptyStep: EmptyStep | null;
  tieTaps: number;
  sweepLeft: number;
  feedBlock: FeedBlock;
  /** 다음 투입 묶음의 잼 확률 */
  batchJamRisk: number;
  jam: JamView | null;
  reversing: boolean;
  autoReverse: boolean;
  /** 다음에 등장할 방해 요소 */
  nextHazard: { kind: HazardKind; at: number } | null;
  /** 도구 레벨 (작업대 동작 안내에 사용) */
  tools: ToolLevels;
  /** 파쇄기 본체 */
  tier: TierView;
  nextTier: (TierView & { cost: number; affordable: boolean }) | null;
  upgrades: Record<UpgradeId, UpgradeView>;
  affordableCount: number;
  loadError: string | null;
  reputation: number;
  /** 평판 × 지점 확장 수익 배율 */
  bonusMult: number;
  ordersUnlocked: boolean;
  offers: Order[];
  activeOrder: Order | null;
  branches: number;
  certificates: Certificate[];
  canPrestige: boolean;
  automation: { sorter: number; autoFeed: number; janitor: number };
}

const STEP = 1 / 60;
const INCOME_WINDOW = 30;
const SAVE_INTERVAL = 5;
const EMIT_INTERVAL = 0.1;
const REPLACE_TIME = 0.8;
/** 카드/CD 한 개 파쇄 시간 (기본 한 장 시간의 배수) */
const SLOT_TIME = 2.2;
const A4_AREA = 210 * 297;

const pendingHazards = (d: DocData) => d.hazards.filter((h) => h.left > 0);
const removedHazards = (d: DocData) => d.hazards.filter((h) => h.removed).length;

/** 묶음 장수 (앨범 파일 서류는 여러 장) */
export const docSheets = (d: DocData) => d.sheets ?? 1;

/** 투입 용량을 차지하는 장수 (명함은 1장이 3장 분) */
export const docLoad = (d: DocData) => docSheets(d) * (TEMPLATES[d.template].load ?? 1);
/** 전용 슬롯으로 넣는 물건 (카드/CD) */
export const isSlotDoc = (d: DocData) => !!TEMPLATES[d.template].slot;

const baseValue = (d: DocData, tier: number, treated: number, mult = 1) =>
  Math.round(
    TEMPLATES[d.template].baseValue *
      docSheets(d) *
      (d.rarity ? RARITIES[d.rarity].mult : 1) *
      TIERS[tier].mult *
      CUT_GRADES[TIERS[tier].grade].mult *
      (d.torn ? TORN_MULT : 1) *
      (1 + HAZARD_BONUS * treated) *
      mult,
  );

/** 수익: 직접 처리한 방해 요소 하나당 +20% */
export const docValue = (d: DocData, tier = 0, mult = 1) => baseValue(d, tier, removedHazards(d), mult);

export interface ToolLevels {
  stapleRemover: number;
  cutter: number;
  letterOpener: number;
  scissors: number;
}

/** 방해 요소를 다 처리하는 데 남은 동작 수 (도구 레벨 반영) */
export function actionsLeft(h: Hazard, tools: ToolLevels): number {
  if (h.left <= 0) return 0;
  switch (h.kind) {
    case "staple":
      return tools.stapleRemover > 0 ? 1 : h.left;
    case "tape":
      return Math.ceil(h.left / tapeStep(tools.cutter));
    case "envelope":
      // 열기(오프너면 1번) + 꺼내기 1번
      if (h.left <= ENVELOPE_OPENED) return 1;
      return (tools.letterOpener > 0 ? 1 : h.left - ENVELOPE_OPENED) + 1;
    default:
      return h.left;
  }
}

/** 커터칼 한 번에 줄어드는 테이프 양 */
const tapeStep = (cutterLv: number) => Math.ceil(HAZARDS.tape.taps / tapeCuts(cutterLv));

const isContainer = (kind: HazardKind) => CONTAINER_KINDS.includes(kind);

/** 앨범 파일 페이지 구성: 빈 포켓 사이사이에 서류가 든 페이지 */
function makeAlbumPages(rng: Rng) {
  const count = rng.int(ALBUM.minPages, ALBUM.maxPages);
  const filled = Math.min(count - 1, rng.int(ALBUM.minFilled, ALBUM.maxFilled));
  const pages: number[] = Array(count).fill(PAGE_EMPTY);
  let placed = 0;
  while (placed < filled) {
    const i = rng.int(0, count - 1);
    if (pages[i] === PAGE_EMPTY) {
      pages[i] = PAGE_DOC;
      placed++;
    }
  }
  return pages;
}

/** 처리 안 한 방해 요소가 있을 때 이대로 넣으면 걸릴 확률 (좋은 파쇄기는 클립·스테이플을 그냥 갈아버림) */
export function jamChance(d: DocData, tier = 0) {
  const handles = TIERS[tier].handles;
  let safe = 1;
  for (const h of pendingHazards(d)) safe *= 1 - HAZARDS[h.kind].jam * (handles[h.kind] ?? 1);
  return 1 - safe;
}

/** 용량을 넘겨 억지로 넣을 때의 잼 확률 */
const overloadChance = (load: number, cap: number) => Math.min(0.9, Math.max(0, load - cap) * OVERLOAD_JAM);

const batchJamChance = (docs: DocData[], tier: number, cap: number) => {
  const load = docs.some(isSlotDoc) ? 0 : docs.reduce((s, d) => s + docLoad(d), 0);
  const safe = docs.reduce((s, d) => s * (1 - jamChance(d, tier)), 1) * (1 - overloadChance(load, cap));
  return 1 - safe;
};

const docArea = (d: DocData) => (docSheets(d) * TEMPLATES[d.template].width * TEMPLATES[d.template].height) / A4_AREA;

export class GameEngine {
  data: SaveData;
  phase: Phase = "idle";
  phaseLeft = 0;
  phaseTotal = 0;
  current: {
    docs: DocData[];
    elapsed: number;
    duration: number;
    heat: number;
    /** 이 진행도에서 걸린다 (null이면 안 걸림) */
    jamAt: number | null;
    heavy: boolean;
    jam: JamView | null;
  } | null = null;
  /** 역회전 버튼을 누르고 있는지 */
  reversing = false;
  selectedId: number | null = null;
  arrivalLeft = 0;
  loadError: string | null = null;
  /** 조기 재가동 페널티 (30% 아래로 식으면 해제) */
  heatPenalty = false;
  emptyStep: EmptyStep | null = null;
  tieTaps = 0;
  sweepLeft = 0;

  private replaceLeft = 0;
  private pendingEmpty: { reward: number; bonus: boolean; burst: boolean } | null = null;
  private time = 0;
  private acc = 0;
  private incomeLog: { t: number; amount: number }[] = [];
  private saveTimer = 0;
  private emitTimer = 0;
  private dirty = true;
  private snapshot: Snapshot | null = null;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(e: GameEvent) => void>();
  private saveFailedNotified = false;
  private trayFullNotified = false;

  constructor() {
    const result = loadSave();
    if (result.ok) {
      this.data = result.data;
      if (result.fresh) this.seedStarterDocs();
    } else {
      // 불러오기 실패: 기존 데이터를 덮어쓰지 않도록 저장을 막고 사용자 선택을 기다림
      this.data = defaultSave();
      this.loadError = result.reason;
    }
    this.arrivalLeft = arrivalInterval(this.data.levels.inbox);
    this.selectedId = this.data.tray[0]?.id ?? null;
    if (result.ok && !result.fresh) {
      this.applyOffline();
      // 바로 새로고침해도 같은 시간을 두 번 계산하지 않게 기준 시각을 지금으로
      this.data.lastSeen = Date.now();
      this.save();
    }
  }

  // ---------- 파쇄기 본체 ----------
  get tier() {
    return TIERS[this.data.tier];
  }

  /** 지금 본체의 컷 등급 */
  get grade(): CutGradeId {
    return this.tier.grade;
  }

  /** 한 번에 넣을 수 있는 장수 (본체 기본 + 용량 업그레이드) */
  capacity() {
    return feedCapacity(this.data.levels.capacity, this.data.tier);
  }

  /** 통이 담는 A4 장수 (잘게 자를수록 촘촘히 쌓여 더 들어감) */
  binCap() {
    return Math.round(
      binCapacity(this.data.levels.bin) * CUT_GRADES[this.grade].pack * compactorMult(this.data.levels.compactor),
    );
  }

  /** 다음 본체로 교체 */
  buyTier() {
    const next = this.data.tier + 1;
    const def = TIERS[next];
    if (!def || this.loadError) return false;
    if (this.phase !== "idle" || this.current) return this.fail("파쇄가 끝난 뒤에 교체할 수 있어요");
    if (this.emptyStep) return this.fail("통을 다 비운 뒤에 교체할 수 있어요");
    if (this.data.money < def.cost) return false;
    // 통 안의 조각은 그대로 옮겨 담는다 (양은 같고, 새 통의 비율로 환산)
    const before = this.binCap();
    this.data.money -= def.cost;
    this.data.tier = next;
    this.data.binFill = Math.min(1, (this.data.binFill * before) / this.binCap());
    this.emit({ type: "tierUp", tier: next });
    this.emitChange();
    this.save();
    return true;
  }

  // ---------- 구독 (React useSyncExternalStore) ----------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  onEvent(fn: (e: GameEvent) => void) {
    this.eventListeners.add(fn);
    return () => {
      this.eventListeners.delete(fn);
    };
  }

  getSnapshot = (): Snapshot => {
    if (!this.snapshot || this.dirty) {
      this.snapshot = this.buildSnapshot();
      this.dirty = false;
    }
    return this.snapshot;
  };

  private emitChange() {
    this.dirty = true;
    this.emitTimer = 0;
    this.listeners.forEach((fn) => fn());
  }

  private emit(e: GameEvent) {
    this.eventListeners.forEach((fn) => fn(e));
  }

  private fail(reason: string) {
    this.emit({ type: "actionFailed", reason });
    return false;
  }

  // ---------- 루프 ----------
  /** 실제 경과 시간을 받아 고정 스텝으로 진행 */
  update(dt: number) {
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= STEP) {
      this.step(STEP);
      this.acc -= STEP;
    }
    this.emitTimer += dt;
    if (this.emitTimer >= EMIT_INTERVAL) this.emitChange();
    this.saveTimer += dt;
    if (this.saveTimer >= SAVE_INTERVAL) this.save();
  }

  private step(dt: number) {
    this.time += dt;
    const d = this.data;

    // 열: 파쇄 중에는 서서히 오르고(걸려 있으면 모터 과부하로 더), 항상 식는다 (파쇄 중엔 덜 식음)
    const c = this.current;
    if (this.phase === "shredding" && c) {
      d.heat += c.jam ? JAM.heatPerSec * dt : (c.heat * dt) / c.duration;
    }
    const cool = coolRate(d.levels.fan) * this.tier.cool * (this.phase === "shredding" ? HEAT.shreddingCool : 1);
    d.heat = Math.min(100, Math.max(0, d.heat - cool * dt));
    if (c?.jam && d.heat >= 100 && !d.overheated) {
      d.overheated = true;
      this.emit({ type: "overheat" });
    }
    if (d.heat <= HEAT.resumeAt) {
      this.heatPenalty = false;
      if (d.overheated) {
        d.overheated = false;
        this.emit({ type: "cooled" });
        this.emitChange();
      }
    }

    if (this.phase === "shredding" && c) {
      if (c.jam) {
        this.stepJam(c.jam, dt);
      } else {
        c.elapsed += dt;
        this.phaseLeft = Math.max(0, c.duration - c.elapsed);
        if (c.jamAt !== null && c.elapsed / c.duration >= c.jamAt) {
          c.jamAt = null;
          c.jam = { heavy: c.heavy, stage: "stuck", reverse: 0, pulled: 0 };
          this.emit({ type: "jam", heavy: c.heavy });
          this.emitChange();
        } else if (c.elapsed >= c.duration) this.finishShred();
      }
    } else if (this.phase === "cooldown") {
      this.phaseLeft -= dt;
      if (this.phaseLeft <= 0) {
        this.phase = "idle";
        this.phaseLeft = 0;
        this.emit({ type: "ready" });
        this.emitChange();
      }
    }

    if (this.emptyStep === "replace") {
      this.replaceLeft -= dt;
      if (this.replaceLeft <= 0) this.completeEmpty();
    }

    const slots = traySlots(d.levels.inbox);
    if (d.tray.length < slots) {
      this.trayFullNotified = false;
      this.arrivalLeft -= dt;
      if (this.arrivalLeft <= 0) {
        this.arrivalLeft = arrivalInterval(d.levels.inbox);
        const doc = this.createDoc();
        d.tray.push(doc);
        if (this.selectedId === null) this.selectedId = doc.id;
        this.emit({ type: "arrive", doc });
        this.emitChange();
      }
    } else if (!this.trayFullNotified) {
      this.trayFullNotified = true;
      this.arrivalLeft = arrivalInterval(d.levels.inbox);
      this.emit({ type: "trayFull" });
    }

    if (!this.loadError) {
      this.stepAutomation(dt);
      this.stepOrders(dt);
    }
  }

  // ---------- 자동화 (직원) ----------
  private sorterTimer = 0;
  private feederTimer = 0;
  private janitorWarned = false;

  private stepAutomation(dt: number) {
    const d = this.data;
    // 정리 알바: 일정 간격으로 방해 요소 하나에 한 번 손댐 (작업 중인 선택 서류는 피해서)
    if (d.levels.sorter > 0) {
      this.sorterTimer += dt;
      if (this.sorterTimer >= sorterInterval(d.levels.sorter)) {
        this.sorterTimer = 0;
        this.sorterWork();
      }
    }

    // 급지 담당: 준비되면 잠시 뒤 처리할 게 없는 서류를 넣는다
    if (d.levels.autoFeed > 0 && this.phase === "idle" && !this.feedBlock() && d.heat < FEEDER_HEAT_LIMIT) {
      const safe = d.tray.find((doc) => pendingHazards(doc).length === 0);
      if (safe) {
        this.feederTimer += dt;
        if (this.feederTimer >= feedDelay(d.levels.autoFeed)) {
          this.feederTimer = 0;
          // 사용자가 고른 서류가 안전하면 그대로, 아니면 안전한 서류로 바꿔서 넣는다
          const chosen = d.tray.find((doc) => doc.id === this.selectedId);
          const keep = chosen && pendingHazards(chosen).length === 0;
          const before = this.selectedId;
          if (!keep) this.selectedId = safe.id;
          // 묶음에 위험한 서류가 끼지 않게: 안전한 서류만 남긴 묶음으로 투입
          if (!this.feed(true) && !keep) this.selectedId = before;
        }
      } else this.feederTimer = 0;
    } else this.feederTimer = 0;

    // 청소 담당: 통이 80% 이상이고 파쇄 중이 아니면 비운다
    if (d.levels.janitor > 0 && !this.emptyStep && this.phase !== "shredding" && d.binFill >= BIN.warnAt) {
      if (d.bags <= 0) {
        if (!this.janitorWarned) {
          this.janitorWarned = true;
          this.emit({ type: "janitorNoBags" });
        }
      } else {
        this.janitorWarned = false;
        const { reward } = this.recycleValue(d.binFill);
        const paid = Math.round(reward * JANITOR_SHARE);
        d.binFill = 0;
        d.bags--;
        d.money += paid;
        d.totalEarned += paid;
        this.emit({ type: "binEmptied", reward: paid, bonus: false, burst: false, auto: true });
        this.emitChange();
      }
    }
  }

  /** 정리 알바 한 번: 트레이에서 처리할 수 있는 방해 요소 하나에 손댄다 */
  private sorterWork() {
    // 선택한 서류는 사용자가 만지는 중일 수 있으니 뒤로 미룬다
    const docs = [...this.data.tray].sort((a, b) => Number(a.id === this.selectedId) - Number(b.id === this.selectedId));
    for (const doc of docs) {
      const pending = doc.hazards.map((h, i) => ({ h, i })).filter(({ h }) => h.left > 0);
      if (!pending.length) continue;
      // 감싼 것부터 (안쪽은 꺼낸 뒤에야 만질 수 있음)
      const wrap = pending.find(({ h }) => isContainer(h.kind));
      const pick = wrap ?? pending.find(({ h }) => !HAZARDS[h.kind].tool || this.data.levels[HAZARDS[h.kind].tool!] > 0);
      if (!pick) continue;
      const page = pick.h.kind === "album" ? pick.h.pages?.indexOf(PAGE_DOC) : undefined;
      this.treatHazard(doc.id, pick.i, page, true);
      return;
    }
  }

  // ---------- 요청 ----------
  private offerTimer = 0;

  ordersUnlocked() {
    return this.data.totalShredded >= ORDERS.unlockAt || this.data.branches > 0;
  }

  private stepOrders(dt: number) {
    const o = this.data.orders;
    if (!this.ordersUnlocked()) return;
    if (o.offers.length < ORDERS.maxOffers) {
      this.offerTimer -= dt;
      if (this.offerTimer <= 0) {
        this.offerTimer = ORDERS.offerEvery;
        const order = this.makeOrder();
        o.offers.push(order);
        this.emit({ type: "orderOffered", order });
        this.emitChange();
      }
    }
    const a = o.active;
    if (a) {
      a.left = Math.max(0, a.left - dt);
      if (a.left <= 0) {
        o.active = null;
        this.data.reputation = Math.max(0, this.data.reputation - ORDERS.failRep);
        this.emit({ type: "orderFailed", order: a });
        this.emitChange();
        this.save();
      }
    }
  }

  private makeOrder(): Order {
    const d = this.data;
    const rng = createRng(randomSeed());
    // 지금 받을 수 있는 종이 서류 양식 (카드·CD는 슬롯이 있을 때만)
    const ids = TEMPLATE_IDS.filter((id) => {
      const t = TEMPLATES[id];
      return d.totalShredded >= (t.unlockAt ?? 0) && d.tier >= (t.minTier ?? 0);
    });
    const template = rng.chance(0.4) ? null : rng.pick(ids);
    const minTier = rng.int(0, d.tier);
    const special = template !== null && TEMPLATES[template].slot;
    const base = special ? rng.int(3, 6) : rng.int(12, 30);
    const count = Math.round(base * (1 + d.tier * 0.4) * (template === null ? 1.5 : 1));
    // 지금 장비로 한 장 가는 데 걸리는 대략의 시간 × 여유
    const perSheet = (shredTime(d.levels.speed) * this.tier.time + cooldownTime(d.levels.cooldown)) / Math.max(1, special ? 1 : this.capacity());
    // 이 양식이 도착하는 간격: 전체 도착 간격 ÷ 이 양식의 비중 (아무 서류면 종이 서류 전체 비중)
    const weight = (id: TemplateId) => TEMPLATES[id].weight;
    const total = ids.reduce((sum, id) => sum + weight(id), 0);
    const share =
      template === null ? ids.filter((id) => !TEMPLATES[id].slot).reduce((sum, id) => sum + weight(id), 0) / total : weight(template) / total;
    const arrival = arrivalInterval(d.levels.inbox) / share;
    // 사람은 방해 요소도 처리하고 통도 비우므로 넉넉하게
    const time = Math.round(Math.max(120, count * Math.max(perSheet, arrival) * 2.2) / 10) * 10;
    const value = template === null ? 11 : TEMPLATES[template].baseValue;
    return {
      id: d.orders.nextId++,
      client: rng.pick(REQUESTERS),
      template,
      count,
      minTier,
      time,
      left: time,
      progress: 0,
      reward: Math.round(count * value * TIERS[minTier].mult * ORDERS.rewardMult * this.bonusMult()),
      rep: 1 + Math.floor(count / 15) + minTier,
    };
  }

  acceptOrder(id: number) {
    const o = this.data.orders;
    if (this.loadError) return false;
    if (o.active) return this.fail("이미 진행 중인 요청이 있어요");
    const order = o.offers.find((x) => x.id === id);
    if (!order) return false;
    o.offers = o.offers.filter((x) => x !== order);
    order.left = order.time;
    order.progress = 0;
    o.active = order;
    // 받은 자리는 곧 새 요청으로 채운다
    this.offerTimer = Math.min(this.offerTimer, ORDERS.offerEvery / 3);
    this.emit({ type: "orderAccepted", order });
    this.emitChange();
    this.save();
    return true;
  }

  declineOrder(id: number) {
    const o = this.data.orders;
    o.offers = o.offers.filter((x) => x.id !== id);
    this.emitChange();
  }

  /** 진행 중인 요청 포기 (평판이 깎인다) */
  abandonOrder() {
    const a = this.data.orders.active;
    if (!a) return;
    this.data.orders.active = null;
    this.data.reputation = Math.max(0, this.data.reputation - ORDERS.failRep);
    this.emit({ type: "orderFailed", order: a });
    this.emitChange();
    this.save();
  }

  private progressOrder(docs: DocData[]) {
    const d = this.data;
    const a = d.orders.active;
    if (!a || d.tier < a.minTier) return;
    const n = docs
      .filter((doc) => (a.template === null ? !isSlotDoc(doc) && !doc.image : doc.template === a.template))
      .reduce((s, doc) => s + docSheets(doc), 0);
    if (!n) return;
    a.progress = Math.min(a.count, a.progress + n);
    if (a.progress >= a.count) {
      d.orders.active = null;
      d.money += a.reward;
      d.totalEarned += a.reward;
      d.reputation += a.rep;
      this.emit({ type: "orderDone", order: a });
      this.save();
    }
  }

  /** 평판·지점 확장으로 붙는 수익 배율 */
  bonusMult() {
    return repMult(this.data.reputation) * branchMult(this.data.branches);
  }

  // ---------- 오프라인 수익 ----------
  /** 자리를 비운 동안 번 돈 (Game이 처음 붙을 때 한 번 꺼내 감) */
  private offlineReport: { seconds: number; reward: number; capped: boolean } | null = null;

  takeOfflineReport() {
    const r = this.offlineReport;
    this.offlineReport = null;
    return r;
  }

  /** 급지 담당이 혼자 돌릴 때의 초당 수익 추정 (도착 속도와 파쇄 속도 중 느린 쪽) */
  private estimateRate() {
    const d = this.data;
    const ids = TEMPLATE_IDS.filter((id) => {
      const t = TEMPLATES[id];
      return !t.slot && d.totalShredded >= (t.unlockAt ?? 0);
    });
    const weight = ids.reduce((s, id) => s + TEMPLATES[id].weight, 0);
    const avg = ids.reduce((s, id) => s + TEMPLATES[id].baseValue * TEMPLATES[id].weight, 0) / Math.max(1, weight);
    const perDoc = avg * this.tier.mult * this.bonusMult();
    const cap = this.capacity();
    const cycle =
      shredTime(d.levels.speed) * this.tier.time * 0.85 * (1 + 0.08 * (cap - 1)) +
      cooldownTime(d.levels.cooldown) +
      feedDelay(d.levels.autoFeed);
    const byShred = (perDoc * cap) / cycle;
    const byArrival = perDoc / arrivalInterval(d.levels.inbox);
    return Math.min(byShred, byArrival) * OFFLINE.efficiency;
  }

  /**
   * 자리를 비운 시간만큼 급지 담당 수익을 준다. 불러올 때, 그리고 숨겨졌던 탭이 다시 보일 때
   * (탭이 숨으면 브라우저가 게임 루프를 멈추므로) 부른다.
   */
  catchUp() {
    if (this.loadError) return;
    this.applyOffline();
    this.data.lastSeen = Date.now();
    this.emitChange();
  }

  private applyOffline() {
    const d = this.data;
    if (!d.lastSeen || d.levels.autoFeed <= 0) return;
    const away = (Date.now() - d.lastSeen) / 1000;
    if (!(away >= OFFLINE.minAway)) return;
    const cap = offlineCapHours(d.levels.autoFeed) * 3600;
    const seconds = Math.min(away, cap);
    const reward = Math.round(this.estimateRate() * seconds);
    if (reward <= 0) return;
    d.money += reward;
    d.totalEarned += reward;
    this.offlineReport = { seconds, reward, capped: away > cap };
  }

  // ---------- 지점 확장 (프레스티지) ----------
  canPrestige() {
    return this.data.tier >= PRESTIGE.minTier && this.data.totalEarned >= PRESTIGE.minEarned;
  }

  /** 지금 지점을 정리하고 새 지점을 연다: 진행은 처음부터, 영구 배율 + 파기 증명서 */
  prestige() {
    if (this.loadError || !this.canPrestige()) return false;
    if (this.phase === "shredding" || this.emptyStep) return this.fail("작업을 마친 뒤에 지점을 확장할 수 있어요");
    const old = this.data;
    const branch = old.branches + 1;
    const cert: Certificate = {
      branch,
      date: new Date().toISOString().slice(0, 10),
      shredded: old.totalShredded,
      earned: Math.floor(old.totalEarned),
      tier: old.tier,
    };
    const next = defaultSave();
    next.branches = branch;
    next.certificates = [...old.certificates, cert];
    next.nextDocId = old.nextDocId;
    this.data = next;
    this.seedStarterDocs();
    this.incomeLog = [];
    this.resetTransient();
    this.arrivalLeft = arrivalInterval(0);
    this.save();
    this.emit({ type: "prestige", certificate: cert });
    this.emit({ type: "reset" });
    this.emitChange();
    return true;
  }

  // ---------- 투입 ----------
  select(id: number) {
    if (!this.data.tray.some((d) => d.id === id)) return;
    this.selectedId = id;
    this.emitChange();
  }

  feedBlock(): FeedBlock {
    if (this.loadError) return "loadError";
    if (this.emptyStep) return "emptying";
    if (this.data.overheated) return "overheat";
    if (this.data.binFill >= 1) return "binFull";
    if (this.phase !== "idle") return "busy";
    if (this.data.tray.length === 0) return "noDoc";
    return null;
  }

  /**
   * 다음 투입 묶음: 선택한 서류 + 트레이 순서대로 용량(장수)만큼. 첫 서류는 용량을 넘어도 들어간다(대신 잘 걸림).
   * 카드/CD는 전용 슬롯으로 하나씩만, 종이 묶음에는 끼지 않는다.
   */
  batch(safeOnly = false): DocData[] {
    const tray = this.data.tray;
    const cap = this.capacity();
    const first = tray.find((d) => d.id === this.selectedId) ?? tray[0];
    if (!first) return [];
    if (isSlotDoc(first)) return [first];
    const out = [first];
    let load = docLoad(first);
    for (const d of tray) {
      if (d === first || isSlotDoc(d)) continue;
      if (safeOnly && pendingHazards(d).length > 0) continue;
      if (load + docLoad(d) > cap) continue;
      out.push(d);
      load += docLoad(d);
    }
    return out;
  }

  /** auto: 급지 담당이 넣을 때는 처리할 게 없는 서류만 묶는다 */
  feed(auto = false): boolean {
    if (this.feedBlock()) return false;
    const docs = this.batch(auto);
    const firstIdx = this.data.tray.indexOf(docs[0]);
    this.data.tray = this.data.tray.filter((d) => !docs.includes(d));

    const base = shredTime(this.data.levels.speed) * this.tier.time;
    let duration: number;
    if (isSlotDoc(docs[0])) {
      // 카드/CD는 작아도 단단해서 오래 걸린다
      duration = base * SLOT_TIME;
    } else {
      const maxH = Math.max(...docs.map((d) => TEMPLATES[d.template].height));
      // 여러 장을 한 번에 넣으면 조금 느려진다 (명함 1장 = 3장 분)
      const load = docs.reduce((s, d) => s + docLoad(d), 0);
      duration = base * Math.max(0.35, maxH / 297) * (1 + 0.08 * (load - 1));
    }
    const thickness = docs.reduce((s, d) => s + TEMPLATES[d.template].thickness * docSheets(d), 0);
    const heat =
      Math.pow(thickness, HEAT.batchExp) *
      HEAT.perSheet *
      CUT_GRADES[this.grade].heat *
      this.tier.heat *
      heatMult(this.data.levels.motor) *
      (this.heatPenalty ? HEAT.earlyPenalty : 1);

    // 처리 안 한 방해 요소가 있거나 용량을 넘기면 중간에 걸릴 수 있다
    let jamAt: number | null = null;
    let heavy = false;
    if (Math.random() < batchJamChance(docs, this.data.tier, this.capacity())) {
      jamAt = 0.2 + Math.random() * 0.45;
      const pending = docs.flatMap(pendingHazards);
      heavy = pending.some((h) => HAZARDS[h.kind].heavy) || pending.length >= JAM.heavyCount;
    }

    this.current = { docs, elapsed: 0, duration, heat, jamAt, heavy, jam: null };
    this.phase = "shredding";
    this.phaseLeft = duration;
    this.phaseTotal = duration;
    // 다음 서류 자동 선택 (같은 자리의 서류 → 없으면 첫 서류)
    this.selectedId = (this.data.tray[firstIdx] ?? this.data.tray[0])?.id ?? null;
    this.emit({ type: "shredStart", docs, duration });
    this.emitChange();
    return true;
  }

  private finishShred() {
    const d = this.data;
    const docs = this.current!.docs;
    const mult = this.bonusMult();
    const reward = docs.reduce((s, doc) => s + docValue(doc, d.tier, mult), 0);
    d.money += reward;
    d.totalEarned += reward;
    const shreddedBefore = d.totalShredded;
    d.totalShredded += docs.reduce((s, doc) => s + docSheets(doc), 0);
    for (const kind of HAZARD_KINDS) {
      const at = HAZARDS[kind].unlockAt;
      if (shreddedBefore < at && d.totalShredded >= at) this.emit({ type: "hazardUnlocked", kind });
    }
    for (const id of TEMPLATE_IDS) {
      const at = TEMPLATES[id].unlockAt;
      if (at !== undefined && shreddedBefore < at && d.totalShredded >= at) this.emit({ type: "templateUnlocked", template: id });
    }

    const before = d.binFill;
    const area = docs.reduce((s, doc) => s + docArea(doc), 0);
    d.binFill = Math.min(1, d.binFill + area / this.binCap());

    this.incomeLog.push({ t: this.time, amount: reward });
    this.current = null;
    this.phase = "cooldown";
    this.phaseTotal = cooldownTime(d.levels.cooldown);
    this.phaseLeft = this.phaseTotal;
    this.emit({ type: "shredDone", docs, reward });
    this.progressOrder(docs);

    if (before < BIN.warnAt && d.binFill >= BIN.warnAt && d.binFill < 1) this.emit({ type: "binWarn" });
    if (before < 1 && d.binFill >= 1) this.emit({ type: "binFull" });
    if (d.heat >= 100 && !d.overheated) {
      d.overheated = true;
      this.emit({ type: "overheat" });
    }
    this.emitChange();
  }

  // ---------- 잼 ----------
  private stepJam(jam: JamView, dt: number) {
    if (jam.stage !== "stuck") return;
    const auto = this.data.levels.autoReverse > 0;
    if (auto || this.reversing) {
      jam.reverse += dt / (auto ? JAM.autoReverseTime : JAM.reverseTime);
      if (jam.reverse >= 1) this.reverseDone(jam);
    } else if (jam.reverse > 0) {
      // 손을 떼면 되감긴다: 끝까지 꾹 눌러야 함
      jam.reverse = Math.max(0, jam.reverse - dt);
    }
  }

  private reverseDone(jam: JamView) {
    const c = this.current!;
    jam.reverse = 1;
    // 처리하지 않은 방해 요소는 역회전에 튕겨 나간다 (처리 보너스 없음)
    for (const doc of c.docs) {
      for (const h of doc.hazards) {
        if (h.left > 0) {
          h.left = 0;
          h.removed = false;
        }
      }
    }
    if (jam.heavy) {
      jam.stage = "pull";
      this.emit({ type: "jamPull", pulled: 0 });
    } else {
      c.jam = null;
      this.emit({ type: "jamCleared", lost: false, docs: c.docs });
    }
    this.emitChange();
  }

  /** 역회전 버튼 / R 키를 누르고 있는 동안 true */
  setReversing(on: boolean) {
    if (this.reversing === on) return;
    this.reversing = on;
    this.emit({ type: "reverse", on: on && !!this.current?.jam && this.current.jam.stage === "stuck" });
    this.emitChange();
  }

  /** 심한 잼: 걸린 종이를 손으로 당겨 뺀다 (탭 3번) */
  pullJam() {
    const c = this.current;
    if (!c?.jam || c.jam.stage !== "pull") return;
    c.jam.pulled++;
    this.emit({ type: "jamPull", pulled: c.jam.pulled });
    if (c.jam.pulled >= JAM.pullTaps) {
      // 걸렸던 서류는 망가져서 버린다
      this.current = null;
      this.phase = "cooldown";
      this.phaseTotal = cooldownTime(this.data.levels.cooldown);
      this.phaseLeft = this.phaseTotal;
      this.emit({ type: "jamCleared", lost: true, docs: c.docs });
    }
    this.emitChange();
  }

  // ---------- 방해 요소 ----------
  private tools(): ToolLevels {
    const l = this.data.levels;
    return { stapleRemover: l.stapleRemover, cutter: l.cutter, letterOpener: l.letterOpener, scissors: l.scissors };
  }

  /**
   * 서류의 방해 요소 하나에 한 번 손을 댄다 (다 하면 제거). 도구가 있으면 한 번에 더 많이 처리.
   * 앨범 파일은 꺼낼 페이지 번호를 함께 받는다.
   */
  treatHazard(docId: number, index: number, page?: number, auto = false) {
    const doc = this.data.tray.find((d) => d.id === docId);
    const h = doc?.hazards[index];
    if (!doc || !h || h.left <= 0) return;
    const wrap = doc.hazards.find((x) => x !== h && isContainer(x.kind) && x.left > 0);
    if (wrap && !isContainer(h.kind)) {
      this.fail(`먼저 ${HAZARDS[wrap.kind].name}에서 서류를 꺼내세요`);
      return;
    }
    const need = HAZARDS[h.kind].tool;
    if (need && this.data.levels[need] <= 0) {
      const name = UPGRADES.find((u) => u.id === need)?.name ?? "도구";
      this.fail(`${name}가 있어야 해요. 도구 탭에서 살 수 있어요`);
      return;
    }
    const tools = this.tools();
    let torn = false;
    switch (h.kind) {
      case "staple":
        if (tools.stapleRemover >= 2) {
          // 제거기 Lv.2: 이 서류의 스테이플을 한 번에 전부
          for (const s of doc.hazards) {
            if (s.kind === "staple" && s.left > 0) {
              s.left = 0;
              s.removed = true;
            }
          }
        } else h.left = tools.stapleRemover > 0 ? 0 : h.left - 1;
        break;
      case "tape":
        h.left = Math.max(0, h.left - tapeStep(tools.cutter));
        // 다 떼는 순간 찢어질 수 있다 (커터칼이 좋을수록 덜 찢어짐)
        if (h.left === 0 && !doc.torn && Math.random() < tearChance(tools.cutter)) {
          doc.torn = true;
          torn = true;
        }
        break;
      case "envelope":
        h.left = h.left > ENVELOPE_OPENED && tools.letterOpener > 0 ? ENVELOPE_OPENED : h.left - 1;
        break;
      case "album": {
        const pages = h.pages ?? [];
        if (page === undefined || pages[page] !== PAGE_DOC) {
          this.fail("이 페이지엔 꺼낼 서류가 없어요");
          return;
        }
        pages[page] = PAGE_TAKEN;
        h.left = pages.filter((p) => p === PAGE_DOC).length;
        break;
      }
      default:
        h.left--;
    }
    if (h.left === 0) h.removed = true;
    this.emit({ type: "hazardTreated", docId, kind: h.kind, done: h.left === 0, torn, auto });
    this.emitChange();
  }

  private makeHazard(kind: HazardKind, x: number, y: number): Hazard {
    return { kind, x, y, left: HAZARDS[kind].taps, removed: false };
  }

  private makeHazards(seed: number, template: TemplateId): Hazard[] {
    const rng = createRng(seed ^ 0x51ed27);
    // 카드/CD: 전용 방해 요소만 (칩 카드 절반, 케이스에 든 CD 60%)
    if (template === "card") return rng.chance(0.5) ? [this.makeHazard("chip", 18, 23)] : [];
    if (template === "cd") return rng.chance(0.6) ? [this.makeHazard("case", 60, 60)] : [];
    // 명함은 작고 두꺼워 아무것도 안 붙음
    if (template === "bizcard") return [];
    const unlocked = HAZARD_KINDS.filter((k) => !HAZARDS[k].only && this.data.totalShredded >= HAZARDS[k].unlockAt);
    // 영수증은 작고 얇아서 구겨짐만, 앨범 파일엔 A4만 들어감
    const kinds = unlocked.filter((k) => {
      if (template === "receipt") return k === "crumple";
      if (k === "album") return TEMPLATES[template].height === 297;
      return true;
    });
    if (!kinds.length || !rng.chance(HAZARD_CHANCE)) return [];

    const { width: w, height: h } = TEMPLATES[template];
    const make = (kind: HazardKind, x: number, y: number) => this.makeHazard(kind, x, y);
    const kind = rng.pick(kinds);
    const out: Hazard[] = [];
    switch (kind) {
      case "crumple":
        out.push(make(kind, w / 2, h / 2));
        break;
      case "clip":
        out.push(make(kind, rng.range(w * 0.25, w * 0.75), 0));
        break;
      case "staple":
        // 두 번째 스테이플은 70mm 떨어뜨려 탭 영역(44px)이 모바일에서도 겹치지 않게
        out.push(make(kind, 14, 14));
        if (rng.chance(0.5)) out.push(rng.chance(0.5) ? make(kind, 14, 84) : make(kind, 84, 14));
        break;
      case "binder":
        out.push(make(kind, w / 2, 0));
        break;
      case "sleeve":
      case "envelope":
        out.push(make(kind, w / 2, h / 2));
        break;
      case "postit":
        // 오른쪽 위에 붙은 38mm 정사각 메모지 (x, y = 왼쪽 위)
        out.push(make(kind, rng.range(w - 52, w - 40), rng.range(h * 0.06, h * 0.22)));
        break;
      case "tape":
        // 가로로 붙은 테이프: x는 시작점, 길이는 종이 폭의 70%
        out.push(make(kind, w * 0.15, rng.range(h * 0.3, h * 0.75)));
        break;
      case "album": {
        const a = make(kind, w / 2, h / 2);
        a.pages = makeAlbumPages(rng);
        a.left = a.pages.filter((p) => p === PAGE_DOC).length;
        out.push(a);
        // 앨범 안 서류에는 다른 방해 요소를 붙이지 않음
        return out;
      }
    }
    if (kind !== "crumple" && kinds.includes("crumple") && rng.chance(0.15)) out.push(make("crumple", w / 2, h / 2));
    return out;
  }

  // ---------- 내 이미지 ----------
  /** 이미지 서류 자리 확보 (캔버스를 먼저 등록한 뒤 addDoc) */
  createImageDoc(): DocData {
    return { id: this.data.nextDocId++, seed: randomSeed(), template: "image", rarity: null, hazards: [], image: true };
  }

  addDoc(doc: DocData) {
    this.data.tray.push(doc);
    this.selectedId = doc.id;
    this.emit({ type: "imageAdded", doc });
    this.emitChange();
  }

  // ---------- 열 ----------
  /** 과열 정지 중 부채질 */
  fanTap() {
    if (!this.data.overheated) return;
    this.data.heat = Math.max(0, this.data.heat - HEAT.fanTap);
    this.emit({ type: "fanTap" });
    this.emitChange();
  }

  /** 열이 60% 이하면 다 식기 전에 재가동 (대신 30%로 식을 때까지 열 발생↑) */
  earlyRestart() {
    if (!this.data.overheated || this.data.heat > HEAT.earlyAt) return false;
    this.data.overheated = false;
    this.heatPenalty = true;
    this.emit({ type: "earlyRestart" });
    this.emitChange();
    return true;
  }

  // ---------- 통 비우기 ----------
  private setEmptyStep(step: EmptyStep | null) {
    this.emptyStep = step;
    this.emit({ type: "emptyStep", step });
    this.emitChange();
  }

  startEmpty() {
    if (this.loadError || this.emptyStep) return false;
    if (this.phase === "shredding") return this.fail("파쇄가 끝난 뒤에 통을 꺼낼 수 있어요");
    if (this.data.binFill <= 0) return this.fail("통이 비어 있어요");
    if (this.data.bags <= 0) return this.fail("새 봉투가 없어요. 시설 탭에서 봉투를 사주세요");
    this.setEmptyStep("pull");
    return true;
  }

  cancelEmpty() {
    if (this.emptyStep !== "pull") return;
    this.setEmptyStep(null);
  }

  pullBin() {
    if (this.emptyStep !== "pull") return;
    this.tieTaps = 0;
    this.setEmptyStep("tie");
  }

  tieBag() {
    if (this.emptyStep !== "tie") return;
    this.tieTaps++;
    this.emit({ type: "tieTap", taps: this.tieTaps });
    if (this.tieTaps >= BIN.tieTaps) this.setEmptyStep("carry");
    else this.emitChange();
  }

  private recycleValue(fill: number) {
    const bonus = fill >= BIN.warnAt && fill < 1;
    const value =
      fill * this.binCap() * CUT_GRADES[this.grade].pulpPrice * recycleMult(this.data.levels.recycle) * (bonus ? BIN.bonusMult : 1);
    return { reward: Math.round(value), bonus };
  }

  carryBag() {
    if (this.emptyStep !== "carry") return;
    const d = this.data;
    const fill = d.binFill;
    // 봉투는 이 순간 통에서 빠진다 (새로고침해도 두 번 받지 않도록 즉시 반영)
    d.binFill = 0;
    d.bags = Math.max(0, d.bags - 1);
    if (fill >= BIN.burstFrom && Math.random() < BIN.burstChance) {
      this.pendingEmpty = { reward: 0, bonus: false, burst: true };
      this.sweepLeft = BIN.sweepCount;
      this.emit({ type: "bagBurst" });
      this.setEmptyStep("sweep");
    } else {
      const { reward, bonus } = this.recycleValue(fill);
      d.money += reward;
      d.totalEarned += reward;
      this.pendingEmpty = { reward, bonus, burst: false };
      this.replaceLeft = REPLACE_TIME;
      this.setEmptyStep("replace");
    }
    this.save();
  }

  sweepFloor(amount = 1) {
    if (this.emptyStep !== "sweep") return;
    this.sweepLeft = Math.max(0, this.sweepLeft - amount);
    this.emit({ type: "sweep", left: this.sweepLeft });
    if (this.sweepLeft <= 0) {
      this.replaceLeft = REPLACE_TIME;
      this.setEmptyStep("replace");
    } else this.emitChange();
  }

  private completeEmpty() {
    const result = this.pendingEmpty ?? { reward: 0, bonus: false, burst: false };
    this.pendingEmpty = null;
    this.setEmptyStep(null);
    this.emit({ type: "binEmptied", ...result });
  }

  /** 키보드 E / 단계 버튼: 현재 단계를 한 번 진행 */
  advanceEmpty() {
    switch (this.emptyStep) {
      case null:
        return this.startEmpty();
      case "pull":
        this.pullBin();
        break;
      case "tie":
        this.tieBag();
        break;
      case "carry":
        this.carryBag();
        break;
      case "sweep":
        this.sweepFloor(1);
        break;
    }
    return true;
  }

  buyBags() {
    const cost = BIN.bagPrice * BIN.bagPack;
    if (this.loadError) return false;
    if (this.data.bags + BIN.bagPack > BIN.maxBags) return this.fail("봉투를 더 둘 곳이 없어요");
    if (this.data.money < cost) return false;
    this.data.money -= cost;
    this.data.bags += BIN.bagPack;
    this.emit({ type: "buyBags", count: BIN.bagPack });
    this.emitChange();
    this.save();
    return true;
  }

  // ---------- 업그레이드 ----------
  buy(id: UpgradeId): boolean {
    const def = UPGRADES.find((u) => u.id === id);
    if (!def || this.loadError) return false;
    const level = this.data.levels[id];
    if (level >= def.maxLevel) return false;
    const cost = upgradeCost(def, level);
    if (this.data.money < cost) return false;
    this.data.money -= cost;
    this.data.levels[id] = level + 1;
    if (id === "bin") {
      // 통이 커지면 같은 양이 차지하는 비율은 줄어든다
      const before = binCapacity(level);
      this.data.binFill = (this.data.binFill * before) / binCapacity(level + 1);
    }
    this.emit({ type: "buy", id, level: level + 1 });
    this.emitChange();
    this.save();
    return true;
  }

  // ---------- 서류 생성 ----------
  private createDoc(): DocData {
    const seed = randomSeed();
    const rng = createRng(seed ^ 0x9e3779b9);
    // 해금된 양식만 (명함은 누적 장수, 카드/CD는 전용 슬롯이 있는 본체)
    const ids = TEMPLATE_IDS.filter((id) => {
      const t = TEMPLATES[id];
      return this.data.totalShredded >= (t.unlockAt ?? 0) && this.data.tier >= (t.minTier ?? 0);
    });
    const total = ids.reduce((s, id) => s + TEMPLATES[id].weight, 0);
    let roll = rng.next() * total;
    let template: TemplateId = ids[0];
    for (const id of ids) {
      roll -= TEMPLATES[id].weight;
      if (roll <= 0) {
        template = id;
        break;
      }
    }
    let rarity: RarityId | null = null;
    const r = rng.next();
    if (template === "official" && r < RARITIES.gold.chance * 3) rarity = "gold";
    else if (!["receipt", "bizcard", "card", "cd"].includes(template) && r > 1 - RARITIES.urgent.chance) rarity = "urgent";
    const hazards = this.makeHazards(seed, template);
    const doc: DocData = { id: this.data.nextDocId++, seed, template, rarity, hazards };
    // 앨범 파일: 서류가 든 페이지 수만큼의 뭉치
    const album = hazards.find((h) => h.kind === "album");
    if (album) doc.sheets = album.left;
    return doc;
  }

  private seedStarterDocs() {
    for (let i = 0; i < 3; i++) this.data.tray.push(this.createDoc());
  }

  // ---------- 저장 ----------
  save() {
    this.saveTimer = 0;
    this.data.lastSeen = Date.now();
    if (this.loadError) return;
    // 내 이미지 서류는 저장하지 않는다 (새로고침하면 사라짐)
    const data = { ...this.data, tray: this.data.tray.filter((d) => !d.image) };
    // 파쇄 중이던 서류는 트레이로 되돌려 저장 (새로고침 시 잃지 않게)
    if (this.current) data.tray.unshift(...this.current.docs.filter((d) => !d.image));
    if (!writeSave(data) && !this.saveFailedNotified) {
      this.saveFailedNotified = true;
      this.emit({ type: "saveFailed" });
    }
  }

  private resetTransient() {
    this.phase = "idle";
    this.phaseLeft = 0;
    this.current = null;
    this.heatPenalty = false;
    this.reversing = false;
    this.emptyStep = null;
    this.pendingEmpty = null;
    this.selectedId = this.data.tray[0]?.id ?? null;
  }

  retryLoad() {
    const result = loadSave();
    if (!result.ok) {
      this.loadError = result.reason;
      this.emitChange();
      return false;
    }
    this.data = result.data;
    if (result.fresh) this.seedStarterDocs();
    this.loadError = null;
    this.resetTransient();
    this.emit({ type: "reset" });
    this.emitChange();
    return true;
  }

  reset() {
    clearSave();
    this.data = defaultSave();
    this.seedStarterDocs();
    this.loadError = null;
    this.incomeLog = [];
    this.resetTransient();
    this.arrivalLeft = arrivalInterval(0);
    this.save();
    this.emit({ type: "reset" });
    this.emitChange();
  }

  // ---------- 스냅샷 ----------
  private incomePerSec() {
    const cutoff = this.time - INCOME_WINDOW;
    while (this.incomeLog.length && this.incomeLog[0].t < cutoff) this.incomeLog.shift();
    const sum = this.incomeLog.reduce((s, e) => s + e.amount, 0);
    const window = Math.max(5, Math.min(INCOME_WINDOW, this.time));
    return sum / window;
  }

  private buildSnapshot(): Snapshot {
    const d = this.data;
    const mult = this.bonusMult();
    const upgrades = {} as Record<UpgradeId, UpgradeView>;
    let affordableCount = 0;
    for (const def of UPGRADES) {
      const level = d.levels[def.id];
      const maxed = level >= def.maxLevel;
      const cost = upgradeCost(def, level);
      const affordable = !maxed && d.money >= cost;
      if (affordable) affordableCount++;
      upgrades[def.id] = { id: def.id, level, maxed, cost, affordable };
    }
    const nextTier = TIERS[d.tier + 1];
    if (nextTier && d.money >= nextTier.cost) affordableCount++;
    const bagPackCost = BIN.bagPrice * BIN.bagPack;
    const recycle = this.recycleValue(d.binFill);
    return {
      money: d.money,
      incomePerSec: this.incomePerSec(),
      totalEarned: d.totalEarned,
      totalShredded: d.totalShredded,
      phase: this.phase,
      phaseLeft: this.phaseLeft,
      phaseTotal: this.phaseTotal,
      tray: d.tray.map((doc) => {
        const pending = pendingHazards(doc);
        return {
          ...doc,
          // 렌더 중에 엔진이 바꾸지 않도록 방해 요소는 복사본으로
          hazards: doc.hazards.map((h) => ({ ...h, pages: h.pages && [...h.pages] })),
          value: docValue(doc, d.tier, mult),
          potentialValue: baseValue(doc, d.tier, removedHazards(doc) + pending.length, mult),
          pendingCount: pending.length,
          jamRisk: jamChance(doc, d.tier),
          load: docLoad(doc),
          slot: isSlotDoc(doc),
          templateName: TEMPLATES[doc.template].name,
          rarityLabel: doc.rarity ? RARITIES[doc.rarity].label : null,
        };
      }),
      selectedId: this.selectedId,
      batchIds: this.batch().map((doc) => doc.id),
      batchJamRisk: batchJamChance(this.batch(), d.tier, this.capacity()),
      jam: this.current?.jam ? { ...this.current.jam } : null,
      reversing: this.reversing,
      autoReverse: d.levels.autoReverse > 0,
      nextHazard: (() => {
        const next = HAZARD_KINDS.find((k) => d.totalShredded < HAZARDS[k].unlockAt);
        return next ? { kind: next, at: HAZARDS[next].unlockAt } : null;
      })(),
      tools: this.tools(),
      tier: tierView(d.tier),
      nextTier: TIERS[d.tier + 1]
        ? { ...tierView(d.tier + 1), cost: TIERS[d.tier + 1].cost, affordable: d.money >= TIERS[d.tier + 1].cost }
        : null,
      capacity: this.capacity(),
      traySlots: traySlots(d.levels.inbox),
      arrivalLeft: this.arrivalLeft,
      arrivalTotal: arrivalInterval(d.levels.inbox),
      heat: d.heat,
      overheated: d.overheated,
      heatPenalty: this.heatPenalty,
      coolEta: d.overheated ? Math.max(0, d.heat - HEAT.resumeAt) / (coolRate(d.levels.fan) * this.tier.cool) : 0,
      canEarlyRestart: d.overheated && d.heat <= HEAT.earlyAt,
      binFill: d.binFill,
      binCapacity: this.binCap(),
      bags: d.bags,
      bagPackCost,
      canBuyBags: d.money >= bagPackCost && d.bags + BIN.bagPack <= BIN.maxBags,
      recycleEstimate: recycle.reward,
      recycleBonus: recycle.bonus,
      emptyStep: this.emptyStep,
      tieTaps: this.tieTaps,
      sweepLeft: this.sweepLeft,
      feedBlock: this.feedBlock(),
      upgrades,
      affordableCount,
      loadError: this.loadError,
      reputation: d.reputation,
      bonusMult: mult,
      ordersUnlocked: this.ordersUnlocked(),
      offers: d.orders.offers.map((o) => ({ ...o })),
      activeOrder: d.orders.active ? { ...d.orders.active } : null,
      branches: d.branches,
      certificates: d.certificates,
      canPrestige: this.canPrestige(),
      automation: { sorter: d.levels.sorter, autoFeed: d.levels.autoFeed, janitor: d.levels.janitor },
    };
  }
}
