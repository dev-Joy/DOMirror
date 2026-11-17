# Plan: 화면에 컴포넌트 이름 표시 (디자인 시스템 컴포넌트 사용 여부 확인)
- Intent: [INT-004](intent.md) | Tier: 3 | 작성일: 2026-11-17
- Intent updated_at: 2026-11-17T16:22:52+09:00
- Spec: [spec.md](spec.md)

## 1. Tier 산정
- **Tier 3 (Strict)**. 근거는 다음과 같다.
  - 4개 영역(plugin·shared·extension·examples)과 README에 걸친 기능 추가다.
  - 공개 옵션과 `Injector` 타입을 확장한다(spec R-2).
  - 모든 변환 결과에 새 속성을 주입한다.
  - 브라우저 UI(호버 라벨·패널)를 변경해 F-E 브라우저 검증이 필요하다.
  - INT-001(Tier 3)과 같은 등급의 다중 패키지 변경이다.
- 하드 게이트 후보: 해당 없음. 이 저장소에는 `[배포·계약 자산 경로]`(`src/prompts/` 등)가 없다. 공개 계약 변경은 선택 필드 추가뿐이라 비파괴 변경이다.

## 2. 실행 순서 (Steps)
1. **사실 실측**
   - oxc-parser 0.158.0 `Visitor`의 `:exit` 콜백과 `parseSync().module.staticImports`(또는 실제 필드 경로) 구조를 작은 스크립트나 테스트로 확인한다(spec A-2).
   - Vue `tagType` 컴포넌트 값을 확인한다(ELEMENT_COMPONENT 상수).
   - 결과가 spec §6 초안과 다르면 spec §6을 갱신한다.
   - 롤백: 해당 없음(읽기).
2. **shared**
   - `packages/shared/src/constants.ts`에 `DOMIRROR_COMPONENT_ATTR`·`DOMIRROR_DS_ATTR`를 추가한다.
   - `formatComponentInfo`·`parseComponentInfo`를 추가하고 `index.ts`로 re-export한다(FR-6).
   - `types.ts:10` `Injector` ctx에 선택 필드 `isDesignSystem`을 추가한다(FR-2).
   - 테스트를 추가한다.
   - 롤백: `git checkout -- packages/shared`.
3. **plugin core**
   - `DomirrorOptions.designSystem`을 추가한다(`core.ts:6`).
   - glob(`*`, `**`)과 specifier 판정 함수를 만들고 `vite.ts`에서 ctx로 전달한다(FR-1·FR-2·NFR-3).
   - `PRODUCTION_WARNING` 문구를 바꾸고 `vite.plugin.test.ts:141`을 갱신한다(FR-10).
   - AC-1 테스트를 추가한다.
   - 롤백: `git checkout -- packages/plugin/src/core.ts packages/plugin/src/vite.ts packages/plugin/test`.
4. **React 주입기**(`react.ts:11`)
   - 함수 스택(enter/exit)으로 컴포넌트 이름을 결정해 정의 측 속성을 주입한다(FR-3·E-4).
   - `staticImports`로 사용처 측 속성을 주입한다(FR-5).
   - 기존 속성 검사(`:38-41`)를 확장한다(E-6).
   - AC-2·AC-4 테스트를 추가한다.
   - 롤백: 해당 파일과 테스트 checkout.
5. **Vue 주입기**(`vue.ts:55`)
   - basename 이름으로 정의 측 속성을 주입한다(FR-4).
   - script·scriptSetup을 oxc로 파싱해 사용처 측 속성을 주입한다(FR-5·E-2·E-7).
   - AC-3·AC-4 테스트를 추가한다.
   - 롤백: 동일.
6. **통합 테스트**
   - `vite.integration.test.ts:88`의 0건 단언에 새 속성을 추가한다.
   - 절대 경로 0건 단언을 추가한다(AC-5).
   - 롤백: 동일.
7. **익스텐션**
   - `source-locator.ts`에 `locateComponent`를 추가한다(FR-7, AC-6 테스트).
   - `picker.ts`에 호버 라벨과 색을 추가한다(FR-8).
   - `panel.ts:45` `renderLocation`에 컴포넌트 줄과 배지를 추가한다(FR-9).
   - `content.ts:271-273`에서 결과를 전달한다.
   - CSS는 `content.ts:95` 결합에 포함한다(NFR-6).
   - 롤백: `git checkout -- packages/extension`.
8. **예제**
   - React와 Vue 각각에 `src/ds/Button`과 사용처를 추가한다.
   - `vite.config.ts:6`에 `designSystem: ['src/ds/**']`를 추가한다(FR-12).
   - 롤백: `git checkout -- examples` 후 신규 파일을 삭제한다.
9. **README**
   - 옵션 표(`README.md:76-77`), 주입 대상(`:79`), 알려진 한계(`:270`), 체크리스트(`:286`)를 갱신한다(FR-11).
   - 롤백: `git checkout -- README.md`.
10. **전수 검증**: AC-7 브라우저 확인과 AC-8·AC-9 명령(§4)을 실행한다. 롤백: 해당 없음.

## 3. Intent 태스크 매핑
- 2026-11-17 착수 시 `T-01`(분해 예정 1건)을 아래 8건으로 분해해 `intent.md`에 기록했다(모두 P2).
  - `T-01` shared → Step 2
  - `T-02` plugin core → Step 3
  - `T-03` React 주입기 → Step 4
  - `T-04` Vue 주입기 → Step 5
  - `T-05` 통합 테스트 → Step 6
  - `T-06` 익스텐션 → Step 7
  - `T-07` 예제 → Step 8
  - `T-08` README → Step 9
  - Step 1(oxc·Vue AST 실측)은 `T-01` 착수 전 선행 조사이고, Step 10(전수 검증)은 태스크가 아닌 별도 검증 단계(§4 DoD)로 둔다.
- 제안 결과 매핑
  - 컴포넌트 이름 표시 → `T-03`·`T-04`(주입), `T-06`(라벨·패널)
  - 디자인 시스템 구분 → `T-02`(판정), `T-03`·`T-04`(`data-domirror-ds`), `T-06`(색)
  - React·Vue 동시 지원 → `T-03`·`T-04`·`T-07`
  - `enabled` 일치 → `T-05`

## 4. 검증 계획 (DoD)
- code-tester(Tier 3) 전수 확인
  - `pnpm build`, `pnpm typecheck`, `pnpm lint`(oxlint), `pnpm test`(vitest) 모두 Exit 0이어야 한다(AC-8).
  - 신규 단위 테스트가 통과해야 한다: AC-1~AC-6.
  - 기존 위치 단언(`react.test.ts:26`, `vue.test.ts:44`, `vite.integration.test.ts:82`)이 변경 없이 통과해야 한다(NFR-5).
  - `rg -n "designSystem|data-domirror-component|data-domirror-ds" README.md examples/*/vite.config.ts`
  - `git diff -- packages/*/package.json`에서 의존성 변경이 0줄이어야 한다(AC-9).
- 브라우저(AC-7)
  - 실행: `pnpm --filter example-react-vite dev`(5173), `pnpm --filter example-vue-vite dev`(5174)
  - 확인: 익스텐션 빌드를 로드한 상태에서 호버 라벨 색·문구, 패널의 컴포넌트 줄, 콘솔 에러 0건
  - 도구 순서: ego-browser → Aside MCP → Playwright. 익스텐션 로드가 불가하면 content 번들을 페이지에 주입하는 대체 방식이나 미수행 사유를 보고한다.
- 게이트: 필수(하드) / 근거: ① Tier 3 / 방식: 2-pass
- Tier 3 완료 조건: 전체 빌드·정적 분석(타입 검사·린트)·테스트 통과 + 브라우저 검증(콘솔 에러 0건, 정상 렌더링)

## 5. 리스크 · 파급
- **패키지형 DS가 props를 전달하지 않아 미판별되는 경우**(spec E-1·A-1): README의 알려진 한계에 명시한다. 로컬 glob DS는 정의 측 주입으로 판별되므로 영향이 없다.
- **oxc API 구조 차이**(spec A-2): Step 1에서 실측하고, 다르면 spec §6을 갱신한다. 요구가 바뀌어야 하면 intent를 갱신한 뒤 specplan을 다시 실행한다.
- **컴포넌트 태그 data 속성 전달 부작용**(spec R-1): DS 패턴 import로만 주입을 한정해 완화한다(D-S3).
- **공개 타입 확장**(spec R-2): 선택 필드로만 추가한다. 커스텀 `injectors` 사용자에게 영향이 없다.
- **경고 문구 변경**(spec R-4): Step 3에서 테스트와 함께 갱신한다.
- **파급 범위**: plugin·shared·extension·examples·README가 바뀐다. MCP server와 `StyleChange` 계약에는 영향이 없다.
- **INT-007 연계**: INT-007이 `designSystem` 패턴과 판정 함수를 재사용한다. 그래서 판정 함수는 core에 공개 가능한 형태로 둔다(NFR-4).
- **결정 계승**: intent D-01(P2)·D-02(별도 intent)와 spec D-S1~D-S4를 따른다. 범위 밖 항목은 수정 기능, 화면 전체 일괄 표시, 런타임 객체 조회다.

## 6. 실행 흐름
```mermaid
flowchart TD
  A[Step 1 oxc·Vue AST 실측] -->|spec §6 일치| B[Step 2 shared 상수·포맷·Injector ctx]
  A -->|불일치| A2[spec §6 갱신] --> B
  B --> C[Step 3 core designSystem 판정·경고 문구]
  C --> D[Step 4 React 주입기 정의·사용처]
  C --> E[Step 5 Vue 주입기 정의·사용처]
  D --> F[Step 6 통합 테스트 enabled 0건·절대경로 0건]
  E --> F
  F --> G[Step 7 익스텐션 locateComponent·라벨·패널]
  G --> H[Step 8 예제 src/ds]
  H --> I[Step 9 README]
  I --> J[Step 10 code-tester Tier 3 + 브라우저]
  J --> K[conformance-reviewer 필수(하드) 2-pass]
```
