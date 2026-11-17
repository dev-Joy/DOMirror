# Project Code Asset Index: domirror

- 생성일시: 2026-11-17 16:22:20
- 감지된 환경: JavaScript
- 스캔 대상 디렉터리: `examples/react-vite/src/components`, `packages/shared/src`
- 총 인덱싱 자산: 14 건

> 이 카탈로그는 AI 에이전트와 개발자가 기존 공통 자산을 재사용하고 중복 구현을 방지하기 위한 인덱스입니다.
> 신규 컴포넌트/함수/훅 작성 전 반드시 아래 목록을 대조하고 적극 재사용하십시오.

---

## 1. UI Components

| 컴포넌트명 | 정의 파일 | 시그니처 / 주요 설명 |
| :--- | :--- | :--- |
| `Card` | [`examples/react-vite/src/components/Card.tsx`](../../examples/react-vite/src/components/Card.tsx) | Card({ title, children }: CardProps) - UI 컴포넌트 |

## 2. Custom Hooks

_등록된 자산이 없습니다._

## 3. Utilities & Helpers

| 함수 / 심볼 | 정의 파일 | 시그니처 / 요약 |
| :--- | :--- | :--- |
| `formatSourceLocation` | [`packages/shared/src/location.ts`](../../packages/shared/src/location.ts) | formatSourceLocation(loc: SourceLocation) - 예: `src/App.tsx:12:5` |
| `parseSourceLocation` | [`packages/shared/src/location.ts`](../../packages/shared/src/location.ts) | parseSourceLocation(value: string) - 오른쪽에서 ':' 2개를 분리한다. 라인·컬럼이 양의 정수가 아니거나 파일이 비면 `null`. |

## 4. Shared Services & Clients

_등록된 자산이 없습니다._

## 5. Types & Interfaces

| 타입 / 인터페이스 | 정의 파일 | 정의 요약 |
| :--- | :--- | :--- |
| `SourceLocation` | [`packages/shared/src/location.ts`](../../packages/shared/src/location.ts) | interface SourceLocation - line·column 모두 1부터 시작하며, 여는 태그의 '<' 위치를 가리킨다. |
| `ContentToWorkerMessage` | [`packages/shared/src/types.ts`](../../packages/shared/src/types.ts) | type ContentToWorkerMessage - 타입 별칭 정의 |
| `HealthResponse` | [`packages/shared/src/types.ts`](../../packages/shared/src/types.ts) | interface HealthResponse - 인터페이스 정의 |
| `InjectResult` | [`packages/shared/src/types.ts`](../../packages/shared/src/types.ts) | interface InjectResult - 인터페이스 정의 |
| `Injector` | [`packages/shared/src/types.ts`](../../packages/shared/src/types.ts) | interface Injector - 프레임워크별 주입기 공통 인터페이스 (FR-4). |
| `PostChangesRequest` | [`packages/shared/src/types.ts`](../../packages/shared/src/types.ts) | interface PostChangesRequest - 인터페이스 정의 |
| `PostChangesResponse` | [`packages/shared/src/types.ts`](../../packages/shared/src/types.ts) | interface PostChangesResponse - 인터페이스 정의 |
| `SendResult` | [`packages/shared/src/types.ts`](../../packages/shared/src/types.ts) | type SendResult - 타입 별칭 정의 |
| `StyleChange` | [`packages/shared/src/types.ts`](../../packages/shared/src/types.ts) | interface StyleChange - 인터페이스 정의 |
| `StyleChangeInput` | [`packages/shared/src/types.ts`](../../packages/shared/src/types.ts) | type StyleChangeInput - 타입 별칭 정의 |
| `WorkerToContentMessage` | [`packages/shared/src/types.ts`](../../packages/shared/src/types.ts) | type WorkerToContentMessage - 타입 별칭 정의 |

