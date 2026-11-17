# Intent Index
> 이 파일은 `docs/intent/` 폴더 스캔 결과로 재작성되는 대장입니다. 직접 편집하지 않습니다.
> Last updated: 2026-11-17

## 요약
| 상태 | planned | active | hold | done | **합계** |
| :--- | :---: | :---: | :---: | :---: | :---: |
| 건수 | 5 | 0 | 0 | 5 | **10** |

## Planned (미착수)
| ID | 제목 | 우선순위 | 태스크 | 갱신 |
| :--- | :--- | :--- | :--- | :--- |
| [INT-003](planned/INT-003-zagentset-domirror-skill/intent.md) | zAgentSet용 DOMirror 스킬·서브에이전트 연동 | P2 | 0/1 | 2026-11-17 |
| [INT-007](planned/INT-007-protected-area-edit-guard/intent.md) | 수정 금지 영역(공통 컴포넌트·디자인 시스템 원본) 수정 경고 하네스 | P2 | 0/1 | 2026-11-17 |
| [INT-008](planned/INT-008-release-inline-override-after-apply/intent.md) | 소스 반영 확인 시 익스텐션 인라인 !important 값 해제·원복 | P2 | 0/1 | 2026-11-17 |
| [INT-009](planned/INT-009-color-picker-layout-props/intent.md) | CSS 편집 패널 확장 — 컬러 피커와 flex/grid 레이아웃 속성 편집 | P2 | 0/1 | 2026-11-17 |
| [INT-010](planned/INT-010-prompt-self-check-verify/intent.md) | AI 프롬프트에 자가 점검 목록·반영 결과 확인 단계 추가 | P2 | 0/1 | 2026-11-17 |

## Active (작업 중)
| ID | 제목 | 우선순위 | 태스크 | 갱신 |
| :--- | :--- | :--- | :--- | :--- |

## Hold (보류)
| ID | 제목 | 보류 사유 | 재개 조건 | 갱신 |
| :--- | :--- | :--- | :--- | :--- |

## Done (완료)
| ID | 제목 | 완료일 | 결과 요약 |
| :--- | :--- | :--- | :--- |
| [INT-001](done/INT-001-click-to-source-css-edit/intent.md) | 브라우저 클릭 CSS 수정의 소스 코드 반영 (프레임워크 무관 DOM→소스 매핑) | 2026-11-17 | 플러그인+익스텐션+로컬 MCP 서버 구현, React·Vue AC-8 종단 확인, 게이트 필수(하드) 2-pass PASS_WITH_NOTES ×2 ([result.md](done/INT-001-click-to-source-css-edit/result.md)) |
| [INT-002](done/INT-002-devtools-mcp-apply-verify/intent.md) | chrome-devtools-mcp로 소스 반영 결과 자동 확인 (워크플로 문서화) | 2026-11-17 | README에 chrome-devtools-mcp 병행 등록·검증 프롬프트·스니펫·보안 주의 추가(코드 변경 0건), 게이트 조건부-실행 1-pass 재판정 PASS_WITH_NOTES ([result.md](done/INT-002-devtools-mcp-apply-verify/result.md)) |
| [INT-004](done/INT-004-component-name-overlay/intent.md) | 화면에 컴포넌트 이름 표시 (디자인 시스템 컴포넌트 사용 여부 확인) | 2026-11-17 | 빌드 시 컴포넌트 이름·DS 속성 주입(React/Vue), 익스텐션 호버 라벨·패널 표시, 예제·README 갱신. Tier 3 검증 Pass, 게이트 필수(하드) 2-pass PASS_WITH_NOTES ([result.md](done/INT-004-component-name-overlay/result.md)) |
| [INT-005](done/INT-005-on-screen-comments-issue-slack/intent.md) | 화면 위 코멘트 작성과 GitHub Issues·Slack 연동 | 2026-11-17 | 소스 위치 기반 코멘트 작성·번호 핀·`chrome.storage.local` 복원, 서버 `POST /comments`·`CommentStore`(500건), MCP `list_comments`·`mark_comments_resolved`. Tier 3 검증 Pass(AC-1~AC-8), 게이트 필수(하드) 2-pass FAIL→PASS_WITH_NOTES. GitHub Issues·Slack 연동은 후속 ([result.md](done/INT-005-on-screen-comments-issue-slack/result.md)) |
| [INT-006](done/INT-006-copy-ai-implementation-prompt/intent.md) | 선택 요소·변경 내역을 AI 구현 프롬프트로 복사 | 2026-11-17 | `prompt.ts` `buildPrompt`(내역 전체/선택 요소 한국어 마크다운 프롬프트)+단위 테스트 19케이스, 패널 `AI 프롬프트 복사` 버튼·`navigator.clipboard`→`execCommand` 폴백, README 1단락. Tier 2 검증 Pass(AC-1~AC-8, 291 tests), 게이트 조건부-실행 1-pass PASS_WITH_NOTES ([result.md](done/INT-006-copy-ai-implementation-prompt/result.md)) |
