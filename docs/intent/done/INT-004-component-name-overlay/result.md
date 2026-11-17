# Result: 화면에 컴포넌트 이름 표시 (디자인 시스템 컴포넌트 사용 여부 확인)
- Intent: [INT-004](intent.md) | 완료일: 2026-11-17 | Tier: 3 (Strict, `plan.md` §1) | Spec/Plan: [spec.md](spec.md) · [plan.md](plan.md)

## 결과 요약
- 빌드 시 각 호스트 요소에 `data-domirror-component="<이름>|<정의 파일>"`와 디자인 시스템 여부 `data-domirror-ds`를 주입한다. React는 함수 스택 휴리스틱(가장 가까운 대문자 함수·클래스, 없으면 basename), Vue는 SFC basename을 쓴다(FR-3·FR-4).
- `designSystem` 옵션(정의 경로 glob `*`·`**` + import specifier 정확/접두 일치)으로 DS를 판별하고, DS 패턴과 일치하는 정적 import의 컴포넌트 태그에는 사용처 측 속성도 주입한다(FR-1·FR-5, E-1 한계 README 명시).
- 익스텐션이 호버 라벨(DS 초록 `이름 · DS` / 일반 회색 `이름`)과 선택 패널의 `컴포넌트:`·`정의:` 줄·DS 배지를 표시한다. 정보가 없으면 라벨을 숨기고 패널에 `컴포넌트 정보 없음`을 표시한다(FR-7~FR-9, E-9).
- 예제에 `src/ds/Button`과 `designSystem: ['src/ds/**']`를 추가했고, README 옵션·주입 대상·알려진 한계·체크리스트를 갱신했다(FR-11·FR-12).
- T-01~T-08 전 단계를 단계별 커밋(10건)으로 분리 진행하고, 각 단계마다 빌드·타입·린트·테스트로 회귀를 확인했다.

## 변경 산출물
`git diff --shortstat f647fc5..HEAD -- packages examples README.md`: **32 files changed, 1011 insertions(+), 58 deletions(-)**

| 경로 | 변경 | 핵심 내용 1줄 |
| :--- | :--- | :--- |
| `packages/shared/src/constants.ts`·`component.ts`·`types.ts`·`index.ts` | 수정·신규 | 속성 상수 2개, `formatComponentInfo`·`parseComponentInfo`, `InjectorContext.isDesignSystem` |
| `packages/plugin/src/design-system.ts`·`imports.ts` | 신규 | glob(`*`·`**`)·specifier 판정 매처, 정적 import 매퍼(프레임워크 공용) |
| `packages/plugin/src/core.ts`·`vite.ts`·`index.ts` | 수정 | `designSystem` 옵션·ctx 전달, 경고 문구, 공개 export |
| `packages/plugin/src/inject-utils.ts`·`injectors/react.ts`·`injectors/vue.ts` | 수정 | 정의 측·사용처 측 속성 주입(함수 스택·SFC script 파싱) |
| `packages/extension/src/source-locator.ts`·`picker.ts`·`panel.ts`·`content.ts` | 수정 | `locateComponent`, 호버 라벨, 패널 컴포넌트 줄·DS 배지, 선택 전달 |
| `packages/*/test`·`packages/extension/test` | 수정·신규 | AC-1~AC-6 단위·통합 테스트, 기존 위치 단언 확장(위치 값 불변) |
| `examples/react-vite`·`examples/vue-vite` | 수정·신규 | `src/ds/Button`, 사용처, `designSystem: ['src/ds/**']`, 버튼 스타일 |
| `README.md` | 수정 | 옵션 표·주입 대상·알려진 한계(컴포넌트 정보 한계)·체크리스트 |
| `CHANGELOG.md`·`package.json`·`VERSION_HISTORY.md` | 수정 | 커밋별 버전·변경 이력 자동 갱신(0.1.20~0.1.30) |

## 검증 결과
| 항목 | 결과 | 증거(출처) |
| :--- | :--- | :--- |
| 설계 (`code-planner`) | 완료 — Step 1 실측(oxc `parsed.module.staticImports`, `Visitor` exit 콜백, Vue `tagType` 컴포넌트=1) 후 spec 6건 보강 | 커밋 `1096f65` |
| 정적 분석·린트 | Pass — `pnpm lint`(oxlint) Exit 0 | code-tester 재실행 |
| 타입 검사·빌드 | Pass — `pnpm typecheck`·`pnpm build` Exit 0 | code-tester 재실행 |
| 단위·통합 테스트 | Pass — `pnpm test` 21 files / 236 tests, react 21·vue 15·core 11·integration 7·component 9·source-locator 14·sourcemap 4·vite.plugin 9 | code-tester 보고 |
| 브라우저 검증(AC-7) | Pass(대체 방식) — ego-browser로 익스텐션 로드 불가(`Extensions.loadUnpacked` 미지원) → 빌드된 `content.js`를 `chrome` 셰임과 주입해 React 5173·Vue 5174에서 DS 초록 라벨 `Button · DS`, Card 회색 라벨, 패널 `컴포넌트:`·`정의:`·DS 배지, 콘솔 에러 0건 확인. 스크린샷 `/tmp/dm_ac7_*.png` 4건 | code-tester 보고 |
| 빌드 산출물(NFR-2) | Pass — React/Vue 예제 `DOMIRROR=1` 빌드에서 컴포넌트 값 10건씩, `Button|src/ds/...` + `data-domirror-ds`, 절대 경로(`/Users/...`) 0건 | code-tester·conformance 2차 grep |
| 정합성 게이트 | `필수(하드)` ① Tier 3 / 방식: **2-pass** / 미검증: 없음 | 아래 이력 |
| conformance-reviewer 1차(순방향) | `PASS_WITH_NOTES` — FR 12·NFR 6·AC 9 전건 증거, 반증 시도 11건 기대대로. NOTE 7건(AC-7 원시 증거 전달 누락, plan §4 문구 스테일, 커밋 스코프 혼입, Vue script 재파싱, basename 중복, 약한 slot 단언, located null 분기) | 새 세션 위임 |
| conformance-reviewer 2차(반증 전용) | `PASS_WITH_NOTES` — 반증 시도 27건 + 경계 입력 12건, **신규 결함 0건**. NOTE 6건(README 값 템플릿, 사양 인용 라인 드리프트, AC-7 환경 차이, AC-5 단언 강도, Vue use-site 통합 부재, 문서 스코프 혼입) | 새 세션 위임(1차 리포트 입력 배제) |

### conformance-reviewer NOTE (모두 비차단)
- 1차: AC-7은 검증자에게 원시 로그가 전달되지 않아 UNVERIFIED였으나, 판정 항목이 DOM 속성 읽기 기반이고 실제 예제 빌드 산출물에서 입력값을 확인해 비차단.
- 1차: plan §4 "기존 위치 단언 변경 없이 통과" 문구는 spec AC-8 개정(부분 문자열·개수 단언만 확장)과 표현이 다르나 위치 값은 동일 — 실행 규범인 spec이 우선.
- 1차·2차: INT-005~008 spec/plan 문서가 구현 커밋에 함께 포함 — 코드 diff 0건의 문서 추가로 동작 영향 없음(이력 재작성 불가).
- 2차: README:80 값 템플릿이 사용처 측 값(`<태그>|<import specifier>`)을 직접 표기하지 않음 — 같은 문단 다음 문장이 조건을 서술.
- 2차: AC-5는 `values.length > 0`만 확인(전건 대조 아님), Windows에서 `not.toContain(root)`는 사실상 무효 — 플랫폼 독립 정규식 가드가 실질 방어.
- 2차: Vue use-site 통합 테스트 부재 — AC-4는 단위 테스트로 규정, `vue.test.ts`가 동일 조건 검증.

### 정합성 검증 이력
- 1차(순방향): FR·NFR·AC 전건 `파일:라인` 증거 대조 → `PASS_WITH_NOTES`.
- 2차(반증 전용): 1차 리포트를 입력에서 배제하고 27건 반증 + 경계 12건 실측 → 신규 결함 0건, `PASS_WITH_NOTES`.
- 최종: 두 회차 모두 비차단 NOTE → **게이트 통과**.

### 사용자 결정·옵트아웃
- 옵트아웃 없음. 파이프라인 정규 경로(설계 → 구현 → 검증 → 정합성 2-pass)로 완료.
- 위임 한도 장애 구간(T-06)에서 페르소나 폴백(ADVISORY) 1회 수행: `locateComponent` 테스트 4건 보강·검증을 메인에서 직접 수행. 이후 T-07~T-08·정합성은 정규 위임으로 복귀.

### AC-8 종단 증거 요지
- `pnpm test` 21 files / 236 tests passed, `pnpm lint`·`pnpm typecheck`·`pnpm build` Exit 0.
- 기존 위치 값 불변: React `src/App.tsx:3:5`·`5:7`·`1:24`, Vue `3:11`·`4:25` 단언 유지, `sourcemap.test.ts` 역매핑 4건 통과.

## 잔여 리스크 및 후속
- 실제 Chrome 확장 로드(ISOLATED world·아이콘 주입 경로)는 브라우저 도구 제약으로 미검증 — README 수동 체크리스트(컴포넌트 라벨 항목)에 남김.
- 패키지형 DS가 props/attrs를 루트로 전달하지 않으면 사용처 측 판별이 되지 않는다(README 알려진 한계).
- 후속 후보: 1차 NOTE의 basename 중복(`react.ts`·`vue.ts`) 공용화, Vue use-site 통합 케이스 추가.
- 롤백: `git revert` 또는 `git checkout f647fc5 -- packages examples README.md`.
- 연계: INT-007(수정 금지 영역 경고)이 `createDesignSystemMatcher`·판정 함수를 재사용한다.

## 참조
- 요구: [intent.md](intent.md) · 명세: [spec.md](spec.md) · 계획: [plan.md](plan.md)
- 워크로그: 미기록(사유: 저장소에 `docs/works/` 없음)
- 주요 커밋: `f647fc5` 착수 전이 · `1096f65` spec 실측 보강 · `32ecf55` T-01 · `ffcc083` T-02 · `27d42bc` T-03 · `86b40f1` T-04 · `49319db` T-05 · `ddb46f5` T-06 · `617f64b` T-07 · `fc9066d` T-08 · `29786db` 태스크 완료
