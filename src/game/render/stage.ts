import { BIN, CUT_GRADES, PAPER_COLORS, TEMPLATES } from "../data";
import type { GameEngine, GameEvent } from "../engine";
import { formatWon } from "../format";
import type { DocData } from "../save";
import { DOC_SCALE, getDocCanvas, releaseDoc } from "./docgen";
import { drawHazards, drawJamCrush } from "./hazards";
import { PiecePool } from "./particles";

export interface StageColors {
  body: string;
  bodyDark: string;
  line: string;
  slot: string;
  binBack: string;
  glass: string;
  primary: string;
  success: string;
  warning: string;
  error: string;
  text: string;
  paper: string;
}

export interface MotionPrefs {
  reduced: boolean;
  shake: boolean;
}

interface Geometry {
  hx: number;
  hw: number;
  hh: number;
  topY: number;
  lidH: number;
  slotY: number;
  slotX0: number;
  slotX1: number;
  /** 카드/CD 전용 슬롯 (없으면 null) */
  cardX0: number | null;
  cardX1: number | null;
  headBottom: number;
  /** 통의 제자리 */
  bx: number;
  bw: number;
  by: number;
  bh: number;
  /** 꺼냈을 때 통 위치 */
  outX: number;
  /** 폐지 수거함 */
  cx: number;
  cy: number;
  cw: number;
  ch: number;
  /** mm → CSS px */
  scale: number;
}

interface Feed {
  doc: DocData;
  canvas: HTMLCanvasElement;
  emitted: number;
  docW: number;
  docH: number;
  x: number;
  dy: number;
}

interface Popup {
  text: string;
  sub?: string;
  x: number;
  y: number;
  t: number;
  big: boolean;
}

interface Puff {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
}

interface Scrap {
  x: number;
  y: number;
  rot: number;
  w: number;
  h: number;
  color: string;
}

type Drag =
  | { kind: "pull"; y0: number; dy: number }
  | { kind: "bag"; x: number; y: number; ox: number; oy: number }
  | { kind: "sweep"; lx: number; ly: number; dist: number };

const MAX_PIECES = 450;
const MAX_PUFFS = 40;
const GRAVITY = 900;
const MAX_FALL = 360;
const PULL_DISTANCE = 28;
const SWEEP_DISTANCE = 70;
const BAG_COLOR = "#1c1f22";
const COLLECTOR = "#848c93";
const COLLECTOR_DARK = "#5d646a";
const HOT = "#9a3a2b";

export class StageRenderer {
  private ctx: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private g!: Geometry;
  private sized = false;
  private pool = new PiecePool(MAX_PIECES);
  private pile: HTMLCanvasElement | null = null;
  private pileCtx: CanvasRenderingContext2D | null = null;
  private pileLevel = 0;
  private feeds: Feed[] = [];
  private popups: Popup[] = [];
  private puffs: Puff[] = [];
  private puffTimer = 0;
  private scraps: Scrap[] = [];
  private sparks: { x: number; y: number; vx: number; vy: number; t: number }[] = [];
  private hoverKey = "";
  private hoverAlpha = 0;
  private time = 0;
  /** 통 현재 위치(애니메이션) */
  private binX = 0;
  private binY = 0;
  /** 수거함 표시 정도 0..1 */
  private collectorAlpha = 0;
  /** 꺼낸 봉투의 채움 (봉투 크기) */
  private bagFill = 0;
  private drag: Drag | null = null;
  private colors: StageColors = {
    body: "#3b4f45",
    bodyDark: "#26332d",
    line: "#2a3540",
    slot: "#0e1411",
    binBack: "#d7d1c3",
    glass: "rgba(255,255,255,0.16)",
    primary: "#2f5d46",
    success: "#2e7d4f",
    warning: "#a35f00",
    error: "#b8322a",
    text: "#1f2a33",
    paper: "#fbf8f1",
  };
  private motion: MotionPrefs = { reduced: false, shake: true };

  constructor(
    private canvas: HTMLCanvasElement,
    private engine: GameEngine,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.pileLevel = engine.data.binFill;
  }

  setColors(c: StageColors) {
    this.colors = c;
  }

  setMotion(m: MotionPrefs) {
    this.motion = m;
  }

  resize(cssW: number, cssH: number) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = cssW;
    this.H = cssH;
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.layout();
    const home = this.binHome();
    this.binX = home.x;
    this.binY = home.y;
    this.sized = true;
    // 크기가 정해지기 전에 지나간 이벤트가 있어도 엔진 상태에 맞춘다
    this.syncPileLevel();
    if (this.engine.emptyStep === "sweep" && !this.scraps.length) this.makeScraps();
    this.rebuildPile();
  }

  /** 봉투를 꺼낸 뒤(수거함/쓸기/새 봉투)에는 통이 비어 있다 */
  private syncPileLevel() {
    const step = this.engine.emptyStep;
    const bagOut = step === "carry" || step === "sweep" || step === "replace";
    this.pileLevel = bagOut ? 0 : this.engine.data.binFill;
  }

  private layout() {
    const { W, H } = this;
    const hw = Math.max(180, Math.min(W * 0.62, 380, H * 0.95));
    const hh = hw * 0.3;
    const lidH = hh * 0.3;
    const binH = Math.max(90, H * 0.34);
    const topY = Math.min(H * 0.44, H - hh - binH - 10);
    const hx = (W - hw) / 2;
    // 전용 슬롯이 있는 본체: 종이 슬롯을 왼쪽으로 줄이고 오른쪽에 카드/CD 슬롯
    const hasSlot = this.engine.tier.slot;
    const slotW = hw * (hasSlot ? 0.56 : 0.76);
    const slotX0 = hasSlot ? hx + hw * 0.045 : (W - slotW) / 2;
    const scale = (slotW * 0.92) / 210;
    const cardW = 130 * scale;
    const cardX1 = hx + hw * 0.955;
    const bw = hw * 0.9;
    const by = topY + hh;
    const bh = H - 8 - by;
    const cw = Math.min(96, W * 0.22);
    const ch = Math.min(bh, 116);
    this.g = {
      hx,
      hw,
      hh,
      topY,
      lidH,
      slotY: topY + lidH * 0.5,
      slotX0,
      slotX1: slotX0 + slotW,
      cardX0: hasSlot ? cardX1 - cardW : null,
      cardX1: hasSlot ? cardX1 : null,
      headBottom: by,
      bx: (W - bw) / 2,
      bw,
      by,
      bh,
      outX: Math.max(6, Math.min(W * 0.3 - bw / 2, W - cw - bw - 24)),
      cx: Math.min(W - cw - 8, W * 0.82 - cw / 2),
      cy: H - 8 - ch,
      cw,
      ch,
      scale,
    };
  }

  /** 이 서류가 들어갈 슬롯의 가운데 x */
  private slotCenter(doc: DocData) {
    const g = this.g;
    if (TEMPLATES[doc.template].slot && g.cardX0 !== null && g.cardX1 !== null) return (g.cardX0 + g.cardX1) / 2;
    return (g.slotX0 + g.slotX1) / 2;
  }

  private binHome() {
    return { x: this.g.bx, y: this.g.by };
  }

  /** 통 안 조각 더미를 따로 모아두는 캔버스 (리사이즈 시 현재 높이만큼 다시 채움) */
  private rebuildPile() {
    const { bw, bh } = this.g;
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bw * this.dpr));
    c.height = Math.max(1, Math.round(bh * this.dpr));
    const ctx = c.getContext("2d")!;
    ctx.scale(this.dpr, this.dpr);
    this.pile = c;
    this.pileCtx = ctx;

    if (this.pileLevel <= 0) return;
    // 지금 컷 등급의 조각 크기로 채움 (작을수록 많이)
    const grade = CUT_GRADES[this.engine.grade];
    const seg = ((grade.segment[0] + grade.segment[1]) / 2) * this.g.scale;
    const sw = grade.stripWidth * this.g.scale;
    const surface = this.surfaceY() - this.g.by;
    const floor = bh - 6;
    const count = Math.min(4000, Math.round(((floor - surface) * bw) / (seg * sw) * 2.2));
    for (let i = 0; i < count; i++) {
      const x = Math.random() * bw;
      const y = surface + Math.random() * (floor - surface);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 2 + (Math.random() - 0.5) * 2);
      ctx.fillStyle = PAPER_COLORS[(Math.random() * PAPER_COLORS.length) | 0];
      ctx.fillRect(-sw / 2, -seg / 2, sw, seg);
      ctx.fillStyle = "rgba(38,48,58,0.35)";
      for (let k = 0; k < 3; k++) ctx.fillRect(-sw / 2, -seg / 2 + Math.random() * seg, sw * 0.8, 0.8);
      ctx.restore();
    }
  }

  /** 더미 표면 y (제자리 기준) */
  private surfaceY() {
    const { by, bh } = this.g;
    return by + bh - 6 - this.pileLevel * (bh - 14);
  }

  handleEvent(e: GameEvent) {
    if (!this.sized) {
      // 그릴 크기가 없어도 더미 높이는 엔진과 맞춰 둔다 (첫 resize 때 다시 그림)
      this.syncPileLevel();
      return;
    }
    switch (e.type) {
      case "tierUp":
        // 본체가 바뀌면 슬롯 배치·종이 배율이 달라진다
        this.layout();
        this.rebuildPile();
        this.popups.push({ text: "새 파쇄기!", sub: CUT_GRADES[this.engine.grade].label, x: this.W / 2, y: this.g.topY - 10, t: 0, big: true });
        break;
      case "reset":
        this.layout();
        this.pool.clear();
        this.feeds = [];
        this.popups = [];
        this.scraps = [];
        this.drag = null;
        this.pileLevel = this.engine.data.binFill;
        this.rebuildPile();
        break;
      case "shredStart": {
        const n = e.docs.length;
        this.feeds = e.docs.map((doc, i) => {
          const t = TEMPLATES[doc.template];
          const w = t.width * this.g.scale;
          return {
            doc,
            canvas: getDocCanvas(doc),
            emitted: 0,
            docW: t.width,
            docH: t.height,
            // 묶음은 살짝 어긋나게 겹쳐 보이게
            x: this.slotCenter(doc) - w / 2 + (i - (n - 1) / 2) * 5,
            dy: -i * 2,
          };
        });
        this.hoverAlpha = 0;
        break;
      }
      case "shredDone":
        for (const f of this.feeds) {
          this.emitUntil(f, 1);
          releaseDoc(f.doc.id);
        }
        this.feeds = [];
        this.popups.push({
          text: `+₩${formatWon(e.reward)}`,
          sub: e.docs.length > 1 ? `${e.docs.length}장` : undefined,
          x: this.g.hx + this.g.hw * 0.86,
          y: this.g.topY - 6,
          t: 0,
          big: e.docs.some((d) => d.rarity !== null),
        });
        break;
      case "jam":
        this.burstSparks(14);
        break;
      case "jamCleared":
        if (e.lost) {
          // 걸린 종이를 뽑아냈다: 남은 부분은 버림
          for (const f of this.feeds) releaseDoc(f.doc.id);
          this.feeds = [];
          this.popups.push({ text: "서류 폐기", x: this.W / 2, y: this.g.topY - 10, t: 0, big: false });
        }
        break;
      case "emptyStep":
        this.drag = null;
        if (e.step === "carry") {
          // 봉투를 통에서 들어 올림: 더미는 봉투와 함께 빠진다
          this.bagFill = this.engine.data.binFill;
          this.pileLevel = 0;
          this.rebuildPile();
        }
        break;
      case "bagBurst":
        this.makeScraps();
        break;
      case "binEmptied":
        this.scraps = [];
        this.pileLevel = this.engine.data.binFill;
        this.rebuildPile();
        if (e.reward > 0) {
          const g = this.g;
          this.popups.push({
            text: `+₩${formatWon(e.reward)}`,
            sub: e.bonus ? `적정 타이밍 ×${BIN.bonusMult}` : "폐지 재활용",
            x: g.cx + g.cw / 2,
            y: g.cy - 10,
            t: 0,
            big: e.bonus,
          });
        }
        break;
    }
  }

  // ---------- 조각 생성 ----------
  private emitUntil(f: Feed, progress: number) {
    const grade = CUT_GRADES[this.engine.grade];
    const target = progress * f.docH;
    while (f.emitted < f.docH - 0.01) {
      let seg = grade.segment[0] + Math.random() * (grade.segment[1] - grade.segment[0]);
      if (f.emitted + seg > f.docH - 8) seg = f.docH - f.emitted;
      if (f.emitted + seg > target && progress < 1) break;
      this.emitBand(f, f.emitted, seg, grade.stripWidth);
      f.emitted += seg;
    }
  }

  private emitBand(f: Feed, from: number, seg: number, stripW: number) {
    const { scale, headBottom } = this.g;
    const fillPerA4 = 1 / this.engine.binCap();
    const cols = Math.ceil(f.docW / stripW);
    for (let c = 0; c < cols; c++) {
      const sw = Math.min(stripW, f.docW - c * stripW);
      const w = sw * scale;
      const h = seg * scale;
      const init = {
        img: f.canvas,
        sx: c * stripW * DOC_SCALE,
        // 종이는 아래쪽부터 슬롯에 들어가므로 아래 부분이 먼저 잘려 나온다
        sy: (f.docH - from - seg) * DOC_SCALE,
        sw: sw * DOC_SCALE,
        sh: seg * DOC_SCALE,
        w,
        h,
        x: f.x + c * stripW * scale + w / 2,
        y: headBottom - h / 2 + 2,
        vx: (Math.random() - 0.5) * 26,
        vy: 30 + Math.random() * 50,
        rot: (Math.random() - 0.5) * 0.08,
        vr: (Math.random() - 0.5) * 2.4,
        floor: this.surfaceY() - Math.random() * 8,
      };
      const p = this.pool.spawn(init);
      if (!p) this.stamp({ ...init, y: init.floor }); // 상한 초과: 떨어지는 연출 없이 바로 더미 표면에 쌓음
      this.pileLevel = Math.min(1, this.pileLevel + ((sw * seg) / (210 * 297)) * fillPerA4);
    }
  }

  private stamp(p: { img: CanvasImageSource; sx: number; sy: number; sw: number; sh: number; w: number; h: number; x: number; y: number; rot: number }) {
    const ctx = this.pileCtx;
    if (!ctx) return;
    ctx.save();
    ctx.translate(p.x - this.g.bx, Math.min(p.y, this.g.by + this.g.bh - 6) - this.g.by);
    // 통 안에서는 엉킨 띠처럼 비스듬히 눕는다
    ctx.rotate(Math.PI / 2 + (Math.random() - 0.5) * 2);
    ctx.drawImage(p.img, p.sx, p.sy, p.sw, p.sh, -p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }

  private makeScraps() {
    const { W, H, g } = this;
    this.scraps = [];
    const sw = 7 * g.scale;
    const count = 70;
    for (let i = 0; i < count; i++) {
      this.scraps.push({
        x: 10 + Math.random() * (W - 20),
        y: H - 8 - Math.random() * Math.min(70, g.bh * 0.6),
        rot: Math.random() * Math.PI,
        w: sw,
        h: (30 + Math.random() * 30) * g.scale,
        color: PAPER_COLORS[(Math.random() * PAPER_COLORS.length) | 0],
      });
    }
  }

  // ---------- 포인터 (통 비우기 직접 조작) ----------
  private bagRect() {
    const g = this.g;
    const w = g.bw * 0.62;
    const h = Math.max(46, g.bh * (0.35 + this.bagFill * 0.4));
    if (this.drag?.kind === "bag") {
      return { x: this.drag.x - this.drag.ox, y: this.drag.y - this.drag.oy, w, h };
    }
    return { x: this.binX + (g.bw - w) / 2, y: this.binY - h * 0.45, w, h };
  }

  /** 지금 이 위치를 누르면 조작이 되는지 (커서 모양/스크롤 차단 판단용) */
  hitTest(x: number, y: number): boolean {
    if (!this.sized) return false;
    const g = this.g;
    // 심한 잼: 슬롯 위로 나와 있는 종이를 탭해서 당긴다
    if (this.engine.current?.jam?.stage === "pull") {
      return x >= g.slotX0 - 10 && x <= (g.cardX1 ?? g.slotX1) + 10 && y >= g.slotY - 160 && y <= g.slotY + 6;
    }
    const inBin = x >= this.binX && x <= this.binX + g.bw && y >= this.binY - 30 && y <= this.binY + g.bh;
    switch (this.engine.emptyStep) {
      case "pull":
      case "tie":
        return inBin;
      case "carry": {
        const b = this.bagRect();
        return x >= b.x - 10 && x <= b.x + b.w + 10 && y >= b.y - 10 && y <= b.y + b.h + 10;
      }
      case "sweep":
        return y >= this.H * 0.45;
      default:
        return false;
    }
  }

  pointerDown(x: number, y: number): boolean {
    if (!this.hitTest(x, y)) return false;
    const engine = this.engine;
    if (engine.current?.jam?.stage === "pull") {
      engine.pullJam();
      return true;
    }
    switch (engine.emptyStep) {
      case "pull":
        this.drag = { kind: "pull", y0: y, dy: 0 };
        return true;
      case "tie":
        engine.tieBag();
        return true;
      case "carry": {
        const b = this.bagRect();
        this.drag = { kind: "bag", x, y, ox: x - b.x, oy: y - b.y };
        return true;
      }
      case "sweep":
        this.drag = { kind: "sweep", lx: x, ly: y, dist: 0 };
        engine.sweepFloor(1);
        return true;
    }
    return false;
  }

  pointerMove(x: number, y: number) {
    const d = this.drag;
    if (!d) return;
    if (d.kind === "pull") {
      d.dy = Math.max(0, y - d.y0);
      if (d.dy >= PULL_DISTANCE) {
        this.drag = null;
        this.engine.pullBin();
      }
    } else if (d.kind === "bag") {
      d.x = x;
      d.y = y;
    } else if (d.kind === "sweep") {
      d.dist += Math.hypot(x - d.lx, y - d.ly);
      d.lx = x;
      d.ly = y;
      if (d.dist >= SWEEP_DISTANCE) {
        d.dist = 0;
        this.engine.sweepFloor(1);
      }
    }
  }

  pointerUp() {
    const d = this.drag;
    this.drag = null;
    if (d?.kind === "bag") {
      const g = this.g;
      const cx = d.x;
      const cy = d.y;
      const pad = 24;
      if (cx >= g.cx - pad && cx <= g.cx + g.cw + pad && cy >= g.cy - pad * 2 && cy <= g.cy + g.ch) {
        this.engine.carryBag();
      }
    }
  }

  // ---------- 프레임 ----------
  frame(dt: number) {
    this.time += dt;
    // 첫 ResizeObserver 콜백 전에는 그릴 크기가 없다
    if (!this.sized) return;
    const { ctx, dpr, engine } = this;

    if (engine.current) {
      const p = engine.current.elapsed / engine.current.duration;
      for (const f of this.feeds) this.emitUntil(f, p);
    }

    this.updatePieces(dt);
    this.updateBinMotion(dt);
    this.updatePuffs(dt);
    this.updateSparks(dt);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);

    const heat = engine.data.heat;
    const shredding = engine.phase === "shredding";
    let amp = 0;
    if (this.motion.shake && !this.motion.reduced) {
      const jammed = engine.current?.jam?.stage === "stuck";
      // 걸렸을 때: 주기적으로 덜컹
      if (jammed) amp = Math.sin(this.time * 9) > 0.6 ? 4 : 0.8;
      else if (shredding) amp = 1.4 + Math.max(0, heat - 70) / 15;
      else if (engine.data.overheated) amp = 0.5;
    }
    const jx = amp ? (Math.random() - 0.5) * amp : 0;
    const jy = amp ? (Math.random() - 0.5) * amp * 0.6 : 0;

    // 통을 꺼내면 본체 앞으로 나와 있으므로 본체보다 나중에 그린다
    const binOut = Math.abs(this.binX - this.g.bx) > 4;
    const drawBinLayer = () => {
      this.drawCollector();
      this.drawBin();
      this.drawPieces();
      this.drawBinFront();
      this.drawBag();
    };
    if (!binOut) drawBinLayer();

    ctx.save();
    ctx.translate(jx, jy);
    this.drawPaper(dt);
    this.drawHead(heat);
    ctx.restore();

    if (binOut) drawBinLayer();

    this.drawScraps();
    this.drawPuffs();
    this.drawSparks();
    this.drawHints();
    this.drawPopups(dt);
  }

  private updatePieces(dt: number) {
    const g = this.g;
    const active = this.pool.active;
    for (let i = active.length - 1; i >= 0; i--) {
      const p = active[i];
      p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);
      p.x += (p.vx + Math.sin(this.time * 7 + p.floor) * 10) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      const minX = g.bx + 6;
      const maxX = g.bx + g.bw - 6;
      if (p.x < minX) {
        p.x = minX;
        p.vx = Math.abs(p.vx);
      } else if (p.x > maxX) {
        p.x = maxX;
        p.vx = -Math.abs(p.vx);
      }
      if (p.y + p.h * 0.25 >= p.floor) {
        this.stamp(p);
        this.pool.release(i);
      }
    }
  }

  private updateBinMotion(dt: number) {
    const g = this.g;
    const step = this.engine.emptyStep;
    const out = step === "tie" || step === "carry" || step === "sweep";
    const tx = out ? g.outX : g.bx;
    let ty = g.by;
    if (this.drag?.kind === "pull") ty += Math.min(this.drag.dy, PULL_DISTANCE + 6);
    if (step === "pull" && !this.drag && !this.motion.reduced) {
      // 손잡이를 아래로 당기라는 살짝 흔들림
      ty += Math.max(0, Math.sin(this.time * 5)) * 3;
    }
    const k = this.motion.reduced ? 1 : 1 - Math.exp(-dt * 12);
    this.binX += (tx - this.binX) * k;
    this.binY += (ty - this.binY) * k;
    const showCollector = step !== null && step !== "pull";
    this.collectorAlpha = Math.max(0, Math.min(1, this.collectorAlpha + (showCollector ? dt : -dt) * 4));
  }

  /** 잼 순간 슬롯에서 튀는 불꽃 (움직임 줄이기 시 생략) */
  private burstSparks(n: number) {
    if (this.motion.reduced) return;
    const g = this.g;
    for (let i = 0; i < n; i++) {
      this.sparks.push({
        x: g.slotX0 + Math.random() * (g.slotX1 - g.slotX0),
        y: g.slotY,
        vx: (Math.random() - 0.5) * 220,
        vy: -60 - Math.random() * 160,
        t: 0,
      });
    }
  }

  private updateSparks(dt: number) {
    const jam = this.engine.current?.jam;
    // 걸려 있는 동안 가끔 튐
    if (jam?.stage === "stuck" && Math.random() < dt * 2.5) this.burstSparks(3);
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.t += dt;
      s.vy += 600 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.t > 0.45) this.sparks.splice(i, 1);
    }
  }

  private drawSparks() {
    const { ctx } = this;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = 2;
    for (const s of this.sparks) {
      ctx.strokeStyle = `rgba(255,${190 - s.t * 200},60,${1 - s.t / 0.45})`;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.02, s.y - s.vy * 0.02);
      ctx.stroke();
    }
    ctx.restore();
  }

  private updatePuffs(dt: number) {
    const g = this.g;
    const engine = this.engine;
    const steaming = engine.data.overheated || engine.data.heat >= 92;
    if (steaming && !this.motion.reduced) {
      this.puffTimer -= dt;
      if (this.puffTimer <= 0 && this.puffs.length < MAX_PUFFS) {
        this.puffTimer = engine.data.overheated ? 0.07 : 0.18;
        const fromSlot = Math.random() < 0.6;
        this.puffs.push({
          x: fromSlot ? g.slotX0 + Math.random() * (g.slotX1 - g.slotX0) : g.hx + 14 + Math.random() * 36,
          y: fromSlot ? g.slotY : g.topY + g.lidH + 4,
          r: 4 + Math.random() * 5,
          vx: (Math.random() - 0.5) * 14,
          vy: -(26 + Math.random() * 26),
          t: 0,
          life: 1 + Math.random() * 0.8,
        });
      }
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += dt * 9;
      if (p.t >= p.life) this.puffs.splice(i, 1);
    }
  }

  // ---------- 그리기 ----------
  private drawCollector() {
    if (this.collectorAlpha <= 0) return;
    const { ctx, g, colors } = this;
    ctx.save();
    ctx.globalAlpha = this.collectorAlpha;
    // 회색 분류함
    ctx.fillStyle = "rgba(31,42,51,0.16)";
    roundRect(ctx, g.cx + 4, g.cy + 4, g.cw, g.ch, 4);
    ctx.fill();
    ctx.fillStyle = COLLECTOR;
    roundRect(ctx, g.cx, g.cy, g.cw, g.ch, 4);
    ctx.fill();
    ctx.fillStyle = COLLECTOR_DARK;
    ctx.fillRect(g.cx - 3, g.cy, g.cw + 6, 12);
    ctx.fillStyle = "#2b2f33";
    ctx.fillRect(g.cx + g.cw * 0.18, g.cy + 3, g.cw * 0.64, 5);
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 2;
    roundRect(ctx, g.cx, g.cy, g.cw, g.ch, 4);
    ctx.stroke();
    // 라벨 (재활용 화살표 + 글자)
    ctx.fillStyle = "#f3f1ea";
    ctx.font = `800 ${Math.max(14, g.cw * 0.18)}px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("폐지", g.cx + g.cw / 2, g.cy + g.ch * 0.55);
    ctx.restore();
  }

  private drawBin() {
    const { ctx, g, colors } = this;
    const x = this.binX;
    const y = this.binY;
    // 납작한 오프셋 그림자 (블러 없음)
    ctx.fillStyle = "rgba(31,42,51,0.14)";
    roundRect(ctx, x + 5, y + 5, g.bw, g.bh, 4);
    ctx.fill();
    ctx.fillStyle = colors.binBack;
    roundRect(ctx, x, y, g.bw, g.bh, 4);
    ctx.fill();
    if (this.pile && this.pileLevel > 0) ctx.drawImage(this.pile, x, y, g.bw, g.bh);
  }

  private drawPieces() {
    const { ctx } = this;
    for (const p of this.pool.active) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.drawImage(p.img, p.sx, p.sy, p.sw, p.sh, -p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
  }

  private drawBinFront() {
    const { ctx, g, colors, engine } = this;
    const x = this.binX;
    const y = this.binY;
    // 투명 폐지통 앞면: 유리 + 하이라이트
    ctx.fillStyle = colors.glass;
    roundRect(ctx, x, y, g.bw, g.bh, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x + g.bw * 0.12, y + g.bh * 0.85);
    ctx.lineTo(x + g.bw * 0.2, y + g.bh * 0.2);
    ctx.stroke();

    // 검은 봉투 테두리: 묶는 중이면 입구가 오므라든다
    const step = engine.emptyStep;
    const bagGone = step === "carry" || step === "sweep";
    if (!bagGone) {
      ctx.fillStyle = BAG_COLOR;
      ctx.fillRect(x + 2, y, g.bw - 4, 7);
      if (step === "tie") {
        const k = engine.tieTaps / BIN.tieTaps;
        const topW = g.bw * (0.9 - 0.7 * k);
        const h = 10 + 18 * k;
        ctx.beginPath();
        ctx.moveTo(x + 4, y + 4);
        ctx.lineTo(x + (g.bw - topW) / 2, y - h);
        ctx.lineTo(x + (g.bw + topW) / 2, y - h);
        ctx.lineTo(x + g.bw - 4, y + 4);
        ctx.closePath();
        ctx.fill();
        if (k > 0) {
          ctx.beginPath();
          ctx.ellipse(x + g.bw / 2, y - h - 3, 6 + 4 * k, 4 + 2 * k, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (step === "replace") {
        // 새 봉투 끼우는 중: 회색 반짝임
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillRect(x + 2, y, g.bw - 4, 3);
      }
    }

    // 손잡이 홈
    ctx.fillStyle = "rgba(31,42,51,0.35)";
    roundRect(ctx, x + g.bw / 2 - 18, y + g.bh - 18, 36, 7, 3.5);
    ctx.fill();

    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, g.bw, g.bh, 4);
    ctx.stroke();

    // 80% 이상: 경고 표시 (같은 내용은 DOM 게이지에도 텍스트로 있음)
    const fill = engine.data.binFill;
    if (!step && fill >= BIN.warnAt) {
      const blink = this.motion.reduced || fill < 1 || Math.floor(this.time * 3) % 2 === 0;
      if (blink) drawWarnTriangle(ctx, x + g.bw - 22, y + 14, fill >= 1 ? colors.error : colors.warning);
    }
  }

  private drawBag() {
    const step = this.engine.emptyStep;
    if (step !== "carry") return;
    const { ctx } = this;
    const b = this.bagRect();
    ctx.save();
    ctx.fillStyle = "rgba(31,42,51,0.18)";
    ctx.beginPath();
    ctx.ellipse(b.x + b.w / 2 + 4, b.y + b.h * 0.62 + 4, b.w / 2, b.h * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    // 봉투 몸통
    ctx.fillStyle = BAG_COLOR;
    ctx.beginPath();
    ctx.moveTo(b.x + b.w * 0.42, b.y + b.h * 0.14);
    ctx.bezierCurveTo(b.x - b.w * 0.05, b.y + b.h * 0.3, b.x, b.y + b.h, b.x + b.w / 2, b.y + b.h);
    ctx.bezierCurveTo(b.x + b.w, b.y + b.h, b.x + b.w * 1.05, b.y + b.h * 0.3, b.x + b.w * 0.58, b.y + b.h * 0.14);
    ctx.closePath();
    ctx.fill();
    // 매듭
    ctx.beginPath();
    ctx.ellipse(b.x + b.w / 2, b.y + b.h * 0.1, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(b.x + b.w / 2, b.y + b.h * 0.08);
    ctx.lineTo(b.x + b.w / 2 - 12, b.y - 4);
    ctx.lineTo(b.x + b.w / 2 - 4, b.y + b.h * 0.04);
    ctx.lineTo(b.x + b.w / 2 + 10, b.y - 6);
    ctx.closePath();
    ctx.fill();
    // 광택
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(b.x + b.w * 0.36, b.y + b.h * 0.6, b.w * 0.22, Math.PI * 0.9, Math.PI * 1.35);
    ctx.stroke();
    ctx.restore();
  }

  private drawPaper(dt: number) {
    const { ctx, g, engine } = this;
    let items: { doc: DocData; canvas: HTMLCanvasElement; x: number; w: number; h: number; dy: number }[] = [];
    let bottom = 0;
    let alpha = 1;
    const jam = engine.current?.jam ?? null;

    if (this.feeds.length && engine.current) {
      const p = Math.min(1, engine.current.elapsed / engine.current.duration);
      // 역회전하면 종이가 조금 올라오고, 손으로 당기면 더 올라온다
      const back = jam ? (jam.stage === "stuck" ? jam.reverse * 14 : 14 + jam.pulled * 12) : 0;
      items = this.feeds.map((f) => {
        const h = f.docH * g.scale;
        return { doc: f.doc, canvas: f.canvas, x: f.x, w: f.docW * g.scale, h, dy: f.dy + p * h - back };
      });
      bottom = g.slotY;
    } else if (engine.phase !== "shredding" && !engine.emptyStep) {
      const batch = engine.batch();
      if (!batch.length) {
        this.hoverKey = "";
        return;
      }
      const key = batch.map((d) => d.id).join(",");
      if (key !== this.hoverKey) {
        this.hoverKey = key;
        this.hoverAlpha = 0;
      }
      this.hoverAlpha = Math.min(1, this.hoverAlpha + dt * 4);
      const n = batch.length;
      items = batch.map((doc, i) => {
        const t = TEMPLATES[doc.template];
        const w = t.width * g.scale;
        return {
          doc,
          canvas: getDocCanvas(doc),
          x: this.slotCenter(doc) - w / 2 + (i - (n - 1) / 2) * 5,
          w,
          h: t.height * g.scale,
          dy: -i * 2,
        };
      });
      const bob = this.motion.reduced ? 0 : Math.sin(this.time * 2.2) * 2;
      bottom = g.slotY - 6 - (1 - this.hoverAlpha) * 14 + bob;
      alpha = this.hoverAlpha;
    }
    if (!items.length) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, this.W, g.slotY);
    ctx.clip();
    ctx.globalAlpha = alpha;
    // 뒤쪽 서류부터 그림 (첫 서류가 맨 앞)
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      const top = bottom - it.h + it.dy;
      ctx.fillStyle = "rgba(31,42,51,0.12)";
      if (it.doc.template !== "cd") ctx.fillRect(it.x + 4, top + 4, it.w, it.h);
      ctx.drawImage(it.canvas, it.x, top, it.w, it.h);
      // 방해 요소도 같은 좌표에 덧그림 (트레이·작업대와 같은 모양)
      drawHazards(ctx, it.doc, it.x, top, g.scale);
    }
    if (jam?.stage === "stuck") {
      const front = items[0];
      drawJamCrush(ctx, front.x - 4, g.slotY, front.w + 8, this.motion.reduced ? 0 : this.time);
    }
    ctx.restore();
  }

  private drawHead(heat: number) {
    const { ctx, g, colors, engine } = this;
    const { hx, hw, hh, topY, lidH } = g;
    // 열이 55%를 넘으면 본체가 붉게 달아오른다
    const hotK = Math.min(1, Math.max(0, (heat - 55) / 45)) * 0.55;

    ctx.fillStyle = "rgba(31,42,51,0.18)";
    roundRect(ctx, hx + 5, topY + 5, hw, hh, 6);
    ctx.fill();

    ctx.fillStyle = mixHex(colors.body, HOT, hotK);
    roundRect(ctx, hx, topY, hw, hh, 6);
    ctx.fill();
    ctx.fillStyle = mixHex(colors.bodyDark, HOT, hotK * 0.7);
    roundRect(ctx, hx - 4, topY, hw + 8, lidH, 4);
    ctx.fill();
    ctx.fillStyle = colors.slot;
    roundRect(ctx, g.slotX0, g.slotY - 2.5, g.slotX1 - g.slotX0, 5, 2.5);
    ctx.fill();
    if (g.cardX0 !== null && g.cardX1 !== null) {
      // 카드/CD 전용 슬롯: 두툼한 테두리 + 작은 이름표
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      roundRect(ctx, g.cardX0 - 4, g.slotY - 6, g.cardX1 - g.cardX0 + 8, 12, 4);
      ctx.fill();
      ctx.fillStyle = colors.slot;
      roundRect(ctx, g.cardX0, g.slotY - 2.5, g.cardX1 - g.cardX0, 5, 2.5);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = `700 ${Math.max(8, hw * 0.022)}px ui-monospace, "SFMono-Regular", Consolas, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("CARD·CD", (g.cardX0 + g.cardX1) / 2, g.slotY + 7);
    }

    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 2;
    roundRect(ctx, hx, topY, hw, hh, 6);
    ctx.stroke();
    roundRect(ctx, hx - 4, topY, hw + 8, lidH, 4);
    ctx.stroke();

    // 통풍구
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    const ventY = topY + lidH + (hh - lidH) * 0.35;
    for (let i = 0; i < 5; i++) {
      const vx = hx + 16 + i * 8;
      ctx.beginPath();
      ctx.moveTo(vx, ventY);
      ctx.lineTo(vx, ventY + (hh - lidH) * 0.38);
      ctx.stroke();
    }

    // 명판
    const plateW = Math.min(110, hw * 0.34);
    const plateX = hx + hw / 2 - plateW / 2;
    const plateY = topY + lidH + (hh - lidH) * 0.3;
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    roundRect(ctx, plateX, plateY, plateW, (hh - lidH) * 0.42, 3);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.font = `700 ${Math.max(10, hw * 0.034)}px ui-monospace, "SFMono-Regular", Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`SHRED·${CUT_GRADES[engine.grade].label.split(" ")[0]}`, hx + hw / 2, plateY + (hh - lidH) * 0.21);

    // 상태 LED (같은 정보는 DOM 텍스트로도 제공)
    let led = colors.success;
    let on = true;
    if (engine.current?.jam) {
      led = colors.error;
      on = this.motion.reduced || Math.floor(this.time * 6) % 2 === 0;
    } else if (engine.data.overheated) {
      led = colors.error;
      on = this.motion.reduced || Math.floor(this.time * 3) % 2 === 0;
    } else if (engine.phase === "shredding") {
      on = this.motion.reduced || Math.floor(this.time * 8) % 2 === 0;
    } else if (engine.phase === "cooldown" || engine.emptyStep) {
      led = colors.warning;
    }
    const lx = hx + hw - 22;
    const ly = topY + lidH + (hh - lidH) * 0.5;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.arc(lx, ly, 6.5, 0, Math.PI * 2);
    ctx.fill();
    if (on) {
      ctx.fillStyle = led;
      ctx.beginPath();
      ctx.arc(lx, ly, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.beginPath();
      ctx.arc(lx - 1.3, ly - 1.3, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawScraps() {
    if (!this.scraps.length) return;
    const { ctx, engine } = this;
    const visible = Math.ceil(this.scraps.length * (engine.sweepLeft / BIN.sweepCount));
    for (let i = 0; i < visible; i++) {
      const s = this.scraps[i];
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.fillStyle = s.color;
      ctx.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
      ctx.fillStyle = "rgba(38,48,58,0.35)";
      ctx.fillRect(-s.w / 2, -s.h * 0.2, s.w * 0.8, 0.8);
      ctx.strokeStyle = "rgba(31,42,51,0.25)";
      ctx.lineWidth = 0.6;
      ctx.strokeRect(-s.w / 2, -s.h / 2, s.w, s.h);
      ctx.restore();
    }
  }

  private drawPuffs() {
    const { ctx } = this;
    for (const p of this.puffs) {
      const k = p.t / p.life;
      ctx.fillStyle = `rgba(235,235,232,${0.55 * (1 - k)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** 지금 할 조작을 화면에 표시 (움직임 줄이기 시엔 정지된 표시) */
  private drawHints() {
    const step = this.engine.emptyStep;
    if (!step || step === "replace") return;
    const { ctx, g, colors } = this;
    const pulse = this.motion.reduced ? 0.5 : (Math.sin(this.time * 5) + 1) / 2;
    ctx.save();
    ctx.strokeStyle = colors.primary;
    ctx.fillStyle = colors.primary;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (step === "pull" && !this.drag) {
      const x = this.binX + g.bw / 2;
      const y = this.binY + g.bh - 40 + pulse * 6;
      ctx.beginPath();
      ctx.moveTo(x, y - 18);
      ctx.lineTo(x, y);
      ctx.moveTo(x - 7, y - 7);
      ctx.lineTo(x, y);
      ctx.lineTo(x + 7, y - 7);
      ctx.stroke();
    } else if (step === "tie") {
      const x = this.binX + g.bw / 2;
      const y = this.binY - 14;
      ctx.globalAlpha = 0.35 + pulse * 0.5;
      ctx.beginPath();
      ctx.arc(x, y, 18 + pulse * 6, 0, Math.PI * 2);
      ctx.stroke();
    } else if (step === "carry" && this.drag?.kind !== "bag") {
      const b = this.bagRect();
      const x0 = b.x + b.w + 6;
      const y0 = b.y + b.h * 0.4;
      const x1 = g.cx - 8;
      const y1 = g.cy + 16;
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -this.time * 20;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo((x0 + x1) / 2, Math.min(y0, y1) - 40, x1, y1);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x1 - 9, y1 - 6);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x1 - 3, y1 - 11);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawPopups(dt: number) {
    const { ctx, colors } = this;
    const life = 1.4;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.lineJoin = "round";
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.t += dt;
      if (p.t >= life) {
        this.popups.splice(i, 1);
        continue;
      }
      const k = p.t / life;
      const rise = this.motion.reduced ? 0 : k * 42;
      ctx.globalAlpha = 1 - k * k;
      ctx.font = `800 ${p.big ? 24 : 18}px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = colors.paper;
      ctx.strokeText(p.text, p.x, p.y - rise);
      ctx.fillStyle = p.big ? "#9a7413" : colors.text;
      ctx.fillText(p.text, p.x, p.y - rise);
      if (p.sub) {
        ctx.font = `700 14px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif`;
        ctx.strokeText(p.sub, p.x, p.y - rise + 18);
        ctx.fillStyle = colors.text;
        ctx.fillText(p.sub, p.x, p.y - rise + 18);
      }
    }
    ctx.globalAlpha = 1;
  }

  dispose() {
    this.pool.clear();
    this.feeds = [];
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawWarnTriangle(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = "#1f2a33";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y - 10);
  ctx.lineTo(x + 11, y + 9);
  ctx.lineTo(x - 11, y + 9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fbfaf5";
  ctx.fillRect(x - 1.2, y - 3.5, 2.4, 7);
  ctx.fillRect(x - 1.2, y + 5, 2.4, 2.2);
  ctx.restore();
}

/** #rrggbb 두 색을 섞음 (형식이 다르면 원래 색 유지) */
function mixHex(a: string, b: string, k: number) {
  if (k <= 0 || !/^#[0-9a-f]{6}$/i.test(a)) return a;
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => {
    const ca = (pa >> shift) & 255;
    const cb = (pb >> shift) & 255;
    return Math.round(ca + (cb - ca) * k);
  };
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
