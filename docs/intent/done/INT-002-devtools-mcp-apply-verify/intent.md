---
id: INT-002
title: chrome-devtools-mcp로 소스 반영 결과 자동 확인 (워크플로 문서화)
status: done
priority: P2
created: 2026-11-17
updated: 2026-11-17
updated_at: 2026-11-17T12:06:29+09:00
---

# Intent: chrome-devtools-mcp로 소스 반영 결과 자동 확인 (워크플로 문서화)

## 문제 (Problem)
- DOMirror의 종단 흐름(브라우저 CSS 수정 → 서버 전송 → 에이전트 소스 반영)에서 마지막 단계인 "소스 반영이 실제 화면에 보이는가"는 사람이 페이지를 새로고침해 눈으로 확인한다.
- 에이전트는 화면을 보지 못한 채 `mark_changes_applied`를 호출하므로, 라인 어긋남·스타일 우선순위·잘못된 파일 수정으로 화면 값이 `after`와 달라도 "반영 완료"로 표시될 수 있다.
- 영향 대상: DOMirror로 CSS를 수정하고 MCP 지원 에이전트(Claude Code 등)에 반영을 맡기는 프런트엔드 개발자(요청자 본인).

## 제안 결과 (Proposed outcome)
- README에 chrome-devtools-mcp를 domirror MCP와 함께 에이전트에 등록하는 방법이 안내된다.
- README에 검증 포함 프롬프트 예가 있다: 에이전트가 소스 반영 후 chrome-devtools-mcp(`get_css_styles`·`evaluate_script`·`take_screenshot` 등)로 `pageUrl` 페이지에서 `data-domirror`=`source` 위치 요소를 찾아 `property`의 계산값이 `after`와 일치하는지 확인한다.
- 일치한 항목만 `mark_changes_applied`로 표시하고, 불일치 항목은 표시하지 않고 사용자에게 보고하는 규칙이 문서에 명시된다.
- 사용자는 새로고침·육안 확인 없이 에이전트 보고로 반영 성공/불일치를 알 수 있다.

## 영향 사용자 및 시스템 (Affected users and systems)
- 사용자: DOMirror 사용자(프런트엔드 개발자).
- 변경 대상: `README.md`(MCP 등록·프롬프트 예·사용법·보안 주의 섹션). 패키지(`packages/*`)·예제(`examples/*`) 코드는 변경하지 않는다.
- 연동 외부 도구: ChromeDevTools/chrome-devtools-mcp(Apache-2.0, Puppeteer·CDP 기반 MCP 서버, 도구 63개), MCP 지원 에이전트(Claude Code 등).
- 데이터: 기존 `StyleChange` 필드(`source`·`selectorHint`·`property`·`before`·`after`·`pageUrl`)만 사용한다.

## 제약 (Constraints)
- 패키지 코드 변경 0건: 서버 MCP 도구 계약(`list_pending_changes`·`mark_changes_applied`)과 `StyleChange` 스키마를 바꾸지 않는다.
- 보안 안내 필수: chrome-devtools-mcp는 페이지 내용·쿠키를 에이전트에 노출하고, 원격 디버깅 포트를 열면 같은 컴퓨터의 다른 프로그램도 브라우저를 조작할 수 있으며, 사용 통계·CrUX 전송이 기본 켜짐(`--no-usage-statistics`·`--no-performance-crux`로 끔)임을 README에 적는다.
- chrome-devtools-mcp 사실(도구명·플래그·연결 방식)은 2026-11-17 README·docs 조회 기준이며, spec 단계에서 버전 고정·재확인이 필요하다(가정).
- 일정·기술 스택 외 제약: (제약 없음 또는 미확정)

## 배경 · 결정 · 참조 (Context handoff)
- 원 요구: "ChromeDevTools/chrome-devtools-mcp 이거 참조해봐. 새 프로젝트에 적용하려는 것과 연관성이 있어." (출처: 대화 요청, 2026-11-17)
- D-01: 적용 대상은 DOMirror, 적용 방식은 "반영 결과 자동 확인" 1건 — 근거: 사용자 선택(질문 카드 1·2) / 폐기 대안: 익스텐션 없이 위치 찾기, 수동 확인 체크리스트 E2E 자동화, domirror-server 설계 참고만
- D-02: 완료 형태는 README 워크플로 문서화(코드 변경 0건), 불일치 시 `mark_changes_applied` 보류 — 근거: 사용자 선택(질문 카드 3), 검증 데이터가 이미 `StyleChange`에 있음 / 폐기 대안: 서버에 검증 상태 기록(MCP 계약 변경), 검증 스크립트 패키지 제공
- D-03: 요구 원자 1개(분해 없음), 우선순위 P2 — 근거: 변경 경로가 README 하나로 5기준 ①③ 미충족, 사용자 미지정·긴급 표현 없음
- 참조: `README.md:131` 에이전트 등록 명령(`claude mcp add ... domirror`), `README.md:143` `StyleChange` 필드, `README.md:145` 현 프롬프트 예(검증 단계 없음), `README.md:163` 사용법 8단계 "새로고침해 확인"
- 범위 밖·전제: 익스텐션 대체·E2E 자동화·서버 설계 변경은 하지 않음. chrome-devtools-mcp 설치·버전 관리는 사용자 몫이며 DOMirror는 의존성으로 추가하지 않음
- 환경·재현: macOS(Darwin 25.6.0), zsh, 저장소 `/Users/dev-juhee/dev-Joy/DOMirror` `main`(HEAD `da24fd1`), Node 22.12+·pnpm 10, 예제 dev 서버 React 5173·Vue 5174, domirror 서버 `127.0.0.1:47321`
- 인계 지시: 다음은 `z_skill_intent_to_specplan`. spec에서 Chrome 연결 방식 권장안(기본 전용 프로필 새 창 / `--browser-url` / `--autoConnect`(Chrome 144+))과 HMR 반영 대기 방법을 결정하고, 실제 예제 앱에서 프롬프트로 검증 루프가 성립하는지 확인 기준(AC)을 정한다

## 미해결 질문 (Open questions)
- 없음

## 작업 (Tasks)
- [x] T-01 [P2] upstream chrome-devtools-mcp 플래그·도구명 재확인(1.13.0, 2026-11-17 기준) (2026-11-17)
- [x] T-02 [P2] 검증 스니펫 작성·React 예제 실측(AC-3 7케이스·AC-4 거짓 일치 확인) (2026-11-17)
- [x] T-03 [P2] README §4 등록·별도 브라우저 이유·검증 프롬프트·스니펫 추가 (2026-11-17)
- [x] T-04 [P2] README 사용법 8단계·보안 주의·수동 체크리스트 추가 (2026-11-17)
- [x] T-05 [P2] 형식·범위 확인 및 정합성 판정 결함 수정(판정 표 문구) 반영 (2026-11-17)

## 결과
- 완료일: 2026-11-17. README에 chrome-devtools-mcp 병행 등록·검증 프롬프트·검증 스니펫(일치 항목만 반영 완료 표시)·보안 주의·체크리스트를 추가했다(패키지·예제 코드 변경 0건).
- 정합성 게이트 조건부-실행 1-pass, 판정 표 문구 결함 수정 후 재판정 PASS_WITH_NOTES.
상세: [result.md](result.md)
