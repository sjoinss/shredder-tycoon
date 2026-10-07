import type { NextConfig } from "next";

// GitHub Pages 프로젝트 페이지는 /<저장소 이름>/ 아래에서 서비스된다. CI에서만 지정하고 로컬은 / 그대로
const basePath = process.env.PAGES_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  // 게임은 전부 브라우저에서 돌아가므로 정적 사이트로 내보낸다 (out/).
  // cacheComponents(PPR)는 정적 내보내기와 함께 쓸 수 없고, 서버 캐싱도 쓰지 않으므로 끈다.
  output: "export",
  basePath,
};

export default nextConfig;
