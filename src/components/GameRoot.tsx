"use client";

import dynamic from "next/dynamic";

function Loading() {
  return (
    <div className="loading" role="status">
      <div className="loading__stage" aria-hidden="true" />
      <div className="loading__row" aria-hidden="true" />
      <p>서류를 정리하는 중…</p>
    </div>
  );
}

// 게임 상태·캔버스·오디오는 모두 브라우저 전용이므로 서버 렌더링하지 않는다
const Game = dynamic(() => import("./Game"), { ssr: false, loading: Loading });

export default function GameRoot() {
  return <Game />;
}
