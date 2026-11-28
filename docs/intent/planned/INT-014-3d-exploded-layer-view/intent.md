---
id: INT-014
title: 3D 컴포넌트 레이어 분해도(Exploded 3D Layers) 시각화 및 편집 연동
status: planned
priority: P2
created: 2026-11-28
updated: 2026-11-28
updated_at: 2026-11-28T16:19:25+09:00
---

# Intent: 3D 컴포넌트 레이어 분해도(Exploded 3D Layers) 시각화 및 편집 연동

## 문제 (Problem)
- 현재 DOMirror는 2D 평면 오버레이(`picker.ts`, `overlay.ts`)와 텍스트형 owner chain(`panel.ts`)만 제공하여, 컴포넌트가 깊게 중첩되거나 겹쳐 있는 React 화면의 입체적 계층 구조를 한눈에 파악하고 가려진 래퍼 요소를 선택하기 어렵다.

## 제안 결과 (Proposed outcome)
- 기존 `<domirror-panel>` Shadow DOM 오버레이/모달에서 현재 페이지의 컴포넌트 계층을 3D 분해도(Exploded 3D Layers)로 펼쳐 회전·확대·깊이 간격 조절로 중첩·겹침 구조를 직관적으로 확인한다.
- 3D 분해도 위의 레이어를 클릭(Pick-to-Inspect)하면 해당 React 컴포넌트 및 대응 요소를 즉시 선택해 기존 DOMirror의 CSS 편집·코멘트·MCP 전송 흐름까지 바로 연결한다(Zero-config React Fiber 기반).

## 영향 사용자 및 시스템 (Affected users and systems)
- 사용자: DOMirror Chrome 익스텐션으로 복잡한 React UI 구조를 파악하고 스타일을 수정하는 개발자
- 시스템: `packages/extension` (`content.ts`, `picker.ts`, `page-bridge.ts`, `panel.ts`, 신규 3D 뷰 모듈), `@domirror/shared`

## 제약 (Constraints)
- 외부 런타임 의존성 0개 원칙 유지: `packages/extension`에 Three.js 등 외부 3D 라이브러리를 도입하지 않고 순수 CSS 3D / Canvas / DOM API로 구현한다(`packages/extension/package.json:10-15`, `build.mjs:9-14`).
- 대상 페이지 무침습 원칙(NFR-3)을 준수하며 3D 뷰 종료 시 페이지 상태를 완전히 원복한다.
- 플랫폼 한계: 최상위 문서 기준 동작(iframe·Shadow DOM 내부 요소 선택 불가, `packages/extension/src/picker.ts:57-67`).
- 진행 중인 `INT-013`이 `packages/extension/src/{content,panel,picker}.ts`를 수정 대상으로 지정하고 있어 병행 작업 시 충돌에 유의한다.

## 배경 · 결정 · 참조 (Context handoff)
- 원 요구: React Anatomy의 3D 컴포넌트 레이어 분해도(Exploded 3D Layers)와 Pick-to-Inspect·Zero-config 핵심 기능을 DOMirror에 도입 (출처: 대화 요청)
- D-01: 기존 `<domirror-panel>` Shadow DOM 오버레이/모달로 통합 — 근거: 기존 UX 일관성 유지 및 DevTools 전환 제거 / 폐기 대안: Chrome DevTools 전용 패널, 둘 다 지원
- D-02: 3D 분해도(`INT-014`)·트리/서브트리(`INT-015`)·실시간 Props(`INT-016`) 3개 독립 intent로 분해 — 근거: 사용자 직접 분해 선택 및 독립 결과·단독 완료 충족 / 폐기 대안: 1개 통합 intent
- D-03: 3D 레이어 선택 시 기존 CSS 편집·코멘트·MCP 전송까지 바로 연결 — 근거: 구조 탐색과 수정 흐름 단절 제거 / 폐기 대안: 읽기 전용 시각화 한정
- D-04: 순수 CSS 3D / Canvas 유지(무의존성), 우선순위 `P2` — 근거: 단일 IIFE 무의존성 구조 유지 / 폐기 대안: Three.js 도입
- 참조: `packages/extension/src/content.ts:56-117`, `page-bridge.ts:39-52`, `picker.ts:25-80`, `overlay.ts:8-100`, `package.json:10-15`, `docs/intent/active/INT-013-react-runtime-fallback-prompt-ux/intent.md:26`
- 범위 밖·전제: Chrome DevTools 전용 패널, 외부 3D 라이브러리, 컴포넌트 트리 패널(`INT-015`) 및 실시간 Props 인스펙터(`INT-016`)는 별도 intent로 분리
- 환경·재현: macOS / Node.js `>=22.12` / `pnpm@10.26.1` / Chrome Manifest V3 / 대상 React DOM v18.2~v19.3(Zero-config)
- 인계 지시: 미해결 질문 2건 확정(`z_skill_grill_me -i INT-014`) 후 `z_skill_intent_to_specplan`으로 `spec.md`·`plan.md` 산출
- 관련 intent: INT-015, INT-016

## 미해결 질문 (Open questions)
- [x] 3D 분해도 렌더링 시 NFR-3(대상 페이지 무침습)을 만족하기 위해 Shadow DOM 오버레이 내 복제/투영(와이어프레임·스냅샷 레이어) 방식을 쓸지, 진입 시 일시 스타일 적용 후 종료 시 원복 방식을 허용할지? → 답변: Shadow DOM 내 복제/투영(와이어프레임·라벨 레이어 카드) 방식 채택 — 페이지 DOM 수정 0건, NFR-3 완전 준수 (2026-11-28)
- [x] 3D 레이어 생성 기준을 React Fiber 컴포넌트 단위로만 한정할지, 비-React/일반 DOM 요소 폴백 레이어도 지원할지? → 답변: React Fiber 컴포넌트 기본 + 비-React/일반 DOM 폴백 레이어 지원 (2026-11-28)

## 작업 (Tasks)
- [ ] T-01 [P2] (착수 시 분해 예정)
