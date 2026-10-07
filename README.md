# 슈레더 타이쿤 (종이 파쇄기 시뮬레이터)

기획서: [paper-shredder-sim-plan.md](./paper-shredder-sim-plan.md) · Next.js 16 (App Router) + TypeScript, 외부 게임 라이브러리 없음

## 실행

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # 프로덕션 빌드
npm run lint
```

## 배포

- 플레이: https://sjoinss.github.io/shredder-tycoon/
- `main`에 푸시하면 GitHub Actions(`.github/workflows/deploy.yml`)가 정적 사이트(`out/`)를 빌드해 GitHub Pages로 배포합니다.
- 로컬에서 Pages와 같은 경로로 빌드: `PAGES_BASE_PATH=/shredder-tycoon npx next build` (Git Bash에서는 앞에 `MSYS_NO_PATHCONV=1`)

## 구조

```
src/
  app/            layout.tsx(테마 FOUC 방지 인라인 스크립트), page.tsx
  styles/         tokens.css, themes.css([data-theme]), layout.css(반응형), components.css
  game/           프레임워크와 무관한 순수 게임 로직
    data.ts       서류·업그레이드·컷 등급 데이터 테이블
    engine.ts     게임 상태, 고정 스텝 루프, 이벤트, 저장 연동
    save.ts       localStorage 저장/불러오기 (버전 + 검증)
    settings.ts   테마·소리·움직임 설정
    audio.ts      Web Audio 합성 효과음 (음원 파일 없음)
    render/       docgen(시드 기반 서류 생성), stage(캔버스 파쇄 연출), particles(오브젝트 풀),
                  hazards(방해 요소 그림), imagepaper(내 이미지 → 종이)
  components/     React UI (Game, Hud, ShredStage, Tray, Workbench, ActionBar, UpgradePanel, SettingsDialog)
```

## 진행 상황

- [x] M1 — 1장 투입·파쇄 연출·돈·기본 업그레이드 3종·반응형·기본 사운드·서류 생성기(4양식)·테마 3종 + 설정
- [x] M2 — 투입 용량(묶음 투입), 열 게이지·과열 정지·부채질·조기 재가동, 쓰레기통 비우기 4단계(드래그·탭·문지르기 + 버튼/E 키 대안), 봉투 터짐·쓸기, 업그레이드 4종 + 봉투 소모품
- [x] M3 — 방해 요소 5종(구겨짐·클립·스테이플·집게·투명 파일, 누적 파쇄 장수로 해금) + 작업대, 잼(역회전 꾹 누르기/R 키, 심한 잼은 손으로 빼기) + 자동 역회전 업그레이드, 내 이미지 파쇄(브라우저 안에서만 처리·저장 안 함)
- [ ] M4 이후 — 기획서 12장 참고
