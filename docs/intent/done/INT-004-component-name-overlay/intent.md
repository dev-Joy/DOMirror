---
id: INT-004
title: 화면에 컴포넌트 이름 표시 (디자인 시스템 컴포넌트 사용 여부 확인)
status: done
priority: P2
created: 2026-11-17
updated: 2026-11-17
updated_at: 2026-11-17T19:48:02+09:00
---

# Intent: 화면에 컴포넌트 이름 표시 (디자인 시스템 컴포넌트 사용 여부 확인)

## 문제 (Problem)
- DOMirror 익스텐션은 선택한 요소의 소스 위치(`파일:라인:컬럼`)만 보여 준다. 화면의 요소가 어떤 컴포넌트로 만들어졌는지, 특히 디자인 시스템 컴포넌트를 썼는지 직접 썼는지는 화면에서 확인할 수 없다.
- 플러그인은 React 호스트 요소·Vue SFC 네이티브 요소에만 위치를 넣고 컴포넌트 태그에는 넣지 않아(`README.md:272`), 현재 DOM에는 컴포넌트 단위 정보가 없다.
- 영향 대상: DOMirror로 화면을 점검하는 프런트엔드 개발자(요청자 본인).

## 제안 결과 (Proposed outcome)
- 브라우저 화면에서 요소가 속한 컴포넌트 이름을 볼 수 있다.
- 그 컴포넌트가 디자인 시스템 컴포넌트인지 구분되어 보여, 디자인 시스템 사용 여부를 화면에서 확인할 수 있다.

## 영향 사용자 및 시스템 (Affected users and systems)
- 사용자: DOMirror 사용자(프런트엔드 개발자).
- 익스텐션: 소스 위치 표시 `packages/extension/src/panel.ts:45`(`renderLocation`), 위치 해석 `packages/extension/src/source-locator.ts:27`(`locate`), 오버레이 `packages/extension/src/overlay.ts:104`(`createMeasureOverlay`).
- 플러그인: 주입기 `packages/plugin/src/injectors/react.ts:11`·`packages/plugin/src/injectors/vue.ts:55`, 주입 속성 `data-domirror`(`packages/shared/src/constants.ts:1`).
- 예제: `examples/react-vite/src/components/Card.tsx`·`examples/vue-vite/src/components/Card.vue`(컴포넌트 사용 사례).

## 제약 (Constraints)
- INT-001 구조(번들러 플러그인 + 크롬 익스텐션 + 로컬 MCP 서버)와 프레임워크 범용 매핑 원칙(React 전용 설계 금지)을 따른다.
- 실제 운영 배포물에는 위치 정보를 넣지 않는다는 INT-001 결정을 유지한다(컴포넌트 정보도 같은 원칙 적용 여부는 미확정).
- 디자인 시스템 판별 기준·표시 방식: (미확정 — 미해결 질문)

## 배경 · 결정 · 참조 (Context handoff)
- 원 요구: IDEA-20261115-03 "화면에 컴포넌트 이름 표시(디자인 시스템 컴포넌트 사용 여부 확인)" (출처: _ideas IDEA-20261115-03, 웍스피어 블로그 "피그마 대신 코드로 디자인하면 어떨까"의 JDS 표시, INT-001 연계)
- D-01: 우선순위 P2 — 근거: 사용자 미지정, 긴급 표현 없음
- D-02: INT-001에서 범위 밖으로 둔 블로그 기능을 별도 intent로 진행 — 근거: INT-001 D-03(간격 보기만 채택, 나머지는 INBOX 기록) / 폐기 대안: INT-001 재개
- 참조: `README.md:272` 컴포넌트 태그·Fragment·template·slot 요소에는 위치 미주입, `packages/extension/src/panel.ts:45` 현재 패널은 소스 위치만 렌더
- 참조(외부): 블로그 내용 요약은 INT-001 `intent.md`의 「참조(외부)」 줄(JDS = 디자인 시스템 컴포넌트 이름 표시)에만 근거하며 본문 재확인 없음
- 범위 밖·전제: 컴포넌트 이름을 바꾸거나 디자인 시스템 컴포넌트로 교체하는 수정 기능은 범위 밖(표시만)
- 환경·재현: (해당 사항 없음)
- 인계 지시: 미해결 질문 확정 후 `z_skill_intent_to_specplan`. spec 착수 시 첫 행동은 React·Vue에서 빌드 시 컴포넌트 이름·import 출처를 DOM에 남길 수단 사실 조사(`researcher` 위임)
- 관련 intent: INT-007

## 미해결 질문 (Open questions)
- [x] 표시할 "컴포넌트 이름"은 무엇인가? (React·Vue 컴포넌트 이름 / 컴포넌트 소스 파일명 / 둘 다) → 답변: 컴포넌트 이름 + 정의 파일 경로를 함께 표시 (2026-11-17)
- [x] 디자인 시스템 컴포넌트는 어떻게 판별하는가? (import 출처 패키지명 / 경로 패턴 설정 / 별도 목록 파일) → 답변: 플러그인 설정의 경로 패턴(예: `designSystem: ['src/ds/**', '@acme/ui']`)으로 판별 — INT-007에서 재사용 가능 (2026-11-17)
- [x] 표시 방식과 MVP 범위는? (요소 호버 시 오버레이 라벨 / 선택 시 패널 표시 / 화면 전체 일괄 표시, React·Vue 동시 지원 여부) → 답변: 요소 호버 시 오버레이 라벨 + 선택 시 패널 표시, 디자인 시스템 여부는 색으로 구분, React·Vue 동시 지원(화면 전체 일괄 표시는 범위 밖) (2026-11-17)
- [x] 컴포넌트 정보도 소스 위치처럼 프로덕션 모드 빌드(스테이징·로컬 preview)까지 넣는가, dev server 한정인가? → 답변: 소스 위치와 동일하게 `enabled` 플래그를 따름(켠 프로덕션 빌드에도 경고와 함께 주입, 끄면 0건) (2026-11-17)

## 작업 (Tasks)
- [x] T-01 [P2] shared: 상수(DOMIRROR_COMPONENT_ATTR·DOMIRROR_DS_ATTR)·formatComponentInfo/parseComponentInfo·Injector ctx isDesignSystem·테스트 (plan Step 2) (2026-11-17)
- [x] T-02 [P2] plugin core: DomirrorOptions.designSystem·glob/specifier 판정·vite ctx 전달·경고 문구·AC-1 테스트 (plan Step 3) (2026-11-17)
- [x] T-03 [P2] React 주입기: 함수 스택 정의 측 주입·staticImports 사용처 측 주입·기존 속성 검사 확장·AC-2/AC-4 테스트 (plan Step 4) (2026-11-17)
- [x] T-04 [P2] Vue 주입기: basename 정의 측 주입·script/scriptSetup oxc 파싱 사용처 측 주입·AC-3/AC-4 테스트 (plan Step 5) (2026-11-17)
- [x] T-05 [P2] 통합 테스트: enabled 0건 단언에 새 속성 추가·절대 경로 0건 단언(AC-5) (plan Step 6) (2026-11-17)
- [x] T-06 [P2] 익스텐션: locateComponent·호버 라벨·패널 줄/배지·content.ts 전달·CSS 결합 (plan Step 7) (2026-11-17)
- [x] T-07 [P2] 예제: React/Vue src/ds/Button·사용처·vite.config designSystem (plan Step 8) (2026-11-17)
- [x] T-08 [P2] README: 옵션 표·주입 대상·알려진 한계·체크리스트 갱신 (plan Step 9) (2026-11-17)

## 결과
- 완료일: 2026-11-17. 빌드 시 `data-domirror-component`·`data-domirror-ds` 주입(React 함수 스택·Vue basename, `designSystem` glob/specifier 판별), 익스텐션 호버 라벨·패널 컴포넌트 줄·DS 배지, 예제·README 갱신.
- Tier 3 전수 검증 Pass(AC-1~AC-9), 정합성 게이트 필수(하드) 2-pass `PASS_WITH_NOTES`(비차단 NOTE만).
상세: [result.md](result.md)
