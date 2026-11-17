# Result: CSS 편집 패널 확장 — 컬러 피커와 flex/grid 레이아웃 속성 편집
- Intent: [INT-009](intent.md) | 완료일: 2026-11-18 | Tier: 2 (자동 판정) | Spec/Plan: [spec.md](spec.md) · [plan.md](plan.md)

## 결과 요약
- 색상 속성 필드에 네이티브 `input type=color` 피커를 텍스트 입력과 병행해 붙였고, 피커 `change` 시 1회 `onEdit`으로 기존 `StyleChange` 내역에 기록한다(spec Q-1 (a)). 알파·rgba·CSS 변수는 텍스트로 입력한다.
- 계산된 display가 flex·inline-flex·grid·inline-grid일 때만 레이아웃 컨테이너 속성 그룹을 표시하고(키워드 속성은 select), display 필드는 항상 표시한다. display를 편집하면 편집기를 즉시 재구성한다(`content.ts` `#edit` 성공 시 `#renderEditor()`).
- 레이아웃 변경은 기존 `property`/`before`/`after` 형식 그대로 MCP 전송·프롬프트 복사에 실린다. 공개 계약·의존성 변경은 0이다(AC-4 0줄).

## 변경 산출물
| 경로 | 변경 | 핵심 내용 1줄 |
| :--- | :--- | :--- |
| `packages/extension/src/color.ts` | 신규(+51) | 피커용 색 변환 `parsePickerColor`(T-01) |
| `packages/extension/test/color.test.ts` | 신규(+24) | 색 변환 단위 테스트(AC-1) |
| `packages/extension/src/properties.ts` | 수정(+57) | `layout` 그룹·`LayoutContainer`·`options`/`containers`·`containerOf()`·레이아웃 속성 10개(T-02) |
| `packages/extension/test/properties.test.ts` | 신규(+63) | 레이아웃 속성 정의 단위 테스트(AC-2·AC-3 정적 부분) |
| `packages/extension/src/panel.ts` | 수정(+54/−6) | 컬러 피커 병행·select·flex/grid 조건부 표시·`disabled`/`dataset.property` 적용(T-03) |
| `packages/extension/src/content.ts` | 수정(+2) | `#edit` 성공 시 display 속성이면 `#renderEditor()` 호출(AC-7 ④ 1차 FAIL 수정) |
| `git diff --stat a551861..7a833af -- packages` | — | **6 files changed, 245 insertions(+), 6 deletions(-)** |

- spec.md·plan.md는 `7a833af`로 교정했다: FR-1 함수명 `parsePickerColor`, FR-6 `values` null이면 편집기 비움, FR-8·D-S2 `content.ts` 1줄 반영. `Intent updated_at`은 변경하지 않았다.
- 계약 경로(`packages/shared`·`packages/server`·`manifest.json`·`prompt.ts`·`package.json`·`pnpm-lock.yaml`) diff 0(AC-4).

## 검증 결과
| 항목 | 결과 | 증거(출처) |
| :--- | :--- | :--- |
| 설계 (`code-planner`) | 완료 | [plan.md](plan.md) §1 Tier 2 산정·§2 실행 순서 |
| 정적 분석·린트 | Pass | `pnpm lint` Exit 0 · `pnpm typecheck` Exit 0 (`code-tester`) |
| 단위·통합 테스트 | Pass | `pnpm test` Exit 0 — **28 files / 326 tests** (`code-tester`) |
| 빌드 | Pass | `pnpm build` Exit 0 (`code-tester`) |
| 브라우저 검증(ego→Aside→Playwright) | Pass(주입 방식) | ego-browser에서 빌드된 `dist/content.js` 주입 + `chrome.*` shim(`Extensions.loadUnpacked` 불가). AC-7 ①~⑤·AC-3·AC-5 PASS, 콘솔 에러 0, R-1 피커 닫힘 없음, Tab 포커스 유지 (`code-tester`) |
| 인코딩 | Pass | 신규·수정 파일 CR 0·BOM 0 (`code-tester`) |
| 전역 배포(sync/Status)·인코딩 | 미수행(사유: 애플리케이션 저장소로 배포 자산 경로·`sync` 대상 아님) | 해당 없음 |
| 정합성 게이트 | `조건부-실행` / 근거: 저위험 ① 미충족(변경 파일 6개 > 3), ③ 미충족(FR 10·AC 7 > 3) / 방식: 1-pass / 미검증: 해당 없음 | 오케스트레이터 §A 판정 기록 |
| conformance-reviewer | PASS_WITH_NOTES (비차단 NOTE 3건) | 판정 리포트 요약(아래) |

- 수정 루프: 1회 사용(합산 상한 3회) — AC-7 ④ 1차 FAIL(display 편집 후 레이아웃 그룹 미갱신) → `1fe3f2b`로 수정 후 재검증 Pass.

### 비차단 NOTE (conformance-reviewer, 3건)
1. 범위 밖 커밋 `bbefa4c`(`docs/code-asset-index/COMPONENTS.md`, 다른 세션)가 브랜치에 섞였다. 문서 전용이며 INT-009 변경과 겹치는 부분은 0이다.
2. 되돌리기 후 상태 문구가 "display: grid 적용"으로 남는다. 기존 `#revert` 동작이며 범위 밖이다.
3. spec §3·plan §5의 라인 인용은 변경 전 기준선이다.

## 잔여 리스크 및 후속
- 미실측(비차단) — 수동 확인 체크리스트:
  - [ ] 실제 익스텐션 로드 상태에서 서비스워커 relay를 거쳐 MCP `list_pending_changes`가 색상·레이아웃 변경을 수신하는지
  - [ ] 네이티브 컬러 다이얼로그를 실제로 조작해 값을 확정했을 때 1회 기록·미리보기가 되는지
- 후속 intent 후보: 기존 `gap`과 `row-gap`/`column-gap` 중복 정리(spec R-2), 되돌리기 후 상태 문구 갱신, `COMPONENTS.md`에 `color.ts` 반영.
- 알려진 제약: 네이티브 피커는 hex만 지원하며 알파·CSS 변수는 텍스트 입력으로 다룬다. / 롤백: `git revert 1fe3f2b 3c56c96 7b0c107 735a04c`(INT-009 커밋만, `bbefa4c` 제외).

## 참조
- 요구: [intent.md](intent.md) · 명세: [spec.md](spec.md) · 계획: [plan.md](plan.md)
- 워크로그: 미기록(저장소에 `docs/works/` 없음) · 브랜치: `kjuhee-dev-20261118-0028/0028-color-picker-layout-props`
- 커밋: `735a04c`(T-01) · `7b0c107`(T-02) · `3c56c96`(T-03) · `1fe3f2b`(fix, AC-7 ④) · `7a833af`(spec·plan 교정) — `bbefa4c`는 INT-009 범위 밖
