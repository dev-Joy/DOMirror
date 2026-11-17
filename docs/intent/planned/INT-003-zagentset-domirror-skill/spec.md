# Spec: zAgentSet용 DOMirror 스킬·서브에이전트 연동
- Intent: [INT-003](intent.md) | Status: planned | 작성일: 2026-11-17
- Intent updated_at: 2026-11-17T15:48:19+09:00

## 1. 개요
- 문제: DOMirror로 브라우저에서 고친 CSS를 소스에 반영하려면 사용자가 매번 `list_pending_changes` 조회 → 소스 수정 → `mark_changes_applied` 표시를 직접 지시해야 한다. 이 절차가 zAgentSet의 스킬 체계에 없다(`~/.zAgentSet`에 DOMirror 관련 스킬 0건, 2026-11-17).
- 목표: zAgentSet 원본 저장소(`/Users/dev-juhee/dev-Joy/zAgentSet`)의 `src/skills/`에 프롬프트 전용 스킬 `z_skill_domirror`를 추가한다. 스킬을 호출하면 pending 변경 조회 → `code-implementer`(→ `code-tester`) 파이프라인으로 소스 반영 → 반영된 id만 `mark_changes_applied` 표시가 실행된다. sync(`update.sh`)로 `~/.zAgentSet/skills`에 배포한다.
- 확정 결정(intent 미해결 질문 5건 답변):
  - "zAgentSkill" = zAgentSet(`~/.zAgentSet`).
  - 스킬명은 `z_skill_domirror`.
  - 전용 서브에이전트는 만들지 않는다. 반영은 기존 `code-implementer → code-tester` 파이프라인을 거친다.
  - MVP 범위는 조회 → 반영 → 표시. 서버 기동·MCP 등록 안내와 INT-002 자동 확인 연계는 범위 밖이다.
  - 구현은 zAgentSet 원본 저장소에서 하고 sync로 배포한다. DOMirror 저장소에는 요구 기록(intent/spec/plan)만 남긴다.

## 2. 범위 (In-scope / Out-of-scope)
- In-scope
  - `zAgentSet/src/skills/z_skill_domirror/SKILL.md` 신설. 프롬프트 전용이며 `scripts/`는 없다.
  - 스킬 목록 3곳에 등재
    - `zAgentSet/src/skills/README.md` 「3. 기본 제공 스킬 목록」 표
    - `zAgentSet/AGENTS.md` §3 디렉터리 트리
    - `zAgentSet/README.md` 디렉터리 트리
  - `update.sh`(sync)로 `~/.zAgentSet/skills/z_skill_domirror/` 배포 확인.
- Out-of-scope
  - DOMirror 익스텐션·플러그인·서버 기능 변경, MCP 도구 계약(도구 2개·입출력 스키마) 변경.
  - 전용 서브에이전트(`src/agents/`) 신설.
  - DOMirror 서버 기동 안내, `claude mcp add` 등록 안내·자동화.
  - INT-002 반영 결과 자동 확인(chrome-devtools-mcp) 연계.
  - INT-007(수정 금지 영역 경고 하네스) 기능. 관련 intent로 참조만 한다.

## 3. 영향 시스템 · 모듈 · 데이터
- DOMirror MCP 서버(변경 없음, 계약 참조만)
  - `packages/server/src/mcp.ts:7` `export const SERVER_NAME = 'domirror';`
  - `packages/server/src/mcp.ts:24` `'list_pending_changes',`: 입력 없음. 출력은 `:30` `z.object({ changes: z.array(StyleChangeSchema) })`, `readOnlyHint: true`(`:31`).
  - `packages/server/src/mcp.ts:37` `'mark_changes_applied',`: 입력 `:41` `z.object({ ids: z.array(z.string()).min(1) })`, 출력 `:42` `z.object({ applied: z.array(z.string()), notFound: z.array(z.string()) })`, `idempotentHint: true`(`:43`).
  - `packages/server/src/mcp.ts:11-15`: `jsonResult`가 `content[text]`(JSON 문자열)와 `structuredContent`를 함께 반환한다.
  - `packages/server/src/schema.ts:6-23` `StyleChangeInputSchema`
    - `id`
    - `source{file,line,column,inherited}`(`:8-13`)
    - `selectorHint`(`:14`), `property`(`:15`), `before{authored:string|null, computed}`(`:16-19`)
    - `after`(`:20`), `pageUrl`(`:21`), `createdAt`(`:22`)
  - `packages/server/src/schema.ts:25-27`: `StyleChangeSchema`에 `status: 'pending'|'applied'`가 추가된다.
  - `packages/shared/src/types.ts:13` `export interface StyleChange`
- DOMirror 문서(참조)
  - `README.md:126` `## 4. Claude Code에 서버 등록`. 등록 명령은 `README.md:131` `claude mcp add --transport http domirror http://127.0.0.1:47321/mcp`.
  - `README.md:147-152`: 에이전트용 프롬프트 예. source 위치의 property를 after로 바꾸고, `selectorHint`·`before.authored`를 대조해 불일치하면 반영하지 않으며, 반영한 id만 `mark_changes_applied`에 넘긴다.
  - `README.md:154` `### 반영 결과 자동 확인 (선택: chrome-devtools-mcp)`. 범위 밖이며 참조만 한다.
  - `README.md:283` `- **위치 검증 없음**: … **에이전트가 \`selectorHint\`와 \`before\`로 대조할 책임**이 있습니다.`
  - 서버 기동은 `README.md:97` `pnpm --filter @domirror/server start`, 헬스 체크는 `README.md:114` `curl http://127.0.0.1:47321/health`. 스킬의 오류 안내 문구에서만 인용한다.
- zAgentSet 원본 저장소(`/Users/dev-juhee/dev-Joy/zAgentSet`, git, HEAD `03327fa` v0.2.122)
  - `src/skills/README.md:7-14`: 디렉터리 구조. `SKILL.md`는 필수, `scripts/`·`references/`·`examples/`는 선택이다.
  - `src/skills/README.md:16-26`: SKILL.md 형식.
  - `src/skills/README.md:28`: description 규칙. ① 무엇을 하는지 ② 언제 참조하는지 ③ 유사 스킬과의 경계를 1~3문장으로 쓰고, 작은따옴표로 감싸며 내부 `'`는 `''`로 쓴다.
  - `src/skills/README.md:57-76`: 「3. 기본 제공 스킬 목록」 표. 마지막 행은 `:76` `z_cmd_doit_summary`다.
  - `src/templates/skill/SKILL.md:1-4`: 템플릿(`name: template-skill`). 배포 제외 경로다(`AGENTS.md:38`).
  - `src/skills/z_skill_grill_me/SKILL.md:1-4`: frontmatter는 `name`과 `description` 2필드다. 이 스킬도 프롬프트 전용 예시다.
  - `AGENTS.md:37` `### 2.4 스킬 표준 규격 및 스크립트 인코딩`. `:39`에서 `*.md`는 UTF-8(No BOM)+LF로 정한다.
  - `AGENTS.md:115` `### 5.1 프로젝트 특화 추가 검증`. `:119`에서 `src/skills/` 수정 시 인코딩 검사와 sync 전역 반영 확인을 요구한다.
  - `AGENTS.md:61-78`: §3 디렉터리 트리(`:78` `z_skill_version_update`).
  - `README.md:125-145`: 디렉터리 트리(`:145` `z_cmd_doit_summary`). `README.md:156-160` 「새 스킬 추가하기」.
  - `src/skills/z_skill_intent_to_specplan/SKILL.md:15`: 파이프라인 위임 서술 예시(`code-planner`→`code-implementer`→`code-tester`→`conformance-reviewer`).
- 배포(sync)
  - `scripts/sync.sh:27`이 `INSTALL_ROOT="${HOME}/.zAgentSet"`를 정한다.
  - `:73`이 `prompts/agents/skills/mcp`를 순회하고 `:92` `shutil.copy2`로 복사한다.
  - `:94` 이후 원본에 없는 파일을 prune한다. 예외는 `config/harnesses.json:4-6` `preserve`와 `externalSkills`다.
  - `config/harnesses.json:89-93`: claude-code의 `skills`는 디렉터리 단위 링크다. 그래서 `~/.claude/skills -> ~/.zAgentSet/skills`가 되고, 스킬별 등록 항목이 필요 없다.
  - 래퍼 `update.sh`는 `scripts/sync.sh sync "$@"`를 실행한다. `sync.sh:18-21`이 `--dry-run`과 `status`를 지원한다.
- 서브에이전트 SSOT: `~/.zAgentSet/agents/code-implementer.md`(존재), `code-tester.md`.

## 4. 기능 요구사항 (FR-n)
- **FR-1 스킬 파일**: `src/skills/z_skill_domirror/SKILL.md`를 만든다.
  - frontmatter는 `name: z_skill_domirror`와 작은따옴표로 감싼 `description` 2필드뿐이다(`src/skills/README.md:28`).
  - description에는 ① 기능 ② 트리거(예: "DOMirror 변경 반영", "브라우저 CSS 수정 소스 반영") ③ 경계를 담는다. 경계는 서버 기동·MCP 등록, INT-002 자동 확인은 다루지 않는다는 것이다.
- **FR-2 사전 점검**
  - 스킬은 먼저 `domirror` MCP 도구(`list_pending_changes`)를 쓸 수 있는지 확인한다.
  - 쓸 수 없으면 반영을 0건 하고 중단한다. 중단할 때 원인 후보 1줄과 참조 위치 1줄을 안내한다.
    - 원인 후보: 서버 미기동 또는 MCP 미등록.
    - 참조 위치: DOMirror `README.md`의 「4. Claude Code에 서버 등록」.
  - 서버를 기동하거나 등록하는 일은 수행하지 않는다.
- **FR-3 조회·요약**
  - `list_pending_changes`를 호출한다. 결과가 0건이면 "반영할 변경 없음"을 보고하고 종료한다.
  - 1건 이상이면 `source.file` 기준으로 그룹화해 표로 요약한다. 열은 `id / file:line:column / selectorHint / property / before.authored → after`다.
- **FR-4 반영 위임**: 반영은 오케스트레이터가 직접 하지 않고 `code-implementer`에 위임한다(전역 규칙 1 역할 경계). 위임 프롬프트에는 다음 대조 규칙을 명시한다.
  - 일치 조건: 각 항목에서 `source.file:line` 위치의 선언이 `selectorHint`·`property`와 일치하고, 현재 값이 `before.authored`와 일치해야 한다. 이 조건을 만족할 때만 `property` 값을 `after`로 바꾼다.
  - 불일치 처리: 불일치하거나 모호하면 반영하지 않고 사유와 함께 `skipped`로 보고한다.
  - `before.authored`가 `null`이거나 `source.inherited`가 `true`인 항목: 자동 반영하지 않고 `skipped(판단 필요)`로 보고한다(§7 E-3·E-4).
  - 보고 형식: 항목별 `id / 결과(applied|skipped) / 파일:라인 / 사유`.
- **FR-5 검증 위임**: `code-implementer`가 반영한 항목이 1건 이상이면 `code-tester`에 위임한다. 검증은 프로젝트 설정 도구 기준 Tier 1~2 최소 확인이다. 실패하면 전역 규칙 5(합산 3회)에 따라 수정 루프를 돈다.
- **FR-6 적용 표시**
  - `code-tester`가 Pass를 보고하면 `code-implementer`가 `applied`로 보고한 id만 모아 `mark_changes_applied({ ids })`를 1회 호출한다.
  - `skipped`나 검증 실패 항목은 표시하지 않는다. 반영 id가 0건이면 이 호출을 생략한다(`ids`는 `min(1)`).
- **FR-7 완료 보고**: 다음을 보고한다.
  - 건수: 조회 N / applied a / skipped s / notFound n.
  - skipped 사유 목록.
  - 응답의 `notFound`가 비어 있지 않으면 그 id 목록.
- **FR-8 목록 등재**: 신규 스킬을 다음 3곳에 기존 형식대로 1행씩 추가한다.
  - `src/skills/README.md` 「3. 기본 제공 스킬 목록」 표
  - `AGENTS.md` §3 트리
  - `README.md` 트리
- **FR-9 배포**: `update.sh`로 sync를 실행한다. `~/.zAgentSet/skills/z_skill_domirror/SKILL.md`가 생성되고 `~/.claude/skills/z_skill_domirror/SKILL.md`로 보이는지 확인한다.

## 5. 비기능 요구사항 (NFR-n)
- **NFR-1 인코딩**: 신규·수정 `*.md`는 UTF-8(No BOM)+LF이고 CR은 0건이다(`zAgentSet/AGENTS.md:39`).
- **NFR-2 계약 불변**: DOMirror MCP 도구 이름·입출력 스키마를 바꾸지 않는다. 스킬은 §3에 인용한 스키마만 전제한다.
- **NFR-3 하네스 중립**: 스킬 본문은 특정 하네스의 위임 도구 이름(`Task`·`invoke_subagent`)에 의존하지 않는다. 서브에이전트 미지원 하네스에서는 전역 규칙 2 페르소나 폴백을 따른다고 1줄로 명시한다.
- **NFR-4 최소 변경**: 기존 스킬·스크립트·설정(`scripts/`·`config/`)은 수정 0건이다.
- **NFR-5 문체·분량**: 기존 SKILL.md 관례(한국어, 표·번호 목록 위주)를 따른다.

## 6. 인터페이스 · 데이터 스키마
- **확정**(DOMirror 서버 현행 계약, `packages/server/src/mcp.ts`·`schema.ts`):
  ```text
  list_pending_changes() -> { changes: StyleChange[] }
  mark_changes_applied({ ids: string[] /* min 1 */ }) -> { applied: string[], notFound: string[] }
  StyleChange = { id, source{file,line,column,inherited}, selectorHint, property,
                  before{authored: string|null, computed}, after, pageUrl, createdAt,
                  status: 'pending'|'applied' }
  ```
- **초안**(스킬 내부 위임 계약)
  - `code-implementer` 입력: StyleChange 배열, FR-4 대조 규칙, 작업 루트(현재 프로젝트).
  - `code-implementer` 출력: `[{ id, result: 'applied'|'skipped', location: 'file:line', reason }]`.
- **초안**(SKILL.md 골격): frontmatter → 1. 핵심 정책 → 2. 실행 절차(사전 점검·조회·반영 위임·검증·표시) → 3. 예외 처리 → 4. 보고 형식.

## 7. 예외 · 엣지 케이스
- **E-1** MCP 도구 미가용(서버 미기동·미등록·포트 불일치): FR-2에 따라 반영 0건으로 중단하고 안내한다.
- **E-2** pending 0건: 위임 없이 종료한다.
- **E-3** `before.authored === null`(소스에 선언이 없어 새로 추가해야 하는 경우): 자동 반영하지 않고 `skipped(판단 필요)`로 둔다.
- **E-4** `source.inherited === true`(상속된 값): 수정 위치가 모호하므로 `skipped(판단 필요)`로 둔다.
- **E-5** 소스 라인 드리프트(`README.md:283` 위치 검증 없음): `selectorHint`·`before.authored`로 대조해 불일치하면 skipped로 둔다. 근처 탐색으로 추측 반영하지 않는다.
- **E-6** 동일 `file:line`·`property`에 대한 중복 변경: `createdAt`이 가장 늦은 항목만 반영 후보로 삼는다. 나머지는 `skipped(중복)`이며 표시하지 않는다.
- **E-7** `code-tester` 실패 후 루프 3회 소진: `mark_changes_applied`를 호출하지 않는다. 진단 리포트를 보고하고 반영분은 사용자 판단에 맡긴다.
- **E-8** `mark_changes_applied` 응답 `notFound` ≠ ∅ (그사이 서버 재시작 등): 해당 id를 보고한다. 소스 반영은 유지한다.
- **E-9** `source.file`이 현재 작업 루트 밖이거나 존재하지 않음: skipped로 둔다.

## 8. 수용 기준 (AC-n)
- **AC-1** `zAgentSet/src/skills/z_skill_domirror/SKILL.md`가 있고, frontmatter가 `name: z_skill_domirror`와 작은따옴표 description 2필드뿐이다. 검증 명령: `head -4`.
- **AC-2** SKILL.md 본문에 FR-2~FR-7 절차와 E-1~E-9 처리가 모두 서술되어 있다. 검증 명령: `rg -n "list_pending_changes|mark_changes_applied|selectorHint|before.authored|code-implementer|code-tester"` 각 1건 이상.
- **AC-3** `src/skills/README.md`, `AGENTS.md`, `README.md` 3곳에 `z_skill_domirror`가 등재되어 있다. 검증 명령: `rg -n z_skill_domirror`로 3파일 각 1건 이상.
- **AC-4** 신규·수정 md 파일에 BOM 0건, CR 0건. 검증 명령: `head -c3 | xxd`, `grep -c $'\r'`.
- **AC-5** `update.sh` 실행 후 `~/.zAgentSet/skills/z_skill_domirror/SKILL.md`가 원본과 내용이 같다(`cmp` exit 0). `~/.claude/skills/z_skill_domirror/SKILL.md`로 접근할 수 있다.
- **AC-6** `scripts/`·`config/`·기존 스킬 diff 0건. 검증 명령: `git diff --stat`.
- **AC-7** (수동 시나리오, 선택) DOMirror 서버 기동과 pending 1건 이상인 상태에서 스킬을 호출하면 일치 항목만 소스에 반영되고 해당 id만 applied로 전이된다. 확인은 `curl http://127.0.0.1:47321/health`의 `pending` 감소로 한다.

## 9. 가정과 리스크
- 가정
  - A-1: 스킬을 호출하는 하네스에 `domirror` MCP 서버가 이미 등록되어 있다(등록은 범위 밖).
  - A-2: `code-implementer`·`code-tester`의 SSOT 명세(`~/.zAgentSet/agents/*.md`)는 현행대로 유지된다.
  - A-3: `skills` 디렉터리 링크 방식(`config/harnesses.json:89-93`)이 유지되어 sync만으로 배포된다.
- 리스크
  - R-1: zAgentSet 측 Spec/Plan Gate 해석. zAgentSet에도 자체 `docs/intent/`가 있어(CHANGELOG에 `INT-041` 등 표기), 구현 세션이 zAgentSet intent 부재를 이유로 중단할 수 있다. §10 Q-1에서 결정한다.
  - R-2: 반영 정확도는 에이전트 대조 품질에 의존한다(`README.md:283`). 완화책은 불일치 시 skip을 기본값으로 하는 것(FR-4)이다.
  - R-3: sync prune. `~/.zAgentSet/skills/synced/`(2026-11-17 15:20 생성)는 원본과 `preserve`에 없어 다음 sync 때 prune될 수 있다. 실측하지 않았다. 사용자가 만든 것이면 sync 전에 확인해야 한다.
  - R-4: `src/skills/` 실질 변경이므로 §A 3호② `필수(하드)` 2-pass를 거쳐야 하고, 이 때문에 소요가 늘어난다.
- 인계 충실성 대조표 (11범주)

| 범주 | intent 기록 위치 | spec 반영 | plan 반영 | 판정 |
| :--- | :--- | :--- | :--- | :--- |
| 1. 원 요구 | 배경 IDEA-20261115-01·02 | §1 | §3 | 반영 |
| 2. 결정(D-n) | 배경 D-01·D-02, 미해결 질문 답변 5건 | §1 확정 결정, §2 | §1·§2 | 반영 |
| 3. 범위 밖·전제 | 배경 「범위 밖·전제」 | §2 Out-of-scope | §5 | 반영 |
| 4. 영향 시스템 | 영향 사용자 및 시스템 | §3 | §2 | 반영 |
| 5. 코드 참조(경로:라인) | `mcp.ts:24`·`:37`, `README.md:126`·`:154`·`:283` | §3(±0 재실존 확인) | §2 | 반영 |
| 6. 제약 | 제약 4항 | §5 NFR-2·NFR-4, §9 R-4 | §1·§4 | 반영 |
| 7. 환경·재현 | macOS(Darwin 25.6.0), zsh, 비 git 배포본 | §3 배포·§9 A-3 | §2 S-6 | 반영 |
| 8. 인계 지시 | 「첫 행동: 원본 저장소·스킬 규약 확인」 | §3 zAgentSet 규약(확인 완료) | §2 S-1 | 반영 |
| 9. 관련 intent | INT-007(·INT-001·INT-002) | §2 Out-of-scope | §5 | 반영 |
| 10. 우선순위·일정 | P2, 일정 제약 없음 | §1 | §1 | 반영 |
| 11. 미해결 질문 | 5건 전부 `[x]` | §1 확정 결정, §10 신규 | §3 | 반영 |

- 모의 독해: 새 세션은 spec/plan만으로 원본 저장소 경로, 변경 파일 4개, 스킬 규약, 검증 명령, 배포 명령을 모두 알 수 있어 실행 가능하다. 단, §10 Q-1·Q-2 확정이 선행되어야 한다.

## 10. 미해결 질문 (Open questions)
- [x] Q-1: zAgentSet 저장소에서 구현할 때 zAgentSet 측 `docs/intent/`에 별도 intent를 등록하는가? → 답변: 별도 등록 안 함 — DOMirror INT-003 spec/plan을 게이트 근거로 삼고, zAgentSet 커밋·CHANGELOG에 `(DOMirror INT-003)` 표기 (2026-11-17)
  - (권장) 등록하지 않는다. DOMirror INT-003 spec/plan을 게이트 근거로 삼고, zAgentSet 커밋·CHANGELOG에 `(DOMirror INT-003)`을 표기한다.
  - 대안: zAgentSet에 INT를 신규 등록하고 이 spec을 인용한다.
- [x] Q-2: pending 조회 후 반영 위임 전에 사용자 확인(HITL)을 받는가? → 답변: 받지 않음 — 대조 일치 항목은 자동 반영, skip 항목만 보고(FR-3·FR-4 유지) (2026-11-17)
  - (권장) 받지 않는다. 스킬 호출 자체를 지시로 보고, 대조 일치 항목은 자동 반영하며 skip 항목만 보고한다.
  - 대안: 요약 표를 제시한 뒤 1회 승인을 받는다.
