# Changelog

이 파일은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) 형식을 따르며, `z_skill_git_commit`이 `main`/`master` 커밋 시 버전과 함께 자동 갱신합니다.

## [0.1.36] - 2026-11-17

### Added

- MCP 도구 `list_comments`(open만, readOnlyHint)와 `mark_comments_resolved`(멱등) 추가, `createMcpFactory`에 코멘트 저장소 주입
- 코멘트 전송 후 MCP 조회·resolved 제외·빈 ids 거부·notFound 통합 테스트

## [0.1.35] - 2026-11-17

### Added

- 서버 `POST /comments` 라우트와 `ScreenComment` zod 스키마(본문 2,000자·문자열 2,048자 상한), `createHttpServer` 코멘트 저장소 주입
- `/comments` 403·400·413·415 처리와 기존 `/health` pending 불변 통합 테스트

### Changed

- HTTP 요청 본문 읽기·오류 응답 헬퍼를 공통화(기존 `/changes` 문구·처리 순서 유지)

## [0.1.34] - 2026-11-17

### Added

- 서버에 코멘트 메모리 저장소 `CommentStore` 추가(멱등 upsert·open 목록·resolved 전이·500건 상한)와 단위 테스트

## [0.1.33] - 2026-11-17

### Added

- shared에 `ScreenComment`·`ScreenCommentInput`·`PostCommentsRequest`·`PostCommentsResponse`·`ContentToWorkerCommentsMessage` 타입과 `COMMENTS_PATH` 상수 추가

## [0.1.32] - 2026-11-17

### Changed

- INT-005를 planned에서 active로 전이하고 태스크 T-01~T-06으로 분해, spec·plan `Intent updated_at` 동기화

## [0.1.31] - 2026-11-17

### Changed

- INT-004를 done으로 전이하고 `result.md`(결과·변경 산출물·검증·게이트 2-pass·잔여 리스크)를 작성, INDEX를 done 3건으로 갱신

## [0.1.30] - 2026-11-17

### Changed

- INT-004 태스크 T-01~T-08을 완료 처리하고 INDEX 진행률을 8/8로 갱신

## [0.1.29] - 2026-11-17

### Added

- README 옵션 표에 `designSystem`, 주입 대상에 `data-domirror-component`·`data-domirror-ds`와 사용처 측 조건 추가
- 알려진 한계에 컴포넌트 정보 휴리스틱·패키지형 DS·전역 등록·alias·런타임 요소 한계, 체크리스트에 호버 라벨·패널 확인 항목 추가

## [0.1.28] - 2026-11-17

### Added

- React·Vue 예제에 디자인 시스템 컴포넌트(`src/ds/Button`)와 사용처를 추가하고 `designSystem: ['src/ds/**']` 옵션 설정

## [0.1.27] - 2026-11-17

### Added

- 익스텐션에 `locateComponent`를 추가해 선택·호버 요소의 컴포넌트 이름·정의 파일·DS 여부를 해석
- 호버 라벨(DS `이름 · DS`/일반 `이름`)과 선택 패널의 `컴포넌트:`·`정의:` 줄·DS 배지 표시

### Changed

- 컴포넌트 정보가 없으면 라벨을 숨기고 패널에 "컴포넌트 정보 없음"을 흐리게 표시

## [0.1.26] - 2026-11-17

### Added

- 플러그인 통합 테스트에 `enabled:false` 컴포넌트 속성 0건, 빌드 산출물 절대 경로 0건(React·Vue), `designSystem` 사용처 배선 케이스 추가

## [0.1.25] - 2026-11-17

### Added

- Vue 주입기가 네이티브 요소에 파일 basename 기준 `data-domirror-component`·`data-domirror-ds`를 주입
- SFC script·scriptSetup 정적 import를 파싱해 DS 패턴 컴포넌트 태그에 사용처 측 속성 주입(파싱 실패 시 정의 측만 유지)

## [0.1.24] - 2026-11-17

### Added

- React 주입기가 호스트 요소에 `data-domirror-component`(이름|정의 파일)와 DS 여부 `data-domirror-ds`를 주입
- DS 패턴과 일치하는 정적 import를 쓰는 컴포넌트 태그에 사용처 측 속성 주입

### Changed

- 속성 이스케이프·컴포넌트 속성 문자열 유틸과 정적 import 매퍼를 공용 모듈로 분리

## [0.1.23] - 2026-11-17

### Added

- 플러그인 `designSystem` 옵션과 glob(`*`·`**`)·import specifier 판정 매처(`createDesignSystemMatcher`) 추가
- 주입기 컨텍스트로 DS 판정 함수 `isDesignSystem` 전달

### Changed

- 프로덕션 모드 경고 문구에 "컴포넌트 정보 주입" 안내 추가

## [0.1.22] - 2026-11-17

### Added

- shared에 `data-domirror-component`·`data-domirror-ds` 상수와 `formatComponentInfo`·`parseComponentInfo` 추가

### Changed

- `Injector.transform` 컨텍스트를 `InjectorContext`로 분리하고 선택 필드 `isDesignSystem` 추가(기존 커스텀 주입기 호환)

## [0.1.21] - 2026-11-17

### Changed

- INT-004 spec §3·§4·§8을 oxc-parser `module.staticImports`·Vue `tagType` 실측 결과에 맞게 보강하고 AC-5·AC-8 단언 방식을 구체화

## [0.1.20] - 2026-11-17

### Added

- INT-003·INT-005~INT-008 요구사항 문서를 planned로 등록하고 INBOX 아이디어를 DONE으로 승격 기록
- 공통 자산 카탈로그 docs/code-asset-index/COMPONENTS.md 추가

### Changed

- INT-004를 planned에서 active로 전이하고 태스크 T-01~T-08로 분해, spec·plan `Intent updated_at` 동기화

## [0.1.19] - 2026-11-17

### Fixed

- CHANGELOG 0.1.16~0.1.18 누락 항목 보충(버전 갱신 스크립트 인코딩 오판으로 누락)

## [0.1.18] - 2026-11-17

### Changed

- INT-002 완료 전이(done)와 result.md 작성

## [0.1.17] - 2026-11-17

### Changed

- INT-002 T-05 완료 기록(정합성 재판정 PASS_WITH_NOTES)

## [0.1.16] - 2026-11-17

### Changed

- INT-002 spec FR-4·FR-5·E-3을 요소별 기대값 비교 동작에 맞게 동기화

## [0.1.15] - 2026-11-17

### Changed

- INT-002 작업을 T-01~T-05로 분해하고 진행(4/5) 기록

## [0.1.14] - 2026-11-17

### Fixed

- README 검증 스니펫 판정 표: match·mismatch 조건을 요소별 정규화 기대값 비교와 일치하도록 정정

## [0.1.13] - 2026-11-17

### Added

- README: chrome-devtools-mcp 병행 등록·검증 프롬프트 예·검증 스니펫(일치 항목만 반영 완료 표시)
- README: chrome-devtools-mcp 보안 주의 3항목, 자동 확인 수동 체크리스트 1건

### Changed

- README 사용법 8단계에 에이전트 보고로 확인하는 경로 병기

## [0.1.12] - 2026-11-17

### Added

- INT-002 intent·spec·plan 작성(chrome-devtools-mcp로 소스 반영 결과 자동 확인)
- INBOX 아이디어 IDEA-20261117-01(전송 후 인라인 !important 잔존)

## [0.1.11] - 2026-11-17

### Changed

- docs: INT-001 완료 전이(done)와 result.md 작성

## [0.1.10] - 2026-11-17

### Changed

- refactor: INT-001 전송 중 편집·되돌리기 잠금으로 전송 대기 경계 결함 구조적 제거

## [0.1.9] - 2026-11-16

### Fixed

- fix: INT-001 정합성 판정 잔여 결함 D-A 수정, D-B·D-C 문서화

## [0.1.8] - 2026-11-16

### Fixed

- fix: INT-001 정합성 재검증 잔여 결함 D-1·D-2·D-3 수정

## [0.1.7] - 2026-11-16

### Fixed

- fix: INT-001 정합성 검증 결함 R-1~R-4 수정

## [0.1.6] - 2026-11-16

### Changed

- docs: INT-001 배치 H — README 사용 문서와 예제 favicon 보정

## [0.1.5] - 2026-11-16

### Added

- feat: INT-001 배치 G — 간격 보기(크기·padding·gap, 기준 요소 간 거리)

## [0.1.4] - 2026-11-16

### Added

- feat: INT-001 배치 F — CSS 편집 패널, 변경 기록·되돌리기, 에이전트 전송

## [0.1.3] - 2026-11-16

### Added

- feat: INT-001 배치 E — 요소 클릭 선택과 소스 위치 표시

## [0.1.2] - 2026-11-16

### Added

- feat: INT-001 배치 D — 크롬 익스텐션 MV3 골격과 서버 전송 릴레이

## [0.1.1] - 2026-11-16

### Added

- feat: INT-001 배치 A~C — 소스 위치 주입 플러그인과 로컬 MCP 서버
