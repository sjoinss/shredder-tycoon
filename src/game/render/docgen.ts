import { PAPER_COLORS, TEMPLATES } from "../data";
import { createRng, type Rng } from "../rng";
import type { DocData } from "../save";

/** mm → 픽셀 배율. 트레이 썸네일·투입 연출·조각이 모두 이 한 장을 재사용한다. */
export const DOC_SCALE = 2;
const CACHE_LIMIT = 40;

const INK = "#26303a";
const INK_SOFT = "rgba(38,48,58,0.62)";
const INK_FAINT = "rgba(38,48,58,0.32)";
const STAMP_RED = "#b8322a";
const PEN_BLUE = "#2b4c9b";
const ACCENTS = ["#2f5d46", "#23395b", "#7a2e3a", "#8a6a2a", "#4a5a6a"];
const HIGHLIGHTS = ["rgba(250,225,60,0.45)", "rgba(120,220,140,0.38)", "rgba(250,150,190,0.36)"];
const STAMPS = ["접수", "확인", "파기예정", "대외비"];

const cache = new Map<number, HTMLCanvasElement>();
/** 내 이미지 서류: LRU에서 밀려나면 다시 만들 수 없으므로 따로 보관 (파쇄되면 해제) */
const images = new Map<number, HTMLCanvasElement>();

export function registerImageCanvas(id: number, canvas: HTMLCanvasElement) {
  images.set(id, canvas);
}

export function getDocCanvas(doc: DocData): HTMLCanvasElement {
  const img = images.get(doc.id);
  if (img) return img;
  let c = cache.get(doc.id);
  if (c) {
    // 최근 사용으로 갱신 (LRU)
    cache.delete(doc.id);
    cache.set(doc.id, c);
    return c;
  }
  c = drawDoc(doc);
  cache.set(doc.id, c);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return c;
}

/** 파쇄가 끝난 서류는 캐시에서 즉시 해제 (조각이 쥔 참조는 조각이 사라질 때 함께 해제) */
export function releaseDoc(id: number) {
  cache.delete(id);
  images.delete(id);
}

function drawDoc(doc: DocData): HTMLCanvasElement {
  const t = TEMPLATES[doc.template];
  const rng = createRng(doc.seed);
  const canvas = document.createElement("canvas");
  canvas.width = t.width * DOC_SCALE;
  canvas.height = t.height * DOC_SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(DOC_SCALE, DOC_SCALE);
  const g = new Pen(ctx, rng, t.width, t.height);

  // 명함·카드·CD는 종이 서류와 그림이 완전히 다르다
  if (doc.template === "bizcard" || doc.template === "card" || doc.template === "cd") {
    if (doc.template === "bizcard") drawBizcard(ctx, rng, t.width, t.height);
    else if (doc.template === "card") drawCard(ctx, rng, t.width, t.height);
    else drawCd(ctx, rng, t.width);
    return canvas;
  }

  // 종이 바탕
  const paper =doc.template === "receipt" ? (rng.chance(0.7) ? "#f8f7f2" : PAPER_COLORS[1]) : rng.pick(PAPER_COLORS);
  ctx.fillStyle = paper;
  if (doc.template === "receipt") g.receiptShape();
  else ctx.fillRect(0, 0, t.width, t.height);

  if (doc.rarity === "urgent") {
    ctx.fillStyle = "#c23a2f";
    ctx.fillRect(0, 0, t.width, 7);
  }

  switch (doc.template) {
    case "official":
      g.official(doc.rarity === "gold");
      break;
    case "ledger":
      g.ledger();
      break;
    case "receipt":
      g.receipt();
      break;
    case "memo":
      g.memo();
      break;
  }

  g.decorate(doc.template);
  if (doc.rarity === "urgent") g.stamp("긴급", t.width * 0.68, t.height * 0.16, 18, -12);
  if (doc.rarity === "gold") g.goldFrame();
  return canvas;
}

class Pen {
  constructor(
    private ctx: CanvasRenderingContext2D,
    private rng: Rng,
    private w: number,
    private h: number,
  ) {}

  /** 단어처럼 보이는 길이가 다른 막대들로 한 줄을 그림 (읽을 수 없는 글자) */
  textLine(x: number, y: number, width: number, size = 2.2, color = INK_SOFT) {
    const { ctx, rng } = this;
    ctx.fillStyle = color;
    let cx = x;
    const end = x + width;
    while (cx < end - 4) {
      const word = Math.min(rng.range(4, 15), end - cx);
      ctx.fillRect(cx, y, word, size);
      cx += word + rng.range(1.6, 3.2);
    }
  }

  paragraph(x: number, y: number, width: number, lines: number, gap = 6.2) {
    const { rng } = this;
    for (let i = 0; i < lines; i++) {
      const indent = i === 0 ? rng.range(4, 8) : 0;
      const last = i === lines - 1;
      const lw = last ? width * rng.range(0.3, 0.7) : width - rng.range(0, 10);
      this.textLine(x + indent, y + i * gap, lw - indent);
    }
    return y + lines * gap;
  }

  /** 손글씨 같은 구불구불한 선 */
  scribble(x: number, y: number, width: number, color = PEN_BLUE) {
    const { ctx, rng } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.75;
    ctx.lineCap = "round";
    ctx.beginPath();
    let cx = x;
    ctx.moveTo(cx, y);
    while (cx < x + width) {
      const step = rng.range(1.2, 2.6);
      cx += step;
      const amp = rng.range(1.2, 3.2);
      ctx.quadraticCurveTo(cx - step / 2, y - amp, cx, y + rng.range(-0.6, 0.8));
      if (rng.chance(0.08)) {
        cx += rng.range(2.5, 5);
        ctx.moveTo(cx, y);
      }
    }
    ctx.stroke();
  }

  logo(x: number, y: number, color: string) {
    const { ctx, rng } = this;
    ctx.fillStyle = color;
    const kind = rng.int(0, 2);
    if (kind === 0) {
      ctx.beginPath();
      ctx.arc(x + 6, y + 6, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fbfaf5";
      ctx.fillRect(x + 3, y + 5, 6, 2);
    } else if (kind === 1) {
      ctx.fillRect(x, y, 12, 12);
      ctx.fillStyle = "#fbfaf5";
      ctx.beginPath();
      ctx.moveTo(x + 2, y + 10);
      ctx.lineTo(x + 6, y + 2);
      ctx.lineTo(x + 10, y + 10);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(x + 6, y);
      ctx.lineTo(x + 12, y + 12);
      ctx.lineTo(x, y + 12);
      ctx.fill();
    }
    this.textLine(x + 16, y + 3, rng.range(22, 36), 2.6, INK);
    this.textLine(x + 16, y + 8, rng.range(16, 28), 1.4, INK_FAINT);
  }

  stamp(label: string, cx: number, cy: number, size: number, angle: number) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((angle * Math.PI) / 180);
    ctx.globalAlpha = 0.78;
    ctx.strokeStyle = STAMP_RED;
    ctx.fillStyle = STAMP_RED;
    ctx.lineWidth = 1.3;
    ctx.font = `800 ${size * 0.5}px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif`;
    const tw = ctx.measureText(label).width;
    const bw = tw + size * 0.6;
    const bh = size * 0.85;
    ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
    ctx.strokeRect(-bw / 2 + 1.6, -bh / 2 + 1.6, bw - 3.2, bh - 3.2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 0, 1);
    ctx.restore();
  }

  /** 공문 직인 (원형) */
  seal(cx: number, cy: number) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = STAMP_RED;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = STAMP_RED;
    ctx.fillRect(cx - 4.5, cy - 4, 9, 1.6);
    ctx.fillRect(cx - 4.5, cy - 0.5, 9, 1.6);
    ctx.fillRect(cx - 4.5, cy + 3, 9, 1.6);
    ctx.restore();
  }

  official(gold: boolean) {
    const { ctx, rng, w, h } = this;
    const accent = gold ? "#a07a1c" : rng.pick(ACCENTS);
    let y = 16;
    if (rng.chance(0.5)) {
      ctx.fillStyle = accent;
      ctx.fillRect(0, 10, w, 4);
      y = 22;
    }
    this.logo(16, y, accent);
    // 문서 번호 / 날짜
    this.textLine(w - 60, y + 2, 44, 1.6, INK_FAINT);
    this.textLine(w - 60, y + 7, 36, 1.6, INK_FAINT);
    y += 26;
    // 제목
    const titleW = rng.range(70, 120);
    ctx.fillStyle = INK;
    ctx.fillRect((w - titleW) / 2, y, titleW, 5);
    y += 16;
    ctx.fillStyle = INK_FAINT;
    ctx.fillRect(16, y, w - 32, 0.6);
    y += 10;
    const blocks = rng.int(3, 5);
    for (let i = 0; i < blocks && y < h - 70; i++) {
      if (rng.chance(0.35)) {
        ctx.fillStyle = INK;
        ctx.fillRect(18, y, 3, 3);
        this.textLine(24, y, rng.range(40, 70), 2.4, INK);
        y += 9;
      }
      y = this.paragraph(18, y, w - 36, rng.int(2, 6)) + 7;
    }
    // 하단 발신 + 직인
    this.textLine(w / 2 - 32, h - 46, 64, 3, INK);
    this.seal(w / 2 + 44, h - 45);
    this.textLine(16, h - 20, w - 32, 1.2, INK_FAINT);
  }

  ledger() {
    const { ctx, rng, w, h } = this;
    const accent = rng.pick(ACCENTS);
    this.logo(16, 16, accent);
    ctx.fillStyle = INK;
    ctx.fillRect(16, 40, rng.range(60, 90), 4.5);
    const top = 54;
    const cols = rng.int(4, 6);
    const rows = rng.int(14, 22);
    const rowH = Math.min(9.5, (h - top - 50) / (rows + 1));
    const tableW = w - 32;
    const widths: number[] = [];
    let remain = tableW;
    for (let i = 0; i < cols; i++) {
      const cw = i === cols - 1 ? remain : tableW * (i === 0 ? 0.32 : rng.range(0.12, 0.18));
      widths.push(cw);
      remain -= cw;
    }
    // 헤더
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.16;
    ctx.fillRect(16, top, tableW, rowH);
    ctx.globalAlpha = 1;
    // 격자
    ctx.strokeStyle = INK_FAINT;
    ctx.lineWidth = 0.5;
    for (let r = 0; r <= rows + 1; r++) {
      ctx.beginPath();
      ctx.moveTo(16, top + r * rowH);
      ctx.lineTo(16 + tableW, top + r * rowH);
      ctx.stroke();
    }
    let cx = 16;
    for (let c = 0; c <= cols; c++) {
      ctx.beginPath();
      ctx.moveTo(cx, top);
      ctx.lineTo(cx, top + (rows + 1) * rowH);
      ctx.stroke();
      cx += widths[c] ?? 0;
    }
    // 셀 내용: 첫 열은 글자, 나머지는 숫자 같은 짧은 막대(우측 정렬)
    for (let r = 0; r <= rows; r++) {
      cx = 16;
      const y = top + r * rowH + rowH / 2 - 1;
      for (let c = 0; c < cols; c++) {
        const cw = widths[c];
        if (r === 0) {
          ctx.fillStyle = INK;
          ctx.fillRect(cx + 3, y, Math.min(cw - 6, rng.range(10, 20)), 2.2);
        } else if (c === 0) {
          this.textLine(cx + 3, y, Math.min(cw - 6, rng.range(18, cw - 6)), 1.8);
        } else if (rng.chance(0.85)) {
          const nw = rng.range(6, Math.max(7, cw - 8));
          ctx.fillStyle = r === rows ? INK : INK_SOFT;
          ctx.fillRect(cx + cw - 3 - nw, y, nw, r === rows ? 2.4 : 1.8);
        }
        cx += cw;
      }
    }
    const bottom = top + (rows + 1) * rowH;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(16, bottom - rowH);
    ctx.lineTo(16 + tableW, bottom - rowH);
    ctx.stroke();
    this.paragraph(16, bottom + 12, w - 32, 2);
  }

  receiptShape() {
    const { ctx, w, h } = this;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w, h - 4);
    const teeth = 14;
    for (let i = teeth; i >= 0; i--) {
      ctx.lineTo((w / teeth) * i, h - (i % 2 === 0 ? 4 : 0));
    }
    ctx.closePath();
    ctx.fill();
  }

  receipt() {
    const { ctx, rng, w, h } = this;
    const mid = w / 2;
    ctx.fillStyle = INK;
    const nameW = rng.range(30, 46);
    ctx.fillRect(mid - nameW / 2, 12, nameW, 4);
    for (let i = 0; i < 3; i++) {
      const lw = rng.range(26, 50);
      ctx.fillStyle = INK_FAINT;
      ctx.fillRect(mid - lw / 2, 22 + i * 5, lw, 1.5);
    }
    const dash = (y: number) => {
      ctx.fillStyle = INK_FAINT;
      for (let x = 6; x < w - 6; x += 4) ctx.fillRect(x, y, 2, 0.8);
    };
    let y = 42;
    dash(y);
    y += 8;
    const items = rng.int(5, 12);
    for (let i = 0; i < items && y < h - 70; i++) {
      this.textLine(7, y, rng.range(18, 36), 1.7);
      const pw = rng.range(8, 16);
      ctx.fillStyle = INK_SOFT;
      ctx.fillRect(w - 7 - pw, y, pw, 1.7);
      y += 7;
    }
    dash(y + 2);
    y += 10;
    ctx.fillStyle = INK;
    ctx.fillRect(7, y, 16, 3);
    ctx.fillRect(w - 7 - 22, y, 22, 3);
    y += 10;
    dash(y);
    // 바코드
    y += 10;
    let bx = 12;
    while (bx < w - 12) {
      const bw = rng.chance(0.3) ? 1.6 : 0.7;
      ctx.fillStyle = INK;
      ctx.fillRect(bx, y, bw, 14);
      bx += bw + rng.range(0.6, 1.6);
    }
    this.textLine(mid - 22, y + 19, 44, 1.2, INK_FAINT);
  }

  memo() {
    const { ctx, rng, w, h } = this;
    // 메모지 헤더 + 줄
    const accent = rng.pick(ACCENTS);
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(0, 0, w, 14);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(251,250,245,0.85)";
    ctx.fillRect(10, 5.5, 24, 3);
    const lineGap = 9;
    ctx.strokeStyle = "rgba(80,120,170,0.25)";
    ctx.lineWidth = 0.5;
    for (let y = 28; y < h - 10; y += lineGap) {
      ctx.beginPath();
      ctx.moveTo(8, y);
      ctx.lineTo(w - 8, y);
      ctx.stroke();
    }
    const pen = rng.chance(0.65) ? PEN_BLUE : "#2a2a2a";
    const lines = rng.int(6, Math.floor((h - 50) / lineGap));
    for (let i = 0; i < lines; i++) {
      const y = 28 + i * lineGap - 2.2;
      if (rng.chance(0.12)) continue;
      this.scribble(12 + (i === 0 ? 0 : rng.range(0, 6)), y, rng.range(w * 0.35, w - 30), pen);
    }
    // 낙서 동그라미
    if (rng.chance(0.5)) {
      ctx.strokeStyle = pen;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(w * rng.range(0.5, 0.75), h * rng.range(0.6, 0.85), 14, 9, 0.2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /** 공통 랜덤 변주: 형광펜, 체크, 도장, 커피 얼룩, 접힌 자국, 펀치 구멍, 누런 가장자리 */
  decorate(template: string) {
    const { ctx, rng, w, h } = this;
    const isReceipt = template === "receipt";

    if (!isReceipt && rng.chance(0.4)) {
      ctx.fillStyle = rng.pick(HIGHLIGHTS);
      const y = rng.range(h * 0.35, h * 0.75);
      ctx.fillRect(rng.range(14, 30), y - 1.5, rng.range(40, w * 0.6), 5);
    }
    if (rng.chance(0.3)) {
      ctx.strokeStyle = rng.chance(0.5) ? STAMP_RED : PEN_BLUE;
      ctx.lineWidth = 1;
      ctx.lineCap = "round";
      const x = rng.range(6, 14);
      const y = rng.range(h * 0.3, h * 0.8);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 2.5, y + 3);
      ctx.lineTo(x + 7, y - 4);
      ctx.stroke();
    }
    if (!isReceipt && rng.chance(0.35)) {
      this.stamp(rng.pick(STAMPS), w * rng.range(0.6, 0.78), h * rng.range(0.55, 0.75), 16, rng.range(-14, 10));
    }
    if (rng.chance(0.18)) {
      // 커피 얼룩: 옅은 링
      const cx = rng.range(w * 0.2, w * 0.8);
      const cy = rng.range(h * 0.2, h * 0.8);
      const r = rng.range(12, 20);
      ctx.strokeStyle = "rgba(120,80,40,0.22)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, rng.range(0, 1), Math.PI * 2 - rng.range(0, 0.8));
      ctx.stroke();
      ctx.fillStyle = "rgba(120,80,40,0.06)";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!isReceipt && rng.chance(0.3)) {
      // 접힌 자국
      const y = h * (rng.chance(0.5) ? 1 / 3 : 1 / 2);
      const grad = ctx.createLinearGradient(0, y - 3, 0, y + 3);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(0.5, "rgba(60,50,40,0.12)");
      grad.addColorStop(1, "rgba(255,255,255,0.15)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, y - 3, w, 6);
    }
    if (rng.chance(0.25)) {
      // 누런 가장자리
      const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.7);
      grad.addColorStop(0, "rgba(200,170,100,0)");
      grad.addColorStop(1, "rgba(200,170,100,0.28)");
      ctx.fillStyle = grad;
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
    }
    if (!isReceipt && rng.chance(0.3)) {
      // 2공/4공 구멍: 실제로 뚫어서 뒤 배경이 보이게
      ctx.globalCompositeOperation = "destination-out";
      const holes = rng.chance(0.6) ? 2 : 4;
      const spacing = holes === 2 ? 80 : 28;
      const start = h / 2 - (spacing * (holes - 1)) / 2;
      for (let i = 0; i < holes; i++) {
        ctx.beginPath();
        ctx.arc(8, start + i * spacing, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }
  }

  goldFrame() {
    const { ctx, w, h } = this;
    ctx.strokeStyle = "#b8902a";
    ctx.lineWidth = 2.4;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.lineWidth = 0.8;
    ctx.strokeRect(9, 9, w - 18, h - 18);
  }
}

/** 명함: 두꺼운 흰 종이 + 로고 + 이름 막대 + 연락처 줄 */
function drawBizcard(ctx: CanvasRenderingContext2D, rng: Rng, w: number, h: number) {
  const accent = rng.pick(ACCENTS);
  ctx.fillStyle = rng.pick(["#fbfaf5", "#f4f1e8", "#eef1f3"]);
  ctx.fillRect(0, 0, w, h);
  // 왼쪽 색 띠 또는 아래 띠
  ctx.fillStyle = accent;
  if (rng.chance(0.5)) ctx.fillRect(0, 0, 5, h);
  else ctx.fillRect(0, h - 5, w, 5);
  // 로고 (도형 조합)
  ctx.beginPath();
  ctx.arc(16, 15, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(24, 10, 18, 3);
  ctx.fillStyle = INK_SOFT;
  ctx.fillRect(24, 15, 12, 2);
  // 이름 (굵은 막대) + 직함
  ctx.fillStyle = INK;
  ctx.fillRect(w * 0.42, 14, rng.range(22, 32), 4.5);
  ctx.fillStyle = INK_FAINT;
  ctx.fillRect(w * 0.42, 21, rng.range(14, 22), 2);
  // 연락처 줄
  ctx.fillStyle = INK_SOFT;
  for (let i = 0; i < 3; i++) ctx.fillRect(w * 0.42, 30 + i * 4.5, rng.range(24, 40), 1.6);
}

const CARD_COLORS = [
  ["#1d3b6e", "#3c6fb8"],
  ["#2c2f33", "#5a6068"],
  ["#7a1f2b", "#c2414f"],
  ["#1f5c46", "#3f9b77"],
  ["#c9a043", "#ecd28a"],
];

/** 플라스틱 카드: 그라데이션 + IC 칩 자리 + 번호 막대 (실제 번호처럼 보이지 않게 막대로만) */
function drawCard(ctx: CanvasRenderingContext2D, rng: Rng, w: number, h: number) {
  const [a, b] = rng.pick(CARD_COLORS);
  const r = 3.5;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, r);
  ctx.clip();
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, a);
  grad.addColorStop(1, b);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // 무늬 원
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.arc(w * 0.85, h * 0.1, h * 0.6, 0, Math.PI * 2);
  ctx.fill();
  // 칩 자리 (칩 자체는 방해 요소로 덧그림, 여기엔 홈만)
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(11, 18, 14, 11);
  // 번호 막대 4묶음
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  for (let g = 0; g < 4; g++) ctx.fillRect(10 + g * 17, 36, 13, 2.6);
  // 이름 + 브랜드 원
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillRect(10, 44, rng.range(20, 30), 1.8);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.beginPath();
  ctx.arc(w - 16, h - 10, 4.5, 0, Math.PI * 2);
  ctx.arc(w - 10, h - 10, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** CD: 은색 원판 + 무지개 반사 + 가운데 구멍 + 손글씨 라벨 */
function drawCd(ctx: CanvasRenderingContext2D, rng: Rng, size: number) {
  const c = size / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, c - 0.5, 0, Math.PI * 2);
  ctx.arc(c, c, 7.5, 0, Math.PI * 2, true);
  ctx.clip("evenodd");
  ctx.fillStyle = "#d7dbe0";
  ctx.fillRect(0, 0, size, size);
  // 무지개 반사 (원뿔 그라데이션)
  const cone = ctx.createConicGradient(rng.range(0, Math.PI * 2), c, c);
  const stops = ["rgba(255,120,160,0.35)", "rgba(255,230,120,0.35)", "rgba(120,230,180,0.35)", "rgba(120,170,255,0.35)", "rgba(255,120,160,0.35)"];
  stops.forEach((s, i) => cone.addColorStop(i / (stops.length - 1), s));
  ctx.fillStyle = cone;
  ctx.fillRect(0, 0, size, size);
  // 라벨 면 (흰 인쇄면이 있는 CD)
  if (rng.chance(0.5)) {
    ctx.fillStyle = "rgba(250,249,244,0.92)";
    ctx.beginPath();
    ctx.arc(c, c, c - 6, Math.PI * 1.05, Math.PI * 1.95);
    ctx.arc(c, c, 22, Math.PI * 1.95, Math.PI * 1.05, true);
    ctx.fill();
  }
  // 매직 손글씨
  ctx.strokeStyle = rng.pick(["#1d1d1d", "#2b4c9b", "#b8322a"]);
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  let x = c - 26;
  const y = c - 34;
  ctx.moveTo(x, y);
  while (x < c + 26) {
    x += 3;
    ctx.lineTo(x, y + rng.range(-2.5, 2.5));
  }
  ctx.stroke();
  // 안쪽 투명 링
  ctx.restore();
  ctx.strokeStyle = "rgba(90,100,110,0.45)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(c, c, c - 0.5, 0, Math.PI * 2);
  ctx.moveTo(c + 18, c);
  ctx.arc(c, c, 18, 0, Math.PI * 2);
  ctx.moveTo(c + 7.5, c);
  ctx.arc(c, c, 7.5, 0, Math.PI * 2);
  ctx.stroke();
}
