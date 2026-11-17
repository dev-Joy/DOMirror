---
id: INT-009
title: CSS 편집 패널 확장 — 컬러 피커와 flex/grid 레이아웃 속성 편집
status: active
priority: P2
created: 2026-11-17
updated: 2026-11-18
updated_at: 2026-11-17T23:59:16+09:00
---

# Intent: CSS 편집 패널 확장 — 컬러 피커와 flex/grid 레이아웃 속성 편집

## 문제 (Problem)
- 편집 가능한 속성이 고정 목록 16개(color·background-color·margin/padding 롱핸드·gap·width·height·font-size·font-weight·line-height)뿐이라 실사용 범위가 좁다(`packages/extension/src/properties.ts:19-30`).
- 색상도 일반 텍스트 입력이라 값을 직접 타이핑해야 하며 컬러 피커가 없다(`packages/extension/src/panel.ts:156`).
- flex/grid 컨테이너의 정렬·방향·트랙 속성(justify-content·align-items·flex-direction·grid-template-columns 등)은 편집할 수 없고, 선택 요소의 `display`를 판정하는 로직도 없다. 지금은 레이아웃 변경을 프롬프트에 사람이 직접 적어야 한다.
- 영향 대상: 화면에서 레이아웃·색상을 조정해 소스에 반영하려는 DOMirror 사용자(요청자 본인).

## 제안 결과 (Proposed outcome)
- 색상 속성 필드에 컬러 피커가 붙어 시각적으로 고른 값이 즉시 미리보기되고, 기존 변경 내역(`StyleChange`)으로 기록된다.
- 선택 요소가 flex/grid 컨테이너이면 레이아웃 속성 그룹이 나타나 값을 고를 수 있고(키워드 속성은 선택지), 변경은 기존 `property`/`before`/`after` 형식 그대로 MCP 전송·프롬프트 복사 양쪽에 실린다.
- 레이아웃 변경을 위한 별도 프롬프트 형식은 만들지 않는다(반영 방법 판단은 기존처럼 에이전트 몫).

## 영향 사용자 및 시스템 (Affected users and systems)
- 사용자: DOMirror 사용자.
- 익스텐션: 속성 목록·그룹 `packages/extension/src/properties.ts:3-30`, 필드 생성 `packages/extension/src/panel.ts:146-162`, 현재값 읽기 `packages/extension/src/content.ts:596-597`, 이전값 읽기 `packages/extension/src/css-read.ts:227-244`.
- 프롬프트 생성 `packages/extension/src/prompt.ts:54-90`(`changesPrompt`) — 속성 종류와 무관한 형식이라 변경 불필요 예상.
- 공유 타입 `packages/shared/src/types.ts:19-29`(`StyleChange`) — 계약 변경 없음 예상.

## 제약 (Constraints)
- `StyleChange` 계약과 MCP 도구(`list_pending_changes`·`mark_changes_applied`) 형식은 유지한다.
- 간격은 롱핸드만 다루는 기존 원칙(`properties.ts:1`)을 유지한다.
- 신규 외부 의존성 도입은 사용자 승인 필요. 컬러 피커 구현 방식은 미확정(미해결 질문).

## 배경 · 결정 · 참조 (Context handoff)
- 원 요구: INT-006 프롬프트 복사 결과(`p.lead` padding-top 0px→17px, `src/App.tsx:12:7`)를 본 사용자 피드백 "컬러 picker가 있으면 좋겠고 너무 한정적인 것 같은데, display:grid나 flex로 잡힌 것들은 어떻게 처리할 거냐? 프롬프트로?"
- D-01: 우선순위 P2 — 근거: 사용자 미지정, 긴급 표현 없음
- D-02: 컬러 피커와 레이아웃 속성을 1개 intent로 병합 — 근거: 5기준 ③ 미충족(둘 다 `properties.ts`·`panel.ts` 변경) / 분해 후보는 미해결 질문
- D-03: 레이아웃 변경은 프롬프트 별도 처리가 아니라 편집 속성으로 추가해 기존 변경 내역 경로로 전달 — 근거: `changesPrompt`·`StyleChange`가 속성 무관 형식 / 폐기 대안: 레이아웃 전용 자유서술 프롬프트
- 참조: `packages/extension/src/panel.ts:156` 모든 필드 `type='text'`, extension/src 내 `type=color` 0건
- 범위 밖·전제: 붙여 넣은 `p.lead` padding-top 17px 변경 자체의 소스 반영은 범위 밖(INT-006 출력 예시로만 인용)
- 환경·재현: 예제 페이지 http://127.0.0.1:5199/ 에서 요소 선택 후 편집 패널 확인
- 인계 지시: 미해결 질문 확정 후 `z_skill_intent_to_specplan`
- 관련 intent: INT-006

## 미해결 질문 (Open questions)
- [x] 레이아웃 속성 범위는? (컨테이너만: display·flex-direction·flex-wrap·justify-content·align-items·align-content·grid-template-columns/rows·row-gap·column-gap / 자식 아이템까지: align-self·flex-grow/shrink/basis·order·grid-column/row) → 답변: 컨테이너만 (2026-11-17)
- [x] 레이아웃 그룹 표시 조건은? (계산된 display가 flex/grid일 때만 / 항상 표시) → 답변: flex/grid일 때만(flex·inline-flex·grid·inline-grid), display 필드는 항상 표시 (2026-11-17)
- [x] 컬러 피커 방식은? (네이티브 `input type=color` — hex만·알파 미지원 / 자체 구현 — 알파·CSS 변수 지원, 작업량 큼) → 답변: 네이티브 피커 + 기존 텍스트 입력 병행(알파·rgba·CSS 변수는 텍스트로 입력) (2026-11-17)
- [x] 목록 외 속성을 이름 직접 입력으로 추가하는 자유 입력을 허용하는가? / 컬러 피커와 레이아웃을 별도 intent로 분해하는가? → 답변: 자유 입력 제외(필요 시 INBOX 아이디어), 분해 없이 1개 유지 (2026-11-17)

## 작업 (Tasks)
- [ ] T-01 [P2] 색 변환 모듈 `color.ts`와 `color.test.ts` (plan Step 2·4, AC-1)
- [ ] T-02 [P2] 레이아웃 속성 정의(`properties.ts`)와 `properties.test.ts` (plan Step 3·4, AC-2·AC-3)
- [ ] T-03 [P2] 패널 컬러 피커·select·flex/grid 조건부 표시(`panel.ts`) (plan Step 5, FR-1~FR-10) (depends: T-01, T-02)
- [ ] T-04 [P2] 빌드·브라우저 실측 (plan Step 6, AC-4~AC-7) (depends: T-03)
