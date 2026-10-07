import { HAZARDS, TEMPLATES } from "../data";
import { createRng } from "../rng";
import type { DocData, Hazard } from "../save";

/**
 * 방해 요소 그림. 서류 이미지 위에 덧그린다 (제거하면 사라져야 하므로 서류 캔버스에 굽지 않음).
 * 좌표는 서류의 mm 좌표 × scale — 작업대의 탭 버튼도 같은 좌표를 쓴다.
 */
export function drawHazards(ctx: CanvasRenderingContext2D, doc: DocData, x: number, y: number, scale: number) {
  if (!doc.hazards.length) return;
  const t = TEMPLATES[doc.template];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  // 구겨짐 → 클립/스테이플/집게 → 투명 파일(맨 위) 순서
  const order = ["crumple", "staple", "clip", "binder", "sleeve"] as const;
  for (const kind of order) {
    for (const h of doc.hazards) {
      if (h.kind !== kind) continue;
      if (h.left <= 0) {
        if (h.kind === "crumple") drawCrumple(ctx, doc.seed, t.width, t.height, 0.25);
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
      }
    }
  }
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
