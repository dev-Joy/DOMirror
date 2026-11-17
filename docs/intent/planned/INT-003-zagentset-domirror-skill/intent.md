---
id: INT-003
title: zAgentSet용 DOMirror 스킬·서브에이전트 연동
status: planned
priority: P2
created: 2026-11-17
updated: 2026-11-17
updated_at: 2026-11-17T15:48:19+09:00
---

# Intent: zAgentSet용 DOMirror 스킬·서브에이전트 연동

## 문제 (Problem)
- DOMirror로 브라우저에서 CSS를 고친 뒤 소스에 반영하려면, 사용자가 매번 에이전트에게 `list_pending_changes` 조회 → 소스 수정 → `mark_changes_applied` 표시 절차를 직접 지시해야 한다. 이 절차가 zAgentSet(`~/.zAgentSet`)의 스킬·서브에이전트 체계에 들어 있지 않다.
- 영향 대상: zAgentSet 하네스(Claude Code 등)로 작업하며 DOMirror를 함께 쓰는 프런트엔드 개발자(요청자 본인).

## 제안 결과 (Proposed outcome)
- zAgentSet에 DOMirror용 스킬(가칭 `z_skills_domirror`)이 추가되어, 스킬 호출만으로 브라우저에서 보낸 CSS 변경이 소스에 반영되는 흐름이 실행된다.
- 필요하면 전용 서브에이전트가 이 반영을 맡아, 메인 에이전트 컨텍스트와 분리된 채 브라우저 CSS 수정이 소스에 반영된다.

## 영향 사용자 및 시스템 (Affected users and systems)
- 사용자: DOMirror 사용자 중 zAgentSet을 쓰는 개발자.
- zAgentSet(저장소 밖): 배포본 `~/.zAgentSet/{agents,config,mcp,prompts,skills}`. 현재 `skills/`에 DOMirror 관련 스킬 0건(`find ~/.zAgentSet -iname '*domirror*'` 결과 없음, 2026-11-17).
- DOMirror 로컬 MCP 서버: 도구 `list_pending_changes`(`packages/server/src/mcp.ts:24`), `mark_changes_applied`(`packages/server/src/mcp.ts:37`). 서버 등록 방법은 `README.md:126`(「4. Claude Code에 서버 등록」).
- 반영 결과 자동 확인 워크플로(INT-002): `README.md:154`(「반영 결과 자동 확인 (선택: chrome-devtools-mcp)」).

## 제약 (Constraints)
- 스킬·서브에이전트의 실체는 이 저장소(DOMirror) 밖 `~/.zAgentSet`에 위치한다. `~/.zAgentSet`은 git 저장소가 아닌 배포본이며(`git rev-parse` 실패) 원본 저장소 경로는 미확인이다.
- zAgentSet의 스킬·에이전트 경로(`src/skills/`·`src/agents/`) 실질 변경은 전역 규칙상 §A 3호(②) `필수(하드)` 게이트 대상이다(`~/.claude/CLAUDE.md` §A).
- DOMirror 서버 계약(MCP 도구 2개·입출력 스키마)을 바꾸지 않는 것을 기본 전제로 한다(바꿔야 하면 별도 결정).
- 일정·보안: (제약 없음 또는 미확정)

## 배경 · 결정 · 참조 (Context handoff)
- 원 요구: IDEA-20261115-01 "DOMirror(브라우저 클릭 CSS 수정 → 소스 반영)를 zAgentSkill과 함께 써서 사용하고 싶다" (출처: _ideas IDEA-20261115-01, 대화 요청, INT-001 연계)
- 원 요구(이어서): IDEA-20261115-02 "zAgentSet(~/.zAgentSet)에 DOMirror용 스킬(가칭 z_skills_domirror)을 추가하고 필요 시 전용 서브에이전트로 브라우저 CSS 수정을 소스에 반영" (출처: _ideas IDEA-20261115-02)
- D-01: IDEA-20261115-01·02를 1개 intent로 병합 — 근거: 02가 01의 구체화이며 INBOX에도 `(중복? 기존 1번째 줄)`로 표기되어 있어 중복 파일 금지 원칙 적용 / 폐기 대안: 아이디어별 intent 2개
- D-02: 우선순위 P2 — 근거: 사용자 미지정, 긴급 표현 없음
- 참조: `packages/server/src/mcp.ts:24` `list_pending_changes`·`:37` `mark_changes_applied` 등록, `README.md:283` 위치 검증 없음(에이전트가 `selectorHint`·`before`로 대조할 책임)
- 범위 밖·전제: DOMirror 익스텐션·플러그인·서버 기능 변경은 범위 밖. "zAgentSkill"은 zAgentSet을 가리키는 것으로 보이나 미확인(미해결 질문)
- 환경·재현: macOS(Darwin 25.6.0), zsh, `~/.zAgentSet` 배포본(비 git). 재현 명령·실측 수치 없음
- 인계 지시: 미해결 질문 확정 후 `z_skill_intent_to_specplan`. spec 착수 시 첫 행동은 zAgentSet 원본 저장소 위치와 기존 스킬 규약(`z_skill_*` 명명·SKILL.md 형식) 확인
- 관련 intent: INT-007

## 미해결 질문 (Open questions)
- [x] IDEA-20261115-01의 "zAgentSkill"은 zAgentSet(`~/.zAgentSet`)을 가리키는가? → 답변: 예, zAgentSet(`~/.zAgentSet`)을 가리킴 (자동승인: 권장안 — 근거: IDEA-20261115-02가 `~/.zAgentSet`을 직접 명시) (2026-11-17)
- [x] 스킬 이름을 무엇으로 확정하는가? (가칭 `z_skills_domirror` / 기존 명명 규약에 맞춘 `z_skill_domirror` 등) → 답변: `z_skill_domirror` (자동승인: 권장안 — 근거: 기존 스킬 전부 `z_skill_*` 단수형 명명 규약) (2026-11-17)
- [x] 전용 서브에이전트를 만드는가? 만든다면 "필요 시"의 기준과 역할(반영만 / 반영 + chrome-devtools-mcp 검증)은 무엇인가? → 답변: 스킬만 추가, 소스 반영은 기존 파이프라인(code-implementer→code-tester) 경유 — 전용 서브에이전트 미생성 (2026-11-17)
- [x] 스킬이 맡을 범위는? (서버 기동·MCP 등록 안내 포함 여부, INT-002 반영 결과 자동 확인 워크플로 포함 여부, 반영 시 zAgentSet 코드 파이프라인(code-implementer 등) 경유 여부) → 답변: MVP는 `list_pending_changes` 조회 → code-implementer 반영 → `mark_changes_applied` 표시만(서버 기동·MCP 등록 안내, INT-002 자동 확인 연계는 범위 밖) (2026-11-17)
- [x] zAgentSet 원본 저장소의 경로와 배포(sync) 방식은 무엇이며, 이 intent의 구현·검증을 그 저장소에서 진행하는가? → 답변: zAgentSet 원본 저장소(`~/dev-Joy/zAgentSet`, `src/skills/`)에서 구현하고 sync로 배포 — DOMirror에는 요구 기록만 유지 (2026-11-17)

## 작업 (Tasks)
- [ ] T-01 [P2] (착수 시 분해 예정)
