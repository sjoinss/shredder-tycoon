"use client";

import { memo, useEffect, useRef, useState } from "react";
import { TEMPLATES } from "@/game/data";
import type { DocView } from "@/game/engine";
import { formatSeconds, formatWon } from "@/game/format";
import { getDocCanvas } from "@/game/render/docgen";
import { drawHazards } from "@/game/render/hazards";
import { IMAGE_ACCEPT, MAX_IMAGES_AT_ONCE } from "@/game/render/imagepaper";
import { IconAlert, IconImage } from "./Icons";

const THUMB_H = 76;
const PAD = 6;
const THUMB_MAX_W = 76;

/** 오프스크린에 한 번 그려둔 서류 이미지를 축소해서 보여줌 (+ 방해 요소) */
const DocThumb = memo(function DocThumb({ doc }: { doc: DocView }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const hazKey = doc.hazards.map((h) => h.left).join(",") + (doc.torn ? "t" : "");
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const src = getDocCanvas(doc);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const aspect = src.width / src.height;
    // 가로가 긴 명함·카드는 폭에 맞춰 줄인다
    const h = Math.min(THUMB_H, Math.round(THUMB_MAX_W / aspect));
    const w = Math.round(aspect * h);
    canvas.width = (w + PAD * 2) * dpr;
    canvas.height = (h + PAD * 2) * dpr;
    canvas.style.width = `${w + PAD * 2}px`;
    canvas.style.height = `${h + PAD * 2}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "rgba(31,42,51,0.18)";
    if (doc.template !== "cd") ctx.fillRect(PAD + 2, PAD + 2, w, h);
    ctx.drawImage(src, PAD, PAD, w, h);
    drawHazards(ctx, doc, PAD, PAD, h / TEMPLATES[doc.template].height);
    // 서류 id가 같으면 모양도 같다(시드 기반). 방해 요소가 바뀌면 다시 그림
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, hazKey]);
  return <canvas ref={ref} className="doc-card__thumb" aria-hidden="true" />;
});

/** 시드 기반 ±2° 기울기 */
const tilt = (seed: number) => ((seed % 400) / 100 - 2).toFixed(2);

interface Props {
  tray: DocView[];
  selectedId: number | null;
  /** 다음 투입 묶음 (용량이 2장 이상일 때 표시) */
  batchIds: number[];
  slots: number;
  arrivalLeft: number;
  onSelect: (id: number) => void;
  onImages: (files: File[]) => void;
}

export default function Tray({ tray, selectedId, batchIds, slots, arrivalLeft, onSelect, onImages }: Props) {
  const showBatch = batchIds.length > 1;
  const full = tray.length >= slots;
  const [dragOver, setDragOver] = useState(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onImages(files);
  };

  return (
    <section
      className={`tray${dragOver ? " is-dragover" : ""}`}
      aria-labelledby="tray-title"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
      }}
      onDrop={onDrop}
    >
      <div className="tray__head">
        <h2 id="tray-title" className="section-title">
          서류 트레이
        </h2>
        <span className="tray__count">
          {tray.length}/{slots}
          <span className="sr-only">칸 사용 중</span>
        </span>
        <span className="tray__next">{full ? "선반이 가득 찼어요" : `다음 서류 ${formatSeconds(arrivalLeft)}`}</span>
        <label className="upload-btn">
          <input
            type="file"
            accept={IMAGE_ACCEPT}
            multiple
            className="sr-only"
            aria-describedby="upload-note"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              // 같은 파일을 다시 고를 수 있도록 비움
              e.target.value = "";
              if (files.length) onImages(files);
            }}
          />
          <IconImage size={18} />
          내 이미지 올리기
        </label>
      </div>
      <p id="upload-note" className="tray__note">
        이미지는 이 브라우저 안에서만 종이로 바뀌고, 서버로 보내거나 저장하지 않아요. 새로고침하면 사라져요. (한 번에{" "}
        {MAX_IMAGES_AT_ONCE}장, 15MB 이하
        <span className="tray__note-pc">, 여기로 끌어다 놓아도 돼요</span>)
      </p>

      {tray.length === 0 ? (
        <p className="tray__empty">
          처리할 서류가 없어요. 다음 서류가 곧 도착합니다 ({formatSeconds(arrivalLeft)}).
          <br />
          <span className="tray__hint">시설 탭의 인박스 선반을 늘리면 더 자주 도착해요.</span>
        </p>
      ) : (
        <ul className="tray__list">
          {tray.map((doc) => {
            const selected = doc.id === selectedId;
            const order = showBatch ? batchIds.indexOf(doc.id) : -1;
            return (
              <li key={doc.id} className="tray__item">
                <button
                  type="button"
                  className={`doc-card${selected ? " is-selected" : ""}${order > 0 ? " is-batched" : ""}${doc.rarity ? ` is-${doc.rarity}` : ""}${doc.image ? " is-image" : ""}`}
                  aria-pressed={selected}
                  onClick={() => onSelect(doc.id)}
                  style={{ "--tilt": `${tilt(doc.seed)}deg` } as React.CSSProperties}
                >
                  <DocThumb doc={doc} />
                  {(doc.sheets ?? 1) > 1 && (
                    <span className="doc-card__sheets">
                      <span aria-hidden="true">×{doc.sheets}</span>
                      <span className="sr-only">{doc.sheets}장 뭉치</span>
                    </span>
                  )}
                  {doc.torn && <span className="sr-only">찢어짐</span>}
                  {order > 0 && (
                    <span className="doc-card__batch">
                      <span aria-hidden="true">+{order}</span>
                      <span className="sr-only">함께 투입</span>
                    </span>
                  )}
                  {doc.pendingCount > 0 && (
                    <span className="doc-card__hazard">
                      <IconAlert size={14} />
                      <span aria-hidden="true">{doc.pendingCount}</span>
                      <span className="sr-only">방해 요소 {doc.pendingCount}개</span>
                    </span>
                  )}
                  <span className="doc-card__tag">No.{String(doc.id).padStart(4, "0")}</span>
                  <span className="doc-card__name">{doc.rarityLabel ?? doc.templateName}</span>
                  <span className="doc-card__value">₩{formatWon(doc.value)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
