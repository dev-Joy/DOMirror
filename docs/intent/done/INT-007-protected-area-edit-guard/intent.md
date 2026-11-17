---
id: INT-007
title: 수정 금지 영역(공통 컴포넌트·디자인 시스템 원본) 수정 경고 하네스
status: done
priority: P2
created: 2026-11-17
updated: 2026-11-18
updated_at: 2026-11-18T00:27:27+09:00
---

# Intent: 수정 금지 영역(공통 컴포넌트·디자인 시스템 원본) 수정 경고 하네스

## 문제 (Problem)
- 브라우저에서 보낸 CSS 변경을 에이전트가 반영할 때, 소스 위치가 공통 컴포넌트나 디자인 시스템 원본 파일을 가리키면 에이전트가 그 원본을 그대로 고쳐 다른 화면까지 바뀔 수 있다.
- 현재 서버는 위치를 검증하지 않고 반영 품질을 에이전트에 맡긴다(`README.md:283`). 수정하면 안 되는 영역을 알려 주는 장치가 없다.
- 영향 대상: DOMirror와 AI 에이전트로 소스를 수정하는 프런트엔드 개발자(요청자 본인)와, 공통 컴포넌트를 함께 쓰는 화면들.

## 제안 결과 (Proposed outcome)
- 에이전트가 수정 금지 영역(공통 컴포넌트·디자인 시스템 원본)을 고치려 하면 경고가 나온다.
- 사용자는 어떤 영역이 수정 금지인지 정할 수 있고, 경고를 보고 반영 여부를 판단할 수 있다.

## 영향 사용자 및 시스템 (Affected users and systems)
- 사용자: DOMirror 사용자, 에이전트(Claude Code 등 MCP 클라이언트).
- 로컬 MCP 서버: `list_pending_changes` 응답(`packages/server/src/mcp.ts:24`), 변경 항목의 `source.file`(`packages/shared/src/types.ts:15`, Vite 루트 기준 상대 경로 — `README.md:263`).
- zAgentSet 스킬·서브에이전트(INT-003)와 하네스 위치 관계는 미확정.

## 제약 (Constraints)
- 기존 MCP 도구 계약(`list_pending_changes`·`mark_changes_applied`)을 깨지 않는다(필드 추가 등 확장 방식은 미확정).
- 하네스를 zAgentSet 쪽에 둘 경우 그 실체는 저장소 밖 `~/.zAgentSet`이다(INT-003 제약과 동일).
- 경고 수준(경고만 / 차단)·영역 정의 방식: (미확정 — 미해결 질문)

## 배경 · 결정 · 참조 (Context handoff)
- 원 요구: IDEA-20261115-06 "에이전트가 고치면 안 되는 영역(공통 컴포넌트·디자인 시스템 원본) 수정 시 경고하는 하네스" (출처: _ideas IDEA-20261115-06, 웍스피어 블로그 "피그마 대신 코드로 디자인하면 어떨까"의 하네스, INT-001·IDEA-20261115-02 연계)
- D-01: 우선순위 P2 — 근거: 사용자 미지정, 긴급 표현 없음
- D-02: INT-001에서 범위 밖으로 둔 블로그 기능을 별도 intent로 진행 — 근거: INT-001 D-03 / 폐기 대안: INT-001 재개
- 참조: `README.md:283` 서버는 소스 라인 변경을 검증하지 않음, `packages/shared/src/types.ts:15` `source`는 `file`·`line`·`column`·`inherited`만 담음
- 참조(외부): 블로그 기능 요약은 INT-001 `intent.md`의 「참조(외부)」 줄(하네스)에만 근거하며 본문 재확인 없음
- 범위 밖·전제: 디자인 시스템 컴포넌트 표시(INT-004)와 스킬 자체 구현(INT-003)은 각 intent 소관. 이 intent는 수정 금지 영역 판정과 경고만 다룸
- 환경·재현: (해당 사항 없음)
- 인계 지시: 미해결 질문(특히 하네스 위치) 확정 후 `z_skill_intent_to_specplan`. 하네스를 zAgentSet에 둔다면 INT-003 spec과 순서 조율
- 관련 intent: INT-003, INT-004

## 미해결 질문 (Open questions)
- [x] 하네스는 어디에 두는가? (DOMirror MCP 응답에 경고 필드 추가 / 익스텐션 편집·전송 시 경고 / zAgentSet 스킬·훅에서 에이전트 수정 시 경고 / 조합) → 답변: DOMirror MCP `list_pending_changes` 응답 항목에 경고 필드(선택 필드) 추가 — 하네스와 무관하게 동작, 익스텐션·zAgentSet 측 경고는 범위 밖 (2026-11-17)
- [x] 수정 금지 영역은 어떻게 정의하는가? (프로젝트 설정 파일의 경로 패턴 / 패키지 경로·`node_modules` 기본 규칙 / INT-004의 디자인 시스템 판별 기준 재사용) → 답변: 플러그인 설정의 protected 경로 패턴(미설정 시 INT-004 `designSystem` 패턴 재사용) + `node_modules` 항상 포함 (2026-11-17)
- [x] 경고 수준은? (경고만 하고 반영은 허용 / 사용자 확인 전 차단) → 답변: 경고만(차단 없음) — 반영 전 사용자 확인을 권하는 안내를 붙이고 판단은 에이전트·사용자에게 맡김 (2026-11-17)
- [x] 수정 금지 영역의 요소를 고치고 싶을 때 대안 안내(사용처 쪽 덮어쓰기 등)까지 포함하는가? → 답변: 경고에 고정 안내 1줄 포함(사용처 쪽 스타일 덮어쓰기 또는 원본 수정 여부를 사용자에게 확인) (2026-11-17)

## 작업 (Tasks)
- [x] T-01 [P2] shared: `DOMIRROR_PROTECTED_ATTR` 상수·`InjectorContext.isProtected?`·`StyleChange.source.protected?`·`ProtectedAreaWarning`/`PendingChange` 타입 (plan Step 1) (2026-11-17)
- [x] T-02 [P2] plugin core: 옵션 `protected`·`designSystem` 폴백·`protectedPatterns`·`isProtected` 배선·`protectedAttributeText`·AC-1 테스트 (plan Step 2) (2026-11-17)
- [x] T-03 [P2] React·Vue 주입기: 정의 측 `data-domirror-protected` 주입·사용처 측 미주입·중복 방지·AC-2/AC-3 테스트 (plan Step 3) (2026-11-17)
- [x] T-04 [P2] 익스텐션: `Located.protected`(위치 제공 요소 기준)·`content.ts`에서 `source.protected` 전달·AC-4 테스트 (plan Step 4) (2026-11-17)
- [x] T-05 [P2] 서버: zod 스키마 확장·`protection.ts` `withProtectionWarning`·`outputSchema`·description·핸들러·AC-5 테스트 (plan Step 5) (2026-11-17)
- [x] T-06 [P2] README: 옵션 표·MCP 도구 표·`StyleChange` 필드·알려진 한계 4개 지점 (plan Step 6) (2026-11-17)

## 결과
- 완료일: 2026-11-18. 플러그인이 보호 대상 정의 측 요소에 `data-domirror-protected`를 주입(React·Vue)하고 익스텐션이 `source.protected`로 전달, 서버 `list_pending_changes`가 선택 필드 `warning`(패턴·`node_modules` 사유 + 고정 안내 1줄)을 응답. 차단 없음.
- Tier 3 전수 검증 Pass(26파일/317케이스, AC-1~AC-7 Pass·AC-8 대체 경로 Pass), 정합성 게이트 필수(하드) 2-pass `PASS_WITH_NOTES`(비차단 NOTE만).
상세: [result.md](result.md)
