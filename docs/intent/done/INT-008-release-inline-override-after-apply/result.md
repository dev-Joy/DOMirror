# Result: 소스 반영 확인 시 익스텐션 인라인 !important 값 해제·원복
- Intent: [INT-008](intent.md) | 완료일: 2026-11-18 | Tier: 2 (자동 판정) | Spec/Plan: [spec.md](spec.md) · [plan.md](plan.md)

## 결과 요약
- 익스텐션 `endSend`가 `forget` 대신 전송 기록(`markSent`)을 남기고, 패널 `반영 확인` 버튼이 전송한 항목의 인라인 `!important`만 `restoreStyle(prev)`로 해제·원복한다.
- 신규 `verify.ts`가 해제 후 computed를 같은 요소에 보낸 값을 잠시 적용해 얻은 기대값과 비교하고(측정 중 `transition: none` 임시 적용), 항목별 `일치`·`불일치`·`확인 불가`와 상태 줄 요약을 표시한다. 미전송 편집값·전송 잠금·`restoreAll`(끄면 원복)은 그대로 유지하고 서버·shared·MCP 계약 변경은 0건이다.
- 신규 테스트 18건으로 AC-1~AC-6을 고정했고 `typecheck`·`lint`·`test`(344 tests)·`build`가 모두 Exit 0이다.

## 변경 산출물
| 경로 | 변경 | 핵심 내용 1줄 |
| :--- | :--- | :--- |
| `packages/extension/src/verify.ts` | 신규 | 주입형 `ReadComputed` 기반 측정(transition 임시 none → 해제 actual → 보낸 값 expected → 해제 복귀 → transition 원복), 요소 판정·항목 합산 규칙 |
| `packages/extension/test/verify.test.ts` | 신규 | V-1~V-7 — match/mismatch/unverifiable(빈 값·분리), 2요소 합산, transition 인라인 원복 |
| `packages/extension/src/applier.ts` | 수정 | `SentRecord`·`#sent`·`markSent`·`sentCount`·`releaseSent` 추가, `restoreAll`에서 `#sent.clear()` |
| `packages/extension/src/edit-tracker.ts` | 수정 | `endSend`의 `forget`을 `markSent`로 교체(마지막 `after`·`selectorHint`·`source` 전달), `sentCount`·`verifySent(read)`(sending 중 `null`) |
| `packages/extension/src/panel.ts` | 수정 | 항목별 확인 결과 목록 렌더(위치/선택자·속성·보낸 값·확인 값·판정), 기존 `button()`·CSS 패턴 재사용 |
| `packages/extension/src/content.ts` | 수정 | 전송 행 `반영 확인` 버튼·활성 조건(`sentCount>0 && !sending`)·click 등록/해제·`getComputedStyle` 기반 reader·`setStatus` 요약 |
| `packages/extension/test/applier.test.ts` | 수정 | A-1~A-8 — 전송 기록·해제·재전송 `prev` 유지·restoreAll 정리 |
| `packages/extension/test/edit-tracker.test.ts` | 수정 | T-1~T-3 — `markSent` 전환·sending 잠금·기존 L1~L5·D-1·D-2·F-1 회귀 |
| `README.md` | 수정 | `:178` 같은 탭 확인 문장, `:256` 사용법 7단계, `:293`~`:294` 전송 후 표시·반영 확인 설명, `:313` 수동 확인 체크리스트 1건 |

- 범위 준수: 서버·`packages/shared`·MCP 계약·`packages/extension/manifest.json` 변경 0건(spec §2 Out-of-scope 5건 준수).

## 검증 결과
| 항목 | 결과 | 증거(출처) |
| :--- | :--- | :--- |
| 설계 (`code-planner`) | 완료 | [plan.md](plan.md) §1 Tier 2 산정(단일 패키지·계약 변경 0·브레이킹 없음, F-E 실측 필요로 Tier 1 초과) |
| 정적 분석·린트 | Pass | `code-tester` 원시 출력 — `pnpm typecheck` Exit 0, `pnpm lint` Exit 0 |
| 단위·통합 테스트 | Pass | `code-tester` 원시 출력 — `pnpm test` Exit 0, **29 files / 344 tests**(신규 18건 포함) |
| 빌드 | Pass | `code-tester` 원시 출력 — `pnpm build` Exit 0, 번들 순환 경고 0건 |
| 브라우저 검증(ego→Aside→Playwright) | 미수행(사유: AC-7 재현 불가) | `manifest.json`에 `content_scripts` 없이 `chrome.action.onClicked`+`scripting.executeScript`로만 주입되어 ego-browser·Aside MCP로 확장 로드·아이콘 클릭 재현 불가, 저장소 내 Playwright E2E 0건. 수동 절차는 `README.md:313` |
| 전역 배포(sync/Status)·인코딩 | 미수행(사유: 애플리케이션 저장소로 배포 자산 경로·`sync` 대상 아님) | 해당 없음 |
| 정합성 게이트 | `조건부-실행` / 근거: §A 4호 — 1~3호 미해당(Tier 2, 배포·계약 자산 경로 변경 0, 브레이킹 체인지·보안 신호 없음)이며 저위험 3조건 중 ①(변경 9파일>3)·③(FR 7건+AC 8건>3) 미충족 / 방식: 1-pass / 미검증: 해당 없음 | 오케스트레이터 §A 판정 기록 |
| conformance-reviewer | PASS_WITH_NOTES | 판정 리포트 — 차단 NOTE 0건, 비차단 NOTE 3건(아래) |

### 비차단 NOTE (conformance-reviewer, 3건)
1. 2요소 합산 규칙은 `aggregateStatus` 단위 테스트로 검증했고, `verifySent` 호출처도 동일 함수를 거치므로 경로 차이는 없음(간접 검증).
2. `edit-tracker.test.ts` T-1의 `sentCount` 불변 단언이 원래 0에서 0으로 유지되는 형태라 단언 강도가 다소 약함(회귀 검출력 한계).
3. `releaseSent`가 `measureReleased` 예외를 잡지 않음 — spec에 규정이 없는 잔여 리스크(측정 중 예외 시 전송 기록 정리 보장 없음).

## 잔여 리스크 및 후속
- AC-7 브라우저 실측 미검증: 실제 Chrome에서 주입·`반영 확인` 클릭 시 transition 억제·불일치/일치 표시를 체감 확인하지 못했다(수동 절차 `README.md:313`).
- 후속 intent 후보: CSS 애니메이션·페이지 `!important`·사용자 인라인이 섞인 경우의 `unverifiable` 확장(spec §9 R-1)
- 알려진 제약: 전송 기록은 content script 메모리에만 두고 확인 후 비운다(1회성, D-S5). / 롤백: `git checkout -- packages/extension README.md` 후 신규 `verify.ts`·`verify.test.ts` 삭제, 또는 구현 커밋 revert(미커밋 상태).

## 참조
- 요구: [intent.md](intent.md) · 명세: [spec.md](spec.md) · 계획: [plan.md](plan.md)
- 워크로그: 미기록(저장소에 `docs/works/` 없음) · 커밋/PR: `- (미확정 — 작업 트리 미커밋)`
