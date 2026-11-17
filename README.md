# DOMirror

DOMirror는 브라우저에서 고친 CSS를 소스 코드로 되돌려 보내는 로컬 개발 도구입니다. 빌드할 때 React·Vue 요소마다 소스 위치(`파일:라인:컬럼`)를 심어 두고, 크롬 익스텐션에서 요소를 클릭해 CSS를 바꾸면 그 변경 내역(위치·속성·이전값·새값)을 로컬 MCP 서버로 보냅니다. Claude Code 같은 MCP 지원 에이전트가 서버에서 내역을 읽어 실제 소스를 고칩니다. 반영 방법(Tailwind·CSS Modules·CSS-in-JS 등)은 에이전트가 판단하며 DOMirror는 위치와 변경값만 전달합니다.

## 구성

| 구성 요소 | 위치 | 역할 |
| :--- | :--- | :--- |
| 빌드 플러그인 | `packages/plugin` (`@domirror/plugin/vite`) | 켠 빌드에서만 요소에 `data-domirror="<경로>:<라인>:<컬럼>"` 속성을 주입 |
| 크롬 익스텐션 | `packages/extension` | 요소 선택, 소스 위치 표시, CSS 편집·되돌리기, 간격 보기, 서버로 전송 |
| 로컬 MCP 서버 | `packages/server` (`domirror-server`) | `POST /changes`로 내역을 받아 메모리에 보관, `/mcp`로 에이전트에 도구 제공 |

데이터 흐름:

```text
소스(.tsx/.vue) --[플러그인: data-domirror 주입]--> 브라우저 화면
  --[익스텐션: 요소 선택·CSS 편집·"에이전트에 보내기"]--> POST http://127.0.0.1:47321/changes
  --[서버 메모리 보관]--> MCP 도구(list_pending_changes) --> 에이전트가 소스 수정
  --> mark_changes_applied로 반영 완료 표시
```

`packages/shared`는 세 패키지가 함께 쓰는 상수·타입입니다. 익스텐션과 서버는 플러그인을 의존하지 않습니다.

## 요구 환경

- Node.js 22.12 이상, pnpm 10 (`package.json`의 `packageManager`: `pnpm@10.26.1`)
- Chrome(압축 해제 익스텐션 로드 가능)
- 대상 앱: Vite 8 + React(JSX) 또는 Vue 3(SFC)

## 설치와 빌드

저장소 루트에서:

```sh
pnpm install
pnpm build
```

`pnpm build`는 모든 패키지와 예제를 빌드합니다. 산출물:

- `packages/plugin/dist`, `packages/server/dist`, `packages/shared/dist`
- `packages/extension/dist` (`manifest.json`, `content.js`, `service-worker.js`)

## 1. 대상 앱에 플러그인 등록

`vite.config.ts`에서 프레임워크 플러그인 **앞에** 등록합니다(플러그인은 `enforce: 'pre'`로 JSX·SFC 컴파일 전 원본을 변환합니다).

React:

```ts
import domirror from '@domirror/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [domirror({ enabled: process.env.DOMIRROR === '1' }), react()],
});
```

Vue:

```ts
import domirror from '@domirror/plugin/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [domirror({ enabled: process.env.DOMIRROR === '1' }), vue()],
});
```

옵션:

| 옵션 | 기본값 | 설명 |
| :--- | :--- | :--- |
| `enabled` | `false` | `true`일 때만 주입합니다. 끄면 산출물에 `data-domirror`가 0건입니다. |
| `injectors` | `[]` | 기본 주입기(React·Vue) 뒤에 추가할 주입기(`Injector` 인터페이스, `@domirror/plugin`에서 타입 제공). |

주입 대상은 Vite 루트 안의 파일뿐입니다. `node_modules`, 루트 밖 파일, 쿼리가 붙은 모듈 id는 건너뜁니다.

`@domirror/plugin`은 npm에 배포되지 않은 워크스페이스 패키지입니다. 이 저장소의 예제(`examples/react-vite`, `examples/vue-vite`)는 `workspace:*`로 연결되어 있습니다.

### 예제 실행

| 예제 | 개발 서버 | 켠 프로덕션 빌드 | 끈 빌드 | 미리보기 |
| :--- | :--- | :--- | :--- | :--- |
| React | `pnpm --filter example-react-vite dev` (5173) | `pnpm --filter example-react-vite build:domirror` | `pnpm --filter example-react-vite build` | `pnpm --filter example-react-vite preview` (4173) |
| Vue | `pnpm --filter example-vue-vite dev` (5174) | `pnpm --filter example-vue-vite build:domirror` | `pnpm --filter example-vue-vite build` | `pnpm --filter example-vue-vite preview` (4174) |

예제의 `dev`와 `build:domirror`는 `DOMIRROR=1`을 설정해 주입을 켭니다(POSIX 셸 문법).

## 2. 로컬 MCP 서버 실행

```sh
node packages/server/dist/cli.js
# 또는
pnpm --filter @domirror/server start
```

출력 예:

```text
[domirror] listening on http://127.0.0.1:47321 (MCP: http://127.0.0.1:47321/mcp)
```

| 옵션 | 기본값 | 설명 |
| :--- | :--- | :--- |
| `--port <번호>` | `47321` | 리슨 포트. 환경 변수 `DOMIRROR_PORT`로도 지정할 수 있으며 `--port`가 우선합니다. |
| `--extension-id <id>` | 없음 | 지정하면 그 id의 `chrome-extension://` 출처만 허용합니다. |

- `pnpm ... start`에 옵션을 넘길 때는 `--` 없이 바로 붙입니다: `pnpm --filter @domirror/server start --port 47400`. `--`를 넣으면 `Unexpected argument` 오류로 종료합니다.
- 패키지의 실행 파일 이름은 `domirror-server`지만, 저장소 안에서는 PATH에 연결되지 않으므로 위의 `node` 명령을 쓰세요.
- 포트가 사용 중이면 `[domirror] 포트 <n> 사용 중...`을 출력하고 종료 코드 1로 끝납니다.
- 상태 확인: `curl http://127.0.0.1:47321/health` → `{"name":"domirror","version":"0.1.0","pending":0}`
- 종료: `Ctrl+C`(SIGINT) 또는 SIGTERM.

## 3. 크롬에 익스텐션 로드

1. `pnpm build`(또는 `pnpm --filter @domirror/extension build`)로 `packages/extension/dist`를 만듭니다.
2. Chrome에서 `chrome://extensions`를 열고 **개발자 모드**를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다**를 눌러 `packages/extension/dist` 폴더를 선택합니다.
4. 표시된 확장 프로그램 ID를 서버 `--extension-id`에 넘기면 다른 익스텐션의 접근을 막을 수 있습니다(권장).

권한은 `activeTab`, `scripting`, `storage`와 호스트 권한 `http://127.0.0.1/*`뿐입니다. 아이콘을 누른 탭에만 스크립트가 주입됩니다.

## 4. Claude Code에 서버 등록

서버를 띄운 상태에서:

```sh
claude mcp add --transport http domirror http://127.0.0.1:47321/mcp
```

포트를 바꿨다면 URL의 포트도 맞춥니다. 프로젝트 공유용으로 `.mcp.json`에 두려면 `--scope project`를 붙입니다.

MCP 도구:

| 도구 | 입력 | 출력 |
| :--- | :--- | :--- |
| `list_pending_changes` | 없음 | `{ changes: StyleChange[] }` — 아직 반영되지 않은 변경 |
| `mark_changes_applied` | `{ ids: string[] }` (1개 이상) | `{ applied: string[], notFound: string[] }` |

`StyleChange` 주요 필드: `source`(`file`·`line`·`column`·`inherited`), `selectorHint`, `property`, `before`(`authored`: 작성 원문 또는 `null`, `computed`: 계산값), `after`, `pageUrl`.

에이전트에게 줄 프롬프트 예:

```text
domirror MCP의 list_pending_changes로 대기 중인 CSS 변경을 가져와 소스에 반영해 줘.
각 항목의 source(file:line:column) 위치 요소에 property를 after 값으로 바꾸되,
그 줄이 selectorHint·before.authored와 맞는지 먼저 확인하고 다르면 반영하지 말고 알려줘.
프로젝트의 스타일 방식(CSS 파일·Tailwind 등)을 따르고, 반영한 id들은 mark_changes_applied로 표시해 줘.
```

## 사용법

1. 대상 앱을 주입을 켠 상태로 띄웁니다(예: `pnpm --filter example-react-vite dev`).
2. 서버를 실행하고 Claude Code에 등록합니다.
3. 앱 탭에서 DOMirror 툴바 아이콘을 누르면 패널이 열리고 선택 모드가 됩니다(다시 누르면 꺼지고 페이지에 적용한 편집은 원복됩니다. 변경 내역은 익스텐션 저장소에 남아 다시 켜면 복원됩니다).
4. 요소를 클릭하면 패널에 소스 위치가 표시됩니다. 위치가 없는 요소는 가장 가까운 조상의 위치를 쓰고 "조상 위치"로 표시합니다.
5. 패널에서 색·간격·크기·글꼴 속성을 편집합니다. 변경은 즉시 화면에 적용되고 "변경 내역"에 쌓입니다(개별·전체 되돌리기 가능).
6. 포트를 확인하고 **에이전트에 보내기**를 누릅니다. 응답이 올 때까지 편집·되돌리기가 잠깁니다. 성공하면 보낸 항목이 변경 내역에서 빠지고, 실패하면 내역이 유지되고 패널에 사유와 포트가 표시됩니다.
7. 에이전트에게 반영을 지시합니다(위 프롬프트 예). 에이전트는 반영 후 `mark_changes_applied`를 호출합니다.
8. 페이지를 새로고침해 소스 반영 결과를 확인합니다.

간격 보기: 패널의 **간격 보기**를 켜면 마우스를 올린 요소의 크기·padding 영역·gap이 표시됩니다. **Alt(macOS는 Option)+클릭**으로 기준 요소를 고정/해제하면, 이후 마우스를 올린 요소까지의 수평·수직 거리가 표시됩니다.

## 보안·운영 주의

- **로컬 전용**: 서버는 `127.0.0.1`에만 바인딩하며 옵션으로 바꿀 수 없습니다.
- **Host 검증**: localhost 계열이 아닌 `Host` 헤더는 403으로 거부합니다(DNS rebinding 차단).
- **Origin 검증**: `Origin` 헤더가 없으면 허용(비브라우저 MCP 클라이언트용), `chrome-extension://<id>`는 허용, 그 외(`http://localhost:5173` 같은 웹 페이지 포함)는 403입니다. CORS 헤더는 보내지 않습니다.
  - 따라서 **같은 컴퓨터에서 Origin 헤더 없이 요청하는 로컬 프로세스는 접근할 수 있습니다.** 신뢰할 수 없는 프로세스가 도는 환경에서는 쓰지 마세요.
  - `--extension-id`로 허용 익스텐션을 좁히는 것을 권장합니다.
- **프로덕션 빌드 경고**: 주입을 켠 채 프로덕션 모드로 빌드하면 다음 경고가 1줄 출력됩니다.
  `[domirror] 프로덕션 모드 빌드에 소스 위치를 주입합니다. 운영 배포물에 사용하지 마세요.`
  켠 프로덕션 빌드는 스테이징·로컬 preview 확인용입니다. **운영 배포물에는 사용하지 마세요**(주입 기본값은 꺼짐).
- **경로 노출**: 위치 값은 Vite 루트 기준 상대 경로(`src/App.tsx:12:5`)이며 절대 경로·홈 경로는 들어가지 않습니다.
- **보관**: 변경 내역은 서버 메모리에만 있습니다. 서버를 재시작하면 대기 중인 내역은 사라집니다.

## 알려진 한계

- **지원 범위**: Vite만 지원합니다(webpack·Next.js/Turbopack은 후속). React는 호스트 요소(`<div>` 등 소문자 태그), Vue 3는 SFC 템플릿의 네이티브 요소만 1차 지원합니다. 컴포넌트 태그·Fragment·`<template>`·`<slot>`에는 위치를 넣지 않습니다.
- **경고 조건**: 경고는 Vite가 프로덕션 모드로 판단할 때만 출력됩니다. `NODE_ENV=development vite build`처럼 빌드하면 경고가 나오지 않습니다.
- **iframe**: 익스텐션은 최상위 문서에만 동작합니다. iframe 내부 요소는 선택할 수 없고, iframe 안 앱의 클릭 등 동작은 막지 못합니다. 익스텐션을 켜기 전에 iframe에 포커스가 있었다면 첫 클릭 안내가 표시되지 않습니다.
- **Shadow DOM**: Shadow DOM 내부 요소는 선택할 수 없습니다. open Shadow DOM은 안내를 표시하지만, closed Shadow DOM은 감지하지 못해 호스트 요소가 선택됩니다.
- **키보드**: 선택 모드에서 Enter 키는 가로채지 않습니다(포커스된 버튼·링크가 그대로 동작).
- **이전값(`before.authored`)은 근사치**: `!important` → 인라인 → 명시도 → 문서 순서만 비교하며 `@layer` 순서·중첩 규칙·Shadow DOM 스타일시트는 반영하지 않습니다. `:hover` 등 상태 선택자의 영향을 받을 수 있습니다.
- **적용 방식**: 편집값은 요소의 인라인 `!important`로 적용됩니다.
- **전송 중 잠금과 전송 후 편집**: **에이전트에 보내기**를 누르면 응답이 올 때까지(서버가 응답하지 않으면 최대 약 10초) 편집 필드와 개별·전체 되돌리기 버튼이 잠기고 상태에 "전송 중…"이 표시됩니다. 요소 선택과 간격 보기는 그대로 쓸 수 있습니다. 전송이 성공하면 보낸 항목은 변경 내역에서 빠지고 페이지에는 보낸 값이 그대로 보입니다. 실패(서버 꺼짐·포트 불일치·시간 초과)하면 잠금만 풀리고 내역은 그대로 남습니다. 보낸 뒤 같은 요소·속성을 다시 편집하면 `before.authored`는 직전에 보낸 값이 되고, 그 항목을 되돌리면 페이지도 보낸 값으로 돌아갑니다. 보낸 값을 취소하려면 원래 값으로 다시 편집해 생긴 "보낸 값 → 원래 값" 항목을 보내세요. 단, 새로고침·재활성화로 복원되었거나 HMR로 교체되어 "페이지 표시가 사라졌을 수 있음"이 붙은 항목은 페이지가 이미 원래 값을 보이므로, 보낸 뒤에는 이 방법으로 취소 항목을 만들 수 없습니다. 보내기 전에 목록을 확인하고 필요 없는 항목은 되돌리기로 지우세요. 응답을 기다리는 중에 익스텐션을 끄면 페이지 표시는 원복되고 보낸 항목은 저장소에 남아 다시 켤 때 복원됩니다. 다시 보내면 서버의 같은 항목이 새로 대기 상태가 될 뿐 중복되지 않습니다.
- **같은 소스의 여러 요소**: 변경 내역은 요소 자신의 소스 위치(`파일:라인:컬럼`)와 속성 기준 1건입니다. 반복 렌더링된 여러 요소나 class가 바뀐 같은 요소(예: `li.item` → `li.item.active`)를 편집해도 1건으로 합쳐지며 이전값은 최초 값, 새 값은 마지막 값입니다. 페이지에는 요소마다 편집한 값이 그대로 보이고, 1건을 되돌리면 그 소스의 편집한 요소가 모두 원복됩니다(패널에 "같은 소스에서 나온 요소 N개" 표시). 조상 위치를 물려받은 요소·위치 없는 요소는 선택자 요약(`selectorHint`)까지 같아야 합쳐집니다. 요소마다 원래 값이 다르면(예: `.active` 규칙으로 16px, 나머지 8px) 각 요소는 자기 원래 값과 비교됩니다. 편집한 값이 그 요소의 원래 값과 같으면 그 요소만 원복되고, 항목은 편집한 모든 요소가 각자 원래 값으로 돌아왔을 때만 사라집니다. 이때 이전값(처음 편집한 요소의 원래 값)과 새 값이 같게 표시될 수 있으며, 패널에 안내가 붙고 그대로 전송됩니다.
- **새로고침·HMR**: 패널을 켠 채 편집한 요소가 HMR·새로고침 등으로 교체되면 해당 항목에 "페이지 표시가 사라졌을 수 있음"이 표시되고 변경 내역은 유지됩니다. 교체된 새 요소에는 편집값이 다시 적용되지 않으므로, 필요하면 요소를 다시 선택해 편집하세요. 그 항목을 되돌리면 교체된 요소는 원복되지 않고(아직 페이지에 남은 같은 소스 요소만 원복) 내역이 지워집니다.
- **여러 탭**: 같은 origin의 여러 탭은 변경 내역 저장소를 함께 씁니다. 각 탭은 저장 직전에 저장소를 다시 읽어 자기가 만들거나 지운 항목만 반영하므로 다른 탭의 미전송 내역을 덮어쓰지 않습니다. 다른 탭의 내역은 다시 켤(또는 새로고침할) 때 목록에 나타납니다. 다만 다른 탭이 이미 보낸 항목은 원래 탭의 목록에 그대로 남습니다. 원래 탭에서 그 항목을 다시 편집하면 같은 id로 저장소에 다시 저장되고, 보내면 서버의 그 항목이 새 값과 반영 전 이전값으로 대기 상태로 돌아갑니다. 원래 탭에서 되돌리면 페이지는 원래 값이지만 서버에는 보낸 값이 대기 중으로 남습니다. 다른 탭에서 보낸 뒤에는 원래 탭을 다시 켜거나 새로고침한 뒤 편집하세요. 또한 두 탭에서 같은 소스·속성을 각각 편집하면 다시 켤(또는 새로고침할) 때 같은 소스·속성 항목이 2건 복원되고, 그대로 보내면 두 값이 모두 에이전트에 전달되어 서로 상충하는 지시가 됩니다. 같은 소스·속성은 한 탭에서만 편집하거나, 다시 켠 뒤 목록에서 같은 `파일:라인:컬럼`·속성 항목이 여러 건이면 남길 항목만 두고 나머지를 되돌리기로 지운 다음 보내세요.
- **위치 검증 없음**: 서버는 소스 라인이 바뀌었는지 검증하지 않습니다. 편집 후 소스가 바뀌어 라인이 어긋날 수 있으므로 **에이전트가 `selectorHint`와 `before`로 대조할 책임**이 있습니다. 반영 품질은 에이전트에 달려 있습니다.
- **SDK 업그레이드**: 서버의 MCP SDK(`@modelcontextprotocol/server`·`@modelcontextprotocol/node`)를 올리면 응답에 CORS 헤더가 생기지 않는지 다시 확인하세요.

## 수동 확인 체크리스트

자동화 도구로 확인하지 못한 항목입니다. 처음 설치할 때 한 번 확인하세요.

- [ ] 실제 Chrome 툴바의 DOMirror 아이콘 클릭으로 패널이 켜지고 꺼진다.
- [ ] `http://localhost:<포트>` 주소의 앱 탭에서 아이콘 클릭 시 `activeTab`으로 스크립트가 주입된다.
- [ ] 정식 Chrome에서 `127.0.0.1` 서버로 전송할 때 로컬 네트워크 접근 권한 프롬프트가 뜨는지(뜨면 허용 후 전송 성공 여부).
- [ ] macOS 실제 Option 키 + 클릭으로 간격 보기 기준 요소가 고정/해제된다.
- [ ] 종단(AC-8): Claude Code에 서버 등록 → React·Vue 예제 각각에서 편집·전송 → 에이전트가 소스 수정 → 새로고침 후 같은 변경이 보인다.

## 개발

```sh
pnpm typecheck
pnpm lint
pnpm test
```
