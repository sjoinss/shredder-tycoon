# 파쇄 시뮬레이터

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
- [x] M4 — 방해 요소 4종(포스트잇·테이프·봉투·앨범 파일) + 도구 3종(스테이플러 제거기·커터칼·레터 오프너), 찢어진 서류, 앨범 뭉치
- [x] M5 — 본체 교체 T1~T4(P-1 스트립 → P-3·P-4 크로스컷 → P-5 마이크로컷), 명함(용량 3장 분·용량 초과 잼), 카드·CD 전용 슬롯(칩 카드 + 가위, CD 케이스)
- [x] M6 — 자동화(정리 알바·급지 담당→자동 급지·청소 담당), 폐지 압축기·재활용 계약, 오프라인 수익(급지 담당 레벨별 최대 1~4시간), 파쇄 요청 + 평판(수익 배율), 지점 확장(프레스티지: 영구 배율 + 파기 증명서)
- [x] M7 — 사운드 믹스(리미터·연타 제한·카드/CD 갈리는 소리·요청/지점 확장 효과음), 접근성(방해 요소 처리 후 포커스 이동, 본체별 안내), 헤드리스 봇 시뮬레이션으로 밸런싱(해금 간격·열·요청 시간·지점 확장 조건), 저사양 모드 + 화면 밖·숨긴 탭 처리
- [ ] 실기기 테스트 — 아직 못 함 (브라우저 390px 폭에서만 확인)
