---
id: INT-006
title: 선택 요소·변경 내역을 AI 구현 프롬프트로 복사
status: planned
priority: P2
created: 2026-11-17
updated: 2026-11-17
updated_at: 2026-11-17T15:58:52+09:00
---

# Intent: 선택 요소·변경 내역을 AI 구현 프롬프트로 복사

## 문제 (Problem)
- DOMirror의 변경 전달은 로컬 MCP 서버를 등록한 에이전트에서만 쓸 수 있다(`README.md:126`). MCP를 쓰지 않는 AI 도구(웹 채팅 등)에 같은 내용을 넘기려면 요소·소스 위치·변경 값을 사람이 다시 정리해 적어야 한다.
- 영향 대상: DOMirror 사용자 중 MCP 미지원 도구나 다른 대화 창에 구현을 맡기려는 프런트엔드 개발자(요청자 본인).

## 제안 결과 (Proposed outcome)
- 익스텐션에서 선택한 요소와 변경 내역을 AI에 그대로 붙여 넣을 수 있는 구현 프롬프트 텍스트로 클립보드에 복사할 수 있다.
- 복사한 프롬프트에는 AI가 소스를 찾아 반영하는 데 필요한 정보(소스 위치·선택자 요약·속성·이전값·새 값 등)가 들어 있다.

## 영향 사용자 및 시스템 (Affected users and systems)
- 사용자: DOMirror 사용자.
- 익스텐션: 변경 내역 패널 `packages/extension/src/panel.ts:158`(`renderChanges`), 변경 내역 모델 `packages/extension/src/change-log.ts:6`(`LocalChange`), 전송 대상 선별 `packages/extension/src/change-log.ts:50`(`sendable`, 위치 없는 항목 제외).
- 공유 타입: `packages/shared/src/types.ts:13`(`StyleChange` — source·selectorHint·property·before·after·pageUrl).
- 로컬 MCP 서버의 전송 흐름(`packages/server/src/mcp.ts:24`)과의 관계는 미확정.

## 제약 (Constraints)
- 기존 MCP 전송 흐름(`list_pending_changes`·`mark_changes_applied`)과 그 계약은 유지한다(대체 여부는 미해결 질문).
- 위치 정보는 Vite 루트 기준 상대 경로만 담는다는 원칙을 유지한다(`README.md:263`, 절대·홈 경로 미포함).
- 프롬프트 형식·언어: (미확정 — 미해결 질문)

## 배경 · 결정 · 참조 (Context handoff)
- 원 요구: IDEA-20261115-05 "선택한 요소·변경 내역을 AI에 붙여 넣을 구현 프롬프트로 복사" (출처: _ideas IDEA-20261115-05, 웍스피어 블로그 "피그마 대신 코드로 디자인하면 어떨까"의 "프롬프트 복사", INT-001 연계)
- D-01: 우선순위 P2 — 근거: 사용자 미지정, 긴급 표현 없음
- D-02: INT-001에서 범위 밖으로 둔 블로그 기능을 별도 intent로 진행 — 근거: INT-001 D-03 / 폐기 대안: INT-001 재개
- 참조: `README.md:283` 서버는 위치 검증을 하지 않고 에이전트가 `selectorHint`·`before`로 대조할 책임(프롬프트에도 같은 대조 정보 필요), `packages/extension/src/change-log.ts:50` 위치 없는 항목은 전송 제외
- 참조(외부): 블로그 기능 요약은 INT-001 `intent.md`의 「참조(외부)」 줄(프롬프트 복사)에만 근거하며 본문 재확인 없음
- 범위 밖·전제: 복사한 프롬프트를 AI에 자동 전달·실행하는 기능은 범위 밖(클립보드 복사까지)
- 환경·재현: (해당 사항 없음)
- 인계 지시: 미해결 질문 확정 후 `z_skill_intent_to_specplan`
- 관련 intent: INT-005

## 미해결 질문 (Open questions)
- [x] 복사 대상 범위는? (현재 선택한 요소 1개 / 변경 내역 전체 / 변경 없는 요소 선택만으로도 복사) → 답변: 변경 내역이 있으면 내역 전체, 없으면 현재 선택 요소의 위치 정보만 복사 (2026-11-17)
- [x] 프롬프트에 넣을 항목·형식·언어는? (마크다운 / 평문, 한국어 / 영어, 반영 지시문 포함 여부) → 답변: 한국어 마크다운, 반영 지시문 포함 (자동승인: 권장안 — 근거: 형식·표기 선택이며 프로젝트 문서 언어가 한국어) (2026-11-17)
- [x] 위치 정보가 없는 항목(`sendable` 제외 대상)도 프롬프트에는 포함하는가? → 답변: 포함하되 "위치 미확인"으로 표시하고 `selectorHint`·이전/새 값을 함께 넣어 AI가 직접 찾도록 안내 (2026-11-17)
- [x] 복사 후 변경 내역 상태를 바꾸는가? (MCP 전송처럼 내역에서 빼기 / 그대로 유지) 그리고 MCP 전송과 병행인가 대체인가? → 답변: 내역 유지(복사는 읽기 전용), MCP 전송과 병행 (2026-11-17)

## 작업 (Tasks)
- [ ] T-01 [P2] (착수 시 분해 예정)
