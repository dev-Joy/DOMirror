# Result: 브라우저 클릭 CSS 수정의 소스 코드 반영 (프레임워크 무관 DOM→소스 매핑)
- Intent: [INT-001](intent.md) | 완료일: 2026-11-17 | Tier: 3 (자동 판정) | Spec/Plan: [spec.md](spec.md) · [plan.md](plan.md)

## 결과 요약
- 번들러 플러그인(React·Vue 소스 위치 주입) + 크롬 익스텐션(클릭 선택·CSS 편집·간격 보기·전송) + 로컬 MCP 서버(`list_pending_changes`·`mark_changes_applied`) 조합을 구현했다. 버전 0.1.10.
- AC-8 종단: React·Vue 예제에서 브라우저 CSS 수정 → 전송 → MCP 에이전트가 `src/styles.css`에 반영 → 새로고침 화면에 같은 값이 보이는 것을 확인했다.
- 정합성 게이트(필수(하드), 2-pass) 최종 HEAD `0afa539`에서 1차·2차 모두 PASS_WITH_NOTES(비차단), 신규 결함 0건.

## 변경 산출물
`git diff --name-status 0227ad1 0afa539` 기준 95파일(추가 91·수정 1·이름 변경 3), +7658/-4.

| 경로 | 변경 | 핵심 내용 1줄 |
| :--- | :--- | :--- |
| `packages/plugin/` | 신규(19파일) | 빌드 시 요소별 소스 위치 속성(`data-domirror`) 주입 플러그인(주입기 구조) |
| `packages/server/` | 신규(12파일) | 127.0.0.1 로컬 MCP 서버, Host/Origin 검증, 대기 변경 upsert |
| `packages/extension/` | 신규(29파일) | 크롬 익스텐션 MV3: 요소 선택·소스 위치 표시·CSS 편집 패널·되돌리기·전송·간격 보기·전송 중 편집/되돌리기 잠금 |
| `packages/shared/` | 신규(8파일) | 공통 타입·스키마 |
| `examples/react-vite/`, `examples/vue-vite/` | 신규(각 7파일) | React·Vue 검증용 예제 앱 |
| 루트(`package.json`·`pnpm-workspace.yaml`·`tsconfig.base.json`·`vitest.config.ts`·`.oxlintrc.json`·`.gitignore`·`pnpm-lock.yaml`·`README.md`·`CHANGELOG.md`) | 신규 | 모노레포 설정, 사용 문서(수동 확인 체크리스트·제약 공개), 변경 이력 |
| `docs/intent/` | 수정·이동 | INT-001 intent·spec·plan, INDEX |

## 검증 결과
| 항목 | 결과 | 증거(출처) |
| :--- | :--- | :--- |
| 설계 (`code-planner`) | 완료 | `plan.md` §1 Tier 3, §2 Step 0~10, 결함 시 설계 회귀 1회(`54fff20` 이전) |
| 정적 분석·린트 | Pass | `code-tester` 최종 검증(HEAD `0afa539` 트리): 루트 `typecheck`·`lint` exit 0 |
| 단위·통합 테스트 | Pass | `code-tester`: 루트 `test` exit 0 (20파일 196건), `build` exit 0, 플러그인 끈 빌드 `data-domirror` 0건, extension dist IIFE·UTF-8 |
| 브라우저 검증(ego→Aside→Playwright) | Pass | `code-tester`: Chrome for Testing 145 + CDP, 잠금 시나리오 React 46/46·Vue 46/46. 회귀 드라이버 실패는 잠금 정책으로 기대값이 바뀐 항목뿐 |
| AC-8 종단(React) | Pass | 아래 「AC-8 종단 증거」 |
| AC-8 종단(Vue) | Pass | 아래 「AC-8 종단 증거」 |
| 전역 배포(sync/Status)·인코딩 | 미수행(사유: 전역 배포 대상 아님, 로컬 저장소 커밋만·push 안 함). 인코딩은 extension dist UTF-8 확인 | `code-tester` 원시 출력 |
| 정합성 게이트 | 필수(하드) / 근거: ① Tier 3, ② 계약 자산 성격(manifest 권한), ④ 보안(127.0.0.1 리스너·Host/Origin 검증) / 방식: 2-pass / 미검증: 미검증(정합성): 필수(하드) 일부 면제(두 탭 동시 편집 상충 — README:192 공개) + 잔여 리스크: 사용자가 우회책을 지키지 않으면 에이전트에 상충 지시 2건이 전달될 수 있음 | 오케스트레이터 게이트 판정 기록(§A) |
| conformance-reviewer | PASS_WITH_NOTES (1차 순방향) / PASS_WITH_NOTES (2차 반증), 신규 결함 0건 | 아래 NOTE 요약 |

### conformance-reviewer NOTE (모두 비차단)
- 1차 N-1: `content.ts:198` `onSendEnd()` 호출 제거 변이는 단위 테스트 미검출 — 브라우저 잠금 시나리오가 매번 "unlocked" 단언으로 방어.
- 1차 N-2: 잠금 중 위치 없는 항목의 되돌리기도 잠김 — 최대 약 10초, README:189 공개.
- 1차 N-3: 입력 후 Enter 없이 바로 전송 클릭 시 버튼이 밀려 첫 클릭 미전송(B7) — 잠금 이전(`6746ca3`)부터 있던 레이아웃 동작, 값 유실 없음.
- 2차 N-1: 서버가 upsert한 뒤 응답 전에 SW 종료·재로드·10초 초과가 겹치면 패널은 "전송 실패"이나 서버엔 값이 있을 수 있음(README 미공개, `0afa539` 이전부터의 경로, 재전송은 id upsert라 중복 없음).
- 2차 N-2: AC-8 증거는 v0.1.7 기준이나 이후 변경이 전송 페이로드·서버·플러그인을 바꾸지 않아 유효.

### 정합성 검증 이력
`ada276c` FAIL 4건 → `dc26b65` 수정 → FAIL 3건 → 설계 회귀 → `54fff20` → FAIL(D-A·D-B·D-C) → 사용자 승인 추가 수정 `6746ca3` → FAIL(F-1) → 사용자 승인 잠금 재설계 `0afa539` → PASS_WITH_NOTES ×2.

### 사용자 결정·옵트아웃
- 수정 요청 합산 상한 3회 소진 후 사용자가 추가 수정 1회(D-A 코드·D-B·D-C 문서)를 승인, 이후 F-1 발견 시 다시 "전송 중 편집·되돌리기 잠금" 재설계를 승인(추가 수정 1회). 전송 대기 중 조작 계열 결함(D-1·D-A·F-1)은 잠금으로 구조적 제거.
- 옵트아웃(문서화로 수용): 두 탭에서 같은 소스·속성을 각각 편집하면 다시 켤 때 같은 위치 항목 2건이 복원되어 상충 지시가 될 수 있음 — README:192 공개.

### AC-8 종단 증거 (원시 로그 2026-11-16 실측 요지)
- 에이전트 실행(`ac8-agent.sh`): `claude -p "<반영 지시>" --mcp-config <임시 ac8-mcp.json> --strict-mcp-config --tools "Read,Edit,Glob,Grep" --allowedTools "Read,Edit,Glob,Grep,mcp__domirror__list_pending_changes,mcp__domirror__mark_changes_applied" --permission-mode dontAsk --max-budget-usd 2 --no-session-persistence --output-format stream-json --verbose` (해당 버전에 `--max-turns` 없음). 임시 MCP 설정: `domirror` → `http://127.0.0.1:47321/mcp`(http). init 기록: 도구 `Edit, Glob, Grep, Read, mcp__domirror__list_pending_changes, mcp__domirror__mark_changes_applied`, `permissionMode: dontAsk`, `claude_code_version: 2.1.325`. 두 실행 모두 `claude exit: 0`.
- **React** (`examples/react-vite`, `http://127.0.0.1:5173/`)
  - 전송 전 서버 대기 0건. h1 `data-domirror` `src/App.tsx:10:7`, `color` `rgb(31, 41, 51)` → 편집 후 `rgb(200, 0, 0)`(패널 1, 변경 목록 `color: rgb(31, 41, 51) → rgb(200, 0, 0)`, `h1.title`).
  - 전송 응답 `{"kind":"ok","text":"전송 완료: 1건"}`. 서버 대기: id `670bb2f5-e0a4-4f74-b3e1-00f87c59e5d0`, source `src/App.tsx` 10:7 `inherited: false`, `selectorHint: h1.title`, `property: color`, before computed `rgb(31, 41, 51)`, after `rgb(200, 0, 0)`, `status: pending`. 페이지 오류 0건.
  - 에이전트 도구 호출 순서: `list_pending_changes` → `Read App.tsx` → `Glob src/**/*.{css,scss,module.css}` → `Grep styles.css` → `Read styles.css` → `Edit styles.css` → `mark_changes_applied ["670bb2f5-…"]`. `list_pending_changes` 1회(재조회 0건). 결과 `success`, 8턴, `total_cost_usd` 0.2346(약 $0.23), 17210ms.
  - 소스 diff: `examples/react-vite/src/styles.css` `.title`에 `+  color: #c80000;`.
  - 새로고침(익스텐션 없음, fresh load) computed `color` `rgb(200, 0, 0)`, inline style 없음. 서버 대기(MCP `list_pending_changes`) `[]`. 페이지 오류 0건.
- **Vue** (`examples/vue-vite`, `http://127.0.0.1:5174/`)
  - 전송 전 서버 대기 0건. h1 `data-domirror` `src/App.vue:11:5`, `padding-top` `0px` → 편집 후 `20px`(패널 1, 변경 목록 `padding-top: 0px → 20px`, `h1.title`).
  - 전송 응답 `{"kind":"ok","text":"전송 완료: 1건"}`. 서버 대기: id `98026084-7908-43b4-b089-baee7df9d03b`, source `src/App.vue` 11:5 `inherited: false`, `selectorHint: h1.title`, `property: padding-top`, before computed `0px`, after `20px`, `status: pending`. 페이지 오류 0건.
  - 에이전트 도구 호출 순서: `list_pending_changes` → `Read App.vue` → `Grep \.title|<style` → `Read styles.css` → `Edit styles.css` → `mark_changes_applied ["98026084-…"]`. `list_pending_changes` 1회(재조회 0건). 결과 `success`, 7턴, `total_cost_usd` 0.1975(약 $0.20), 17733ms.
  - 소스 diff: `examples/vue-vite/src/styles.css` `.title`에 `+  padding-top: 20px;`.
  - 새로고침(익스텐션 없음, fresh load) computed `padding-top` `20px`, inline style 없음. 서버 대기 `[]`. 페이지 오류 0건.
- 정리: 확인 후 예제 원복(`status after react revert: []`). 사용자 Claude Code MCP 설정 키 전후 동일 — before/after 모두 `{"userMcp":["aside","codegraph","mariadb","mdn","stitch"],"projects":{"/Users/dev-juhee/dev-Joy/DOMirror":[]}}`.

## 잔여 리스크 및 후속
- 후속 intent 후보: Angular·Svelte 주입기 추가(intent 미해결 질문 4 답변의 후속 범위), 2차 N-1 "전송 실패" 표시와 서버 실제 상태 불일치 경로의 README 공개 또는 보완.
- 알려진 제약: 두 탭 동시 편집 상충(옵트아웃, README:192), 잠금 중 위치 없는 항목 되돌리기 최대 약 10초 잠김(README:189), N-3 첫 클릭 미전송(B7, 값 유실 없음). 남은 수동 확인(README 「수동 확인 체크리스트」): 실제 툴바 아이콘 클릭, `http://localhost` 주소 activeTab 주입, 정식 Chrome 로컬 네트워크 권한 프롬프트(10초 타임아웃과의 상호작용 포함), 실제 Option 키. / 롤백: `git revert` 또는 `git checkout 0227ad1 -- <경로>`(push 안 함).

## 참조
- 요구: [intent.md](intent.md) · 명세: [spec.md](spec.md) · 계획: [plan.md](plan.md)
- 워크로그: 미기록(사유: 저장소에 `docs/works/` 없음) · 커밋: `0227ad1` 문서, `312bd7f` 배치 A~C, `41a70fb` D, `aaee15c` E, `2fcfe73` F, `cbf60f9` G, `ada276c` H, `dc26b65` R-1~R-4, `54fff20` D-1~D-3, `6746ca3` D-A·D-B·D-C, `0afa539` 잠금 (push 안 함, 완료 전이 문서 변경은 미커밋)
