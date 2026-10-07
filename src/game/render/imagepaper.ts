import { TEMPLATES } from "../data";
import { DOC_SCALE } from "./docgen";

/**
 * 사용자 이미지 → 종이 한 장. 모든 처리는 브라우저 안에서만 하고 서버로 보내거나 저장하지 않는다.
 * 결과 캔버스는 일반 서류와 같은 해상도라 트레이·투입·조각에 그대로 쓰인다.
 */

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const IMAGE_ACCEPT = IMAGE_TYPES.join(",");
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGES_AT_ONCE = 5;
/** 디코딩 단계에서 미리 줄이는 긴 변 (메모리 절약) */
const DECODE_LONG_SIDE = 1600;
const PAPER = "#fbfaf5";

export interface ImagePaperOptions {
  /** contain: 여백 포함(맞춤), cover: 꽉 채움(잘라냄) */
  fit: "contain" | "cover";
  /** 프린트된 종이처럼 채도·대비를 낮춤 */
  print: boolean;
}

export class ImagePaperError extends Error {}

export function checkImageFile(file: File) {
  if (!IMAGE_TYPES.includes(file.type)) {
    throw new ImagePaperError(`"${file.name}"은(는) 지원하지 않는 형식이에요. JPEG, PNG, WebP, GIF 이미지만 쓸 수 있어요.`);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    throw new ImagePaperError(`"${file.name}"이(가) 너무 커요 (${mb}MB). 15MB 이하 이미지를 골라주세요.`);
  }
}

/** 사진 방향(EXIF)을 반영해 디코딩하고 긴 변을 줄인다. GIF는 첫 프레임 */
async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const probe = await createImageBitmap(file, { imageOrientation: "from-image" });
      const k = Math.min(1, DECODE_LONG_SIDE / Math.max(probe.width, probe.height));
      if (k >= 1) return { source: probe, width: probe.width, height: probe.height, close: () => probe.close() };
      const w = Math.round(probe.width * k);
      const h = Math.round(probe.height * k);
      probe.close();
      const bmp = await createImageBitmap(file, {
        imageOrientation: "from-image",
        resizeWidth: w,
        resizeHeight: h,
        resizeQuality: "high",
      });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* 아래 <img> 경로로 재시도 */
    }
  }
  // 대체 경로: <img>는 최신 브라우저에서 EXIF 방향을 기본 반영한다
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } catch {
    throw new ImagePaperError(`"${file.name}"을(를) 읽지 못했어요. 파일이 손상됐을 수 있어요. 다른 이미지로 시도해주세요.`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function makeImagePaper(file: File, opts: ImagePaperOptions): Promise<HTMLCanvasElement> {
  checkImageFile(file);
  const img = await decode(file);
  try {
    const t = TEMPLATES.image;
    const canvas = document.createElement("canvas");
    canvas.width = t.width * DOC_SCALE;
    canvas.height = t.height * DOC_SCALE;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width;
    const H = canvas.height;

    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);

    // 맞춤: 종이 여백(12mm) 안에 비율 유지 / 꽉 채움: 종이 전체를 덮고 넘치는 부분은 잘라냄
    const margin = opts.fit === "contain" ? 12 * DOC_SCALE : 0;
    const boxW = W - margin * 2;
    const boxH = H - margin * 2;
    const k =
      opts.fit === "contain" ? Math.min(boxW / img.width, boxH / img.height) : Math.max(boxW / img.width, boxH / img.height);
    const dw = img.width * k;
    const dh = img.height * k;
    const dx = margin + (boxW - dw) / 2;
    const dy = margin + (boxH - dh) / 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(margin, margin, boxW, boxH);
    ctx.clip();
    ctx.imageSmoothingQuality = "high";
    if (opts.print) {
      // 프린터 잉크 느낌: 채도·대비를 살짝 낮추고 종이색이 비치게
      ctx.filter = "saturate(0.82) contrast(0.92) brightness(1.02)";
      ctx.globalAlpha = 0.93;
    }
    ctx.drawImage(img.source, dx, dy, dw, dh);
    ctx.restore();

    if (opts.print) {
      // 종이 결: 아주 옅은 점 잡음 (시드 고정으로 매번 같은 모양)
      let s = 1234567;
      const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      ctx.fillStyle = "rgba(80,70,60,0.05)";
      for (let i = 0; i < 1400; i++) ctx.fillRect(rnd() * W, rnd() * H, 1, 1);
    }
    return canvas;
  } finally {
    img.close();
  }
}
