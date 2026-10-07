import {
  BIN,
  CUT_GRADES,
  HAZARDS,
  HAZARD_BONUS,
  HAZARD_CHANCE,
  HAZARD_KINDS,
  HEAT,
  JAM,
  RARITIES,
  TEMPLATES,
  TEMPLATE_IDS,
  UPGRADES,
  arrivalInterval,
  binCapacity,
  coolRate,
  cooldownTime,
  feedCapacity,
  heatMult,
  shredTime,
  traySlots,
  upgradeCost,
  type CutGradeId,
  type HazardKind,
  type RarityId,
  type TemplateId,
  type UpgradeId,
} from "./data";
import { createRng, randomSeed } from "./rng";
import { clearSave, defaultSave, loadSave, writeSave, type DocData, type Hazard, type SaveData } from "./save";

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
  | { type: "binEmptied"; reward: number; bonus: boolean; burst: boolean }
  | { type: "jam"; heavy: boolean }
  | { type: "reverse"; on: boolean }
  | { type: "jamPull"; pulled: number }
  | { type: "jamCleared"; lost: boolean; docs: DocData[] }
  | { type: "hazardTreated"; docId: number; kind: HazardKind; done: boolean }
  | { type: "hazardUnlocked"; kind: HazardKind }
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
  rarityLabel: string | null;
}

export interface JamView {
  heavy: boolean;
  stage: "stuck" | "pull";
  /** 역회전 진행 0..1 */
  reverse: number;
  pulled: number;
}

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
  upgrades: Record<UpgradeId, UpgradeView>;
  affordableCount: number;
  loadError: string | null;
}

const STEP = 1 / 60;
const INCOME_WINDOW = 30;
const SAVE_INTERVAL = 5;
const EMIT_INTERVAL = 0.1;
const REPLACE_TIME = 0.8;
const A4_AREA = 210 * 297;

const pendingHazards = (d: DocData) => d.hazards.filter((h) => h.left > 0);
const removedHazards = (d: DocData) => d.hazards.filter((h) => h.removed).length;

const baseValue = (d: DocData, grade: CutGradeId, treated: number) =>
  Math.round(
    TEMPLATES[d.template].baseValue *
      (d.rarity ? RARITIES[d.rarity].mult : 1) *
      CUT_GRADES[grade].mult *
      (1 + HAZARD_BONUS * treated),
  );

/** 수익: 직접 처리한 방해 요소 하나당 +20% */
export const docValue = (d: DocData, grade: CutGradeId = "P-1") => baseValue(d, grade, removedHazards(d));

/** 처리 안 한 방해 요소가 있을 때 이대로 넣으면 걸릴 확률 */
export function jamChance(d: DocData) {
  let safe = 1;
  for (const h of pendingHazards(d)) safe *= 1 - HAZARDS[h.kind].jam;
  return 1 - safe;
}

const batchJamChance = (docs: DocData[]) => 1 - docs.reduce((s, d) => s * (1 - jamChance(d)), 1);

const docArea = (d: DocData) => (TEMPLATES[d.template].width * TEMPLATES[d.template].height) / A4_AREA;

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
  grade: CutGradeId = "P-1";
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
    const cool = coolRate(d.levels.fan) * (this.phase === "shredding" ? HEAT.shreddingCool : 1);
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

  /** 다음 투입 묶음: 선택한 서류 + 트레이 순서대로 용량만큼 */
  batch(): DocData[] {
    const tray = this.data.tray;
    const cap = feedCapacity(this.data.levels.capacity);
    const first = tray.find((d) => d.id === this.selectedId) ?? tray[0];
    if (!first) return [];
    return [first, ...tray.filter((d) => d !== first)].slice(0, cap);
  }

  feed(): boolean {
    if (this.feedBlock()) return false;
    const docs = this.batch();
    const firstIdx = this.data.tray.indexOf(docs[0]);
    this.data.tray = this.data.tray.filter((d) => !docs.includes(d));

    const maxH = Math.max(...docs.map((d) => TEMPLATES[d.template].height));
    // 여러 장을 한 번에 넣으면 조금 느려진다
    const duration = shredTime(this.data.levels.speed) * (maxH / 297) * (1 + 0.08 * (docs.length - 1));
    const thickness = docs.reduce((s, d) => s + TEMPLATES[d.template].thickness, 0);
    const heat =
      thickness *
      HEAT.perSheet *
      CUT_GRADES[this.grade].heat *
      heatMult(this.data.levels.motor) *
      (this.heatPenalty ? HEAT.earlyPenalty : 1);

    // 처리 안 한 방해 요소가 있으면 중간에 걸릴 수 있다
    let jamAt: number | null = null;
    let heavy = false;
    if (Math.random() < batchJamChance(docs)) {
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
    const reward = docs.reduce((s, doc) => s + docValue(doc, this.grade), 0);
    d.money += reward;
    d.totalEarned += reward;
    const shreddedBefore = d.totalShredded;
    d.totalShredded += docs.length;
    for (const kind of HAZARD_KINDS) {
      const at = HAZARDS[kind].unlockAt;
      if (shreddedBefore < at && d.totalShredded >= at) this.emit({ type: "hazardUnlocked", kind });
    }

    const before = d.binFill;
    const area = docs.reduce((s, doc) => s + docArea(doc), 0);
    d.binFill = Math.min(1, d.binFill + area / binCapacity(d.levels.bin));

    this.incomeLog.push({ t: this.time, amount: reward });
    this.current = null;
    this.phase = "cooldown";
    this.phaseTotal = cooldownTime(d.levels.cooldown);
    this.phaseLeft = this.phaseTotal;
    this.emit({ type: "shredDone", docs, reward });

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
  /** 서류의 방해 요소 하나를 한 번 탭 (다 하면 제거) */
  treatHazard(docId: number, index: number) {
    const doc = this.data.tray.find((d) => d.id === docId);
    const h = doc?.hazards[index];
    if (!doc || !h || h.left <= 0) return;
    if (h.kind !== "sleeve" && doc.hazards.some((x) => x.kind === "sleeve" && x.left > 0)) {
      this.fail("먼저 투명 파일에서 서류를 꺼내세요");
      return;
    }
    h.left--;
    if (h.left === 0) h.removed = true;
    this.emit({ type: "hazardTreated", docId, kind: h.kind, done: h.left === 0 });
    this.emitChange();
  }

  private makeHazards(seed: number, template: TemplateId): Hazard[] {
    const rng = createRng(seed ^ 0x51ed27);
    const unlocked = HAZARD_KINDS.filter((k) => this.data.totalShredded >= HAZARDS[k].unlockAt);
    // 영수증은 작고 얇아서 구겨짐만
    const kinds = template === "receipt" ? unlocked.filter((k) => k === "crumple") : unlocked;
    if (!kinds.length || !rng.chance(HAZARD_CHANCE)) return [];

    const { width: w, height: h } = TEMPLATES[template];
    const make = (kind: HazardKind, x: number, y: number): Hazard => ({ kind, x, y, left: HAZARDS[kind].taps, removed: false });
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
        out.push(make(kind, w / 2, h / 2));
        break;
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
    const value = fill * binCapacity(this.data.levels.bin) * CUT_GRADES[this.grade].pulpPrice * (bonus ? BIN.bonusMult : 1);
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
    const total = TEMPLATE_IDS.reduce((s, id) => s + TEMPLATES[id].weight, 0);
    let roll = rng.next() * total;
    let template: TemplateId = TEMPLATE_IDS[0];
    for (const id of TEMPLATE_IDS) {
      roll -= TEMPLATES[id].weight;
      if (roll <= 0) {
        template = id;
        break;
      }
    }
    let rarity: RarityId | null = null;
    const r = rng.next();
    if (template === "official" && r < RARITIES.gold.chance * 3) rarity = "gold";
    else if (template !== "receipt" && r > 1 - RARITIES.urgent.chance) rarity = "urgent";
    return { id: this.data.nextDocId++, seed, template, rarity, hazards: this.makeHazards(seed, template) };
  }

  private seedStarterDocs() {
    for (let i = 0; i < 3; i++) this.data.tray.push(this.createDoc());
  }

  // ---------- 저장 ----------
  save() {
    this.saveTimer = 0;
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
          hazards: doc.hazards.map((h) => ({ ...h })),
          value: docValue(doc, this.grade),
          potentialValue: baseValue(doc, this.grade, removedHazards(doc) + pending.length),
          pendingCount: pending.length,
          jamRisk: jamChance(doc),
          templateName: TEMPLATES[doc.template].name,
          rarityLabel: doc.rarity ? RARITIES[doc.rarity].label : null,
        };
      }),
      selectedId: this.selectedId,
      batchIds: this.batch().map((doc) => doc.id),
      batchJamRisk: batchJamChance(this.batch()),
      jam: this.current?.jam ? { ...this.current.jam } : null,
      reversing: this.reversing,
      autoReverse: d.levels.autoReverse > 0,
      nextHazard: (() => {
        const next = HAZARD_KINDS.find((k) => d.totalShredded < HAZARDS[k].unlockAt);
        return next ? { kind: next, at: HAZARDS[next].unlockAt } : null;
      })(),
      capacity: feedCapacity(d.levels.capacity),
      traySlots: traySlots(d.levels.inbox),
      arrivalLeft: this.arrivalLeft,
      arrivalTotal: arrivalInterval(d.levels.inbox),
      heat: d.heat,
      overheated: d.overheated,
      heatPenalty: this.heatPenalty,
      coolEta: d.overheated ? Math.max(0, d.heat - HEAT.resumeAt) / coolRate(d.levels.fan) : 0,
      canEarlyRestart: d.overheated && d.heat <= HEAT.earlyAt,
      binFill: d.binFill,
      binCapacity: binCapacity(d.levels.bin),
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
    };
  }
}
