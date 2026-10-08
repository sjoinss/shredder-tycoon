import { ENVELOPE_OPENED, HAZARDS, PAGE_DOC, TEMPLATES } from "../data";
import { createRng } from "../rng";
import type { DocData, Hazard } from "../save";

/** 테이프 길이: 종이 폭의 70% (작업대 드래그 영역도 같은 값) */
export const TAPE_LENGTH = 0.7;
export const TAPE_WIDTH = 14;
export const POSTIT_SIZE = 38;

/**
 * 방해 요소 그림. 서류 이미지 위에 덧그린다 (제거하면 사라져야 하므로 서류 캔버스에 굽지 않음).
 * 좌표는 서류의 mm 좌표 × scale — 작업대의 탭 버튼도 같은 좌표를 쓴다.
 */
export function drawHazards(ctx: CanvasRenderingContext2D, doc: DocData, x: number, y: number, scale: number) {
  if (!doc.hazards.length && !doc.torn) return;
  const t = TEMPLATES[doc.template];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  if (doc.torn) drawTear(ctx, doc.seed, t.width, t.height);
  // 구겨짐 → 클립/스테이플/집게 → 테이프/포스트잇 → 서류를 감싼 것(맨 위) 순서
  const order = ["crumple", "staple", "clip", "binder", "tape", "postit", "chip", "sleeve", "envelope", "album", "case"] as const;
  for (const kind of order) {
    for (const h of doc.hazards) {
      if (h.kind !== kind) continue;
      if (h.left <= 0) {
        if (h.kind === "crumple") drawCrumple(ctx, doc.seed, t.width, t.height, 0.25);
        // 칩을 잘라 낸 자리: 비스듬히 잘린 홈
        if (h.kind === "chip" && h.removed) {
          ctx.fillStyle = "rgba(20,24,28,0.55)";
          ctx.beginPath();
          ctx.moveTo(h.x - 9, h.y - 8);
          ctx.lineTo(h.x + 9, h.y - 6);
          ctx.lineTo(h.x + 8, h.y + 8);
          ctx.lineTo(h.x - 8, h.y + 7);
          ctx.closePath();
          ctx.fill();
        }
        continue;
      }
      switch (h.kind) {
        case "crumple":
          drawCrumple(ctx, doc.seed, t.width, t.height, h.left / HAZARDS.crumple.taps);
          break;
        case "clip":
          drawClip(ctx, h);
          break;
        case "staple":
          drawStaple(ctx, h);
          break;
        case "binder":
          drawBinder(ctx, h);
          break;
        case "sleeve":
          drawSleeve(ctx, t.width, t.height);
          break;
        case "postit":
          drawPostit(ctx, h, doc.seed);
          break;
        case "tape":
          drawTape(ctx, h, t.width, doc.seed);
          break;
        case "envelope":
          drawEnvelope(ctx, h, t.width, t.height, doc.seed);
          break;
        case "album":
          drawAlbumCover(ctx, h, t.width, t.height);
          break;
        case "chip":
          drawChip(ctx, h);
          break;
        case "case":
          drawCdCase(ctx, t.width, t.height);
          break;
      }
    }
  }
  ctx.restore();
}

/** 찢어진 자국: 윗변에서 비스듬히 내려오는 들쭉날쭉한 선 + 살짝 들린 조각 */
function drawTear(ctx: CanvasRenderingContext2D, seed: number, w: number, h: number) {
  const rng = createRng(seed ^ 0x7ea2);
  const pts: [number, number][] = [];
  let px = rng.range(w * 0.3, w * 0.7);
  let py = 0;
  pts.push([px, py]);
  const len = h * rng.range(0.22, 0.34);
  while (py < len) {
    py += rng.range(4, 8);
    px += rng.range(-5, 5);
    pts.push([px, py]);
  }
  ctx.save();
  // 들린 조각 그림자
  ctx.fillStyle = "rgba(31,42,51,0.12)";
  ctx.beginPath();
  ctx.moveTo(pts[0][0], 0);
  for (const [qx, qy] of pts) ctx.lineTo(qx + 2.5, qy);
  ctx.lineTo(pts[0][0] + 14, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(60,50,40,0.75)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [qx, qy] of pts.slice(1)) ctx.lineTo(qx, qy);
  ctx.stroke();
  // 찢긴 종이 섬유 (흰 테두리)
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(pts[0][0] + 1, pts[0][1]);
  for (const [qx, qy] of pts.slice(1)) ctx.lineTo(qx + 1, qy);
  ctx.stroke();
  ctx.restore();
}

const POSTIT_COLORS = ["#f8e27a", "#f7b4c6", "#a9dcf2", "#b9e6a2"];

function drawPostit(ctx: CanvasRenderingContext2D, h: Hazard, seed: number) {
  const rng = createRng(seed ^ 0x9057);
  const s = POSTIT_SIZE;
  ctx.save();
  ctx.translate(h.x + s / 2, h.y + s / 2);
  ctx.rotate(rng.range(-0.08, 0.08));
  ctx.fillStyle = "rgba(31,42,51,0.2)";
  ctx.fillRect(-s / 2 + 1.5, -s / 2 + 2, s, s);
  ctx.fillStyle = rng.pick(POSTIT_COLORS);
  ctx.fillRect(-s / 2, -s / 2, s, s);
  // 접착 띠 (위쪽 약간 진하게)
  ctx.fillStyle = "rgba(0,0,0,0.05)";
  ctx.fillRect(-s / 2, -s / 2, s, 7);
  // 손글씨 낙서
  ctx.strokeStyle = "rgba(43,76,155,0.75)";
  ctx.lineWidth = 0.9;
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const ly = -s / 2 + 13 + i * 7;
    ctx.beginPath();
    ctx.moveTo(-s / 2 + 5, ly);
    let lx = -s / 2 + 5;
    const end = s / 2 - rng.range(6, 16);
    while (lx < end) {
      lx += 3;
      ctx.lineTo(lx, ly + rng.range(-1.2, 1.2));
    }
    ctx.stroke();
  }
  // 아래 모서리가 살짝 말려 올라감
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.beginPath();
  ctx.moveTo(s / 2, s / 2 - 7);
  ctx.lineTo(s / 2 - 7, s / 2);
  ctx.lineTo(s / 2, s / 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawTape(ctx: CanvasRenderingContext2D, h: Hazard, w: number, seed: number) {
  // 남은 양만큼 오른쪽부터 남아 있다 (왼쪽부터 잘라 나감)
  const len = w * TAPE_LENGTH;
  const keep = h.left / HAZARDS.tape.taps;
  const x0 = h.x + len * (1 - keep);
  const x1 = h.x + len;
  const half = TAPE_WIDTH / 2;
  const rng = createRng(seed ^ 0x7a9e);
  ctx.save();
  ctx.fillStyle = "rgba(225,214,170,0.55)";
  ctx.strokeStyle = "rgba(150,130,80,0.45)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  // 왼쪽 끝: 잘린 자리(직선) 또는 손으로 뜯은 지그재그
  ctx.moveTo(x0, h.y - half);
  ctx.lineTo(x1, h.y - half);
  // 오른쪽 끝은 테이프 커터 자국 (톱니)
  for (let i = 0; i <= 6; i++) ctx.lineTo(x1 + (i % 2 ? 1.6 : 0), h.y - half + (TAPE_WIDTH / 6) * i);
  ctx.lineTo(x0, h.y + half);
  if (keep < 1) {
    for (let i = 6; i >= 0; i--) ctx.lineTo(x0 - (i % 2 ? 1.2 : 0), h.y - half + (TAPE_WIDTH / 6) * i);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // 광택 줄 + 갇힌 기포
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillRect(x0, h.y - half + 2, x1 - x0, 1.6);
  for (let i = 0; i < 4; i++) {
    const bx = rng.range(h.x, x1);
    if (bx < x0) continue;
    ctx.beginPath();
    ctx.arc(bx, h.y + rng.range(-3, 3), rng.range(0.8, 1.6), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawEnvelope(ctx: CanvasRenderingContext2D, h: Hazard, w: number, ht: number, seed: number) {
  const opened = h.left <= ENVELOPE_OPENED;
  const rng = createRng(seed ^ 0xe7e1);
  const kraft = rng.chance(0.5);
  const hasWindow = rng.chance(0.5);
  const paper = kraft ? "#d9bf8f" : "#f3f1ea";
  const line = kraft ? "rgba(110,80,40,0.55)" : "rgba(90,100,110,0.5)";
  const m = 3;
  ctx.save();
  // 열렸으면 서류 윗부분이 봉투 위로 삐져나와 보인다 (봉투가 아래로 30mm 내려감)
  const top = opened ? 30 : -m;
  ctx.fillStyle = "rgba(31,42,51,0.18)";
  ctx.fillRect(-m + 2, top + 2, w + m * 2, ht + m - top);
  // 창봉투는 창 자리를 비워 두고 칠한다 (비닐 창으로 서류 일부가 비쳐 보임)
  const win = hasWindow && !opened ? ([w * 0.12, ht * 0.18, w * 0.5, ht * 0.14] as const) : null;
  ctx.fillStyle = paper;
  ctx.beginPath();
  ctx.rect(-m, top, w + m * 2, ht + m - top);
  if (win) ctx.rect(...win);
  ctx.fill("evenodd");
  ctx.strokeStyle = line;
  ctx.lineWidth = 0.8;
  ctx.strokeRect(-m, top, w + m * 2, ht + m - top);
  // 뒷면 접합선 (X자 아래쪽)
  ctx.beginPath();
  ctx.moveTo(-m, ht + m);
  ctx.lineTo(w / 2, top + (ht - top) * 0.55);
  ctx.lineTo(w + m, ht + m);
  ctx.stroke();
  if (win) {
    ctx.fillStyle = "rgba(190,215,235,0.28)";
    ctx.fillRect(...win);
    ctx.strokeStyle = "rgba(90,120,150,0.5)";
    ctx.strokeRect(...win);
  }
  if (!opened) {
    // 덮개 (윗변 삼각형)
    ctx.fillStyle = kraft ? "#cfb07a" : "#e8e5db";
    ctx.beginPath();
    ctx.moveTo(-m, -m);
    ctx.lineTo(w + m, -m);
    ctx.lineTo(w / 2, ht * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.stroke();
    // 뜯은 정도: 윗변을 따라 찢긴 자국이 늘어남
    const torn = HAZARDS.envelope.taps - h.left;
    if (torn > 0) {
      const len = ((w + m * 2) * torn) / (HAZARDS.envelope.taps - ENVELOPE_OPENED);
      ctx.strokeStyle = "rgba(60,50,40,0.7)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-m, -m + 4);
      for (let px = -m; px < -m + len; px += 3) ctx.lineTo(px, -m + 4 + (px % 6 ? 1.4 : -1));
      ctx.stroke();
    }
    // 우표 자리 / 주소 줄
    ctx.strokeStyle = line;
    ctx.strokeRect(w - 34, ht * 0.38, 24, 28);
    ctx.fillStyle = line;
    for (let i = 0; i < 3; i++) ctx.fillRect(w * 0.35, ht * 0.6 + i * 9, w * (0.4 - i * 0.06), 1.4);
  } else {
    // 뜯긴 윗변
    ctx.strokeStyle = "rgba(60,50,40,0.6)";
    ctx.beginPath();
    ctx.moveTo(-m, top);
    for (let px = -m; px <= w + m; px += 3) ctx.lineTo(px, top + (px % 6 ? 1.6 : -1));
    ctx.stroke();
  }
  ctx.restore();
}

function drawAlbumCover(ctx: CanvasRenderingContext2D, h: Hazard, w: number, ht: number) {
  // 남색 PP 앨범 파일 표지 + 왼쪽 등 + 라벨
  const m = 5;
  const total = h.pages?.length ?? 0;
  const left = h.pages?.filter((p) => p === PAGE_DOC).length ?? 0;
  ctx.save();
  ctx.fillStyle = "rgba(31,42,51,0.25)";
  ctx.fillRect(-m + 3, -m + 3, w + m * 2, ht + m * 2);
  ctx.fillStyle = "#2c3f63";
  ctx.fillRect(-m, -m, w + m * 2, ht + m * 2);
  // 페이지 두께 (오른쪽 가장자리)
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  for (let i = 0; i < Math.min(total, 6); i++) ctx.fillRect(w + m - 1 - i * 1.2, -m + 4, 0.6, ht + m * 2 - 8);
  ctx.fillStyle = "#1f2e4b";
  ctx.fillRect(-m, -m, 18, ht + m * 2);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(-m + 18, -m, 2, ht + m * 2);
  // 라벨
  ctx.fillStyle = "#f3f1ea";
  ctx.fillRect(w * 0.3, ht * 0.18, w * 0.52, 40);
  ctx.strokeStyle = "rgba(31,42,51,0.5)";
  ctx.lineWidth = 0.8;
  ctx.strokeRect(w * 0.3, ht * 0.18, w * 0.52, 40);
  ctx.fillStyle = "#26303a";
  ctx.font = "700 13px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("보관 서류", w * 0.56, ht * 0.18 + 14);
  ctx.font = "500 10px sans-serif";
  ctx.fillText(`${left}장 남음`, w * 0.56, ht * 0.18 + 29);
  ctx.restore();
}

/** 구김: 시드 기반 주름선 + 음영. amount 0..1 (펼수록 옅어짐) */
function drawCrumple(ctx: CanvasRenderingContext2D, seed: number, w: number, h: number, amount: number) {
  const rng = createRng(seed ^ 0xc0ffee);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  const lines = 9;
  for (let i = 0; i < lines; i++) {
    let px = rng.range(0, w);
    let py = rng.range(0, h);
    const segs = rng.int(3, 5);
    const pts: [number, number][] = [[px, py]];
    for (let s = 0; s < segs; s++) {
      px += rng.range(-w * 0.35, w * 0.35);
      py += rng.range(-h * 0.25, h * 0.25);
      pts.push([px, py]);
    }
    // 어두운 골 + 밝은 능선
    for (const [color, off] of [
      [`rgba(60,50,40,${0.28 * amount})`, 0],
      [`rgba(255,255,255,${0.5 * amount})`, 1.2],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(pts[0][0] + off, pts[0][1] + off);
      for (const [qx, qy] of pts.slice(1)) ctx.lineTo(qx + off, qy + off);
      ctx.stroke();
    }
  }
  // 면 음영
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(80,70,60,${0.06 * amount})`;
    ctx.beginPath();
    ctx.moveTo(rng.range(0, w), rng.range(0, h));
    ctx.lineTo(rng.range(0, w), rng.range(0, h));
    ctx.lineTo(rng.range(0, w), rng.range(0, h));
    ctx.fill();
  }
  ctx.restore();
}

const METAL = "#9aa3ab";
const METAL_DARK = "#5f676e";

function drawClip(ctx: CanvasRenderingContext2D, h: Hazard) {
  // 종이 윗변에 물린 클립: 겹친 둥근 고리
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [color, width] of [
    [METAL_DARK, 3.2],
    [METAL, 1.9],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(-3, 22);
    ctx.lineTo(-3, -4);
    ctx.arc(1, -4, 4, Math.PI, 0);
    ctx.lineTo(5, 26);
    ctx.arc(0.5, 26, 4.5, 0, Math.PI);
    ctx.lineTo(-4, 6);
    ctx.stroke();
  }
  ctx.restore();
}

function drawStaple(ctx: CanvasRenderingContext2D, h: Hazard) {
  // 모서리에 비스듬히 박힌 스테이플. 한 번 탭하면 들어 올려져 다리가 보인다
  const lifted = h.left < HAZARDS.staple.taps;
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = "rgba(31,42,51,0.25)";
  ctx.fillRect(-6, 0.6, 12, 1.8);
  ctx.fillStyle = METAL_DARK;
  ctx.fillRect(-6.2, -1.2, 12.4, 2.4);
  ctx.fillStyle = METAL;
  ctx.fillRect(-6, -0.9, 12, 1.4);
  if (lifted) {
    ctx.strokeStyle = METAL_DARK;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(-7, -4);
    ctx.moveTo(6, 0);
    ctx.lineTo(7, -4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBinder(ctx: CanvasRenderingContext2D, h: Hazard) {
  // 검은 바인더 클립 + 은색 손잡이 (한 번 탭하면 레버가 열림)
  const open = h.left < HAZARDS.binder.taps;
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.fillStyle = "rgba(31,42,51,0.25)";
  ctx.fillRect(-15, 2, 32, 16);
  ctx.fillStyle = "#1d2125";
  ctx.beginPath();
  ctx.moveTo(-16, -2);
  ctx.lineTo(16, -2);
  ctx.lineTo(13, 15);
  ctx.lineTo(-13, 15);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(-14, 0, 28, 2);
  ctx.strokeStyle = METAL;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (open) {
    ctx.moveTo(-10, 2);
    ctx.lineTo(-14, -14);
    ctx.lineTo(14, -14);
    ctx.lineTo(10, 2);
  } else {
    ctx.moveTo(-10, 2);
    ctx.lineTo(-8, 22);
    ctx.lineTo(8, 22);
    ctx.lineTo(10, 2);
  }
  ctx.stroke();
  ctx.restore();
}

function drawSleeve(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // 투명 클리어 파일: 서류보다 약간 크고, 왼쪽에 펀치 구멍, 광택
  ctx.save();
  ctx.fillStyle = "rgba(190,215,235,0.32)";
  ctx.fillRect(-3, -3, w + 6, h + 6);
  ctx.strokeStyle = "rgba(90,120,150,0.55)";
  ctx.lineWidth = 1;
  ctx.strokeRect(-3, -3, w + 6, h + 6);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.moveTo(w * 0.15, -3);
  ctx.lineTo(w * 0.32, -3);
  ctx.lineTo(w * 0.05, h * 0.4);
  ctx.lineTo(-3, h * 0.4);
  ctx.lineTo(-3, h * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(90,120,150,0.35)";
  for (const py of [h * 0.3, h * 0.5, h * 0.7]) {
    ctx.beginPath();
    ctx.arc(4, py, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 잼 연출: 슬롯 바로 위 종이가 아코디언처럼 구겨진 띠 */
export function drawJamCrush(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, t: number) {
  ctx.save();
  const folds = Math.max(4, Math.round(w / 14));
  ctx.fillStyle = "rgba(240,236,226,0.95)";
  ctx.strokeStyle = "rgba(60,50,40,0.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 0; i <= folds; i++) {
    const px = x + (w / folds) * i;
    const py = y - 6 - (i % 2 ? 5 : 0) - Math.sin(t * 30 + i) * 0.8;
    ctx.lineTo(px, py);
  }
  ctx.lineTo(x + w, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** IC 칩: 금색 접점 (x, y = 중심) */
function drawChip(ctx: CanvasRenderingContext2D, h: Hazard) {
  ctx.save();
  ctx.translate(h.x, h.y);
  const g = ctx.createLinearGradient(-7, -5.5, 7, 5.5);
  g.addColorStop(0, "#e8cf7a");
  g.addColorStop(1, "#b48c32");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(-7, -5.5, 14, 11, 1.6);
  ctx.fill();
  ctx.strokeStyle = "rgba(90,60,10,0.6)";
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-7, 0);
  ctx.lineTo(-2.5, 0);
  ctx.moveTo(2.5, 0);
  ctx.lineTo(7, 0);
  ctx.moveTo(-2.5, -5.5);
  ctx.lineTo(-2.5, 5.5);
  ctx.moveTo(2.5, -5.5);
  ctx.lineTo(2.5, 5.5);
  ctx.moveTo(-2.5, -2.5);
  ctx.lineTo(2.5, -2.5);
  ctx.moveTo(-2.5, 2.5);
  ctx.lineTo(2.5, 2.5);
  ctx.stroke();
  ctx.restore();
}

/** CD 케이스: 투명 플라스틱 사각 + 경첩 + 반사 */
function drawCdCase(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const m = 5;
  ctx.save();
  ctx.fillStyle = "rgba(31,42,51,0.2)";
  ctx.fillRect(-m + 3, -m + 3, w + m * 2, h + m * 2);
  ctx.fillStyle = "rgba(200,215,228,0.38)";
  ctx.fillRect(-m, -m, w + m * 2, h + m * 2);
  ctx.strokeStyle = "rgba(70,90,110,0.7)";
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-m, -m, w + m * 2, h + m * 2);
  // 왼쪽 경첩
  ctx.fillStyle = "rgba(40,50,60,0.55)";
  ctx.fillRect(-m, -m, 9, h + m * 2);
  // 반사
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.moveTo(w * 0.25, -m);
  ctx.lineTo(w * 0.5, -m);
  ctx.lineTo(4, h * 0.5);
  ctx.lineTo(4, h * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
