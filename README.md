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
| `designSystem` | `[]` | 디자인 시스템 컴포넌트 판별 패턴 목록. 정의 파일 경로 glob(`src/ds/**`) 또는 import specifier(`@acme/ui`)와 일치하면 `data-domirror-ds`를 넣습니다. |
| `protected` | `designSystem` 값 | 보호 영역 판정 패턴 목록. `designSystem`과 같은 glob·specifier 규칙을 쓰되 **파일 경로 판정에만** 사용합니다. 정의 파일이 일치하면 그 요소에 `data-domirror-protected`를 넣습니다(사용처 측 컴포넌트 태그에는 넣지 않으며, 사용자가 직접 쓴 속성은 중복 주입하지 않습니다). 미설정 시 `designSystem`을 그대로 쓰고, `[]`면 패턴 보호가 없습니다. |

`enabled`가 켜져 있으면 `data-domirror`(소스 위치)와 함께 `data-domirror-component="<이름>|<정의 파일>"`·`data-domirror-ds`(디자인 시스템 여부)가 들어갑니다. `designSystem` 패턴과 일치하는 import를 쓰는 컴포넌트 태그에도 `data-domirror-component`가 붙지만, 그 컴포넌트가 props/attrs를 루트 요소로 전달할 때만 DOM에 남습니다.

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
| `list_pending_changes` | 없음 | `{ changes: PendingChange[] }` — 아직 반영되지 않은 변경. 보호 영역에서 온 항목에는 `warning`이 함께 오며, 경고만 하고 차단하지 않습니다. |
| `mark_changes_applied` | `{ ids: string[] }` (1개 이상) | `{ applied: string[], notFound: string[] }` |
| `list_comments` | 없음 | `{ comments: ScreenComment[] }` — 아직 처리하지 않은(open) 코멘트 |
| `mark_comments_resolved` | `{ ids: string[] }` (1개 이상) | `{ resolved: string[], notFound: string[] }` |

`StyleChange` 주요 필드: `source`(`file`·`line`·`column`·`inherited`·`protected`(선택)), `selectorHint`, `property`, `before`(`authored`: 작성 원문 또는 `null`, `computed`: 계산값), `after`, `pageUrl`, `warning`(선택: `code`=`protected-area`, `reason`=`pattern`·`node_modules`, `message`=고정 안내 문구).

`ScreenComment` 주요 필드: `source`(`file`·`line`·`column`·`inherited`), `selectorHint`, `pageUrl`, `body`, `createdAt`, `status`(`open`·`resolved`), `id`. 서버는 `POST /comments`로 받은 코멘트를 메모리에 보관하고, `list_comments`는 `open`만 돌려줍니다.

에이전트에게 줄 프롬프트 예:

```text
domirror MCP의 list_pending_changes로 대기 중인 CSS 변경을 가져와 소스에 반영해 줘.
각 항목의 source(file:line:column) 위치 요소에 property를 after 값으로 바꾸되,
그 줄이 selectorHint·before.authored와 맞는지 먼저 확인하고 다르면 반영하지 말고 알려줘.
프로젝트의 스타일 방식(CSS 파일·Tailwind 등)을 따르고, 반영한 id들은 mark_changes_applied로 표시해 줘.
```

### 반영 결과 자동 확인 (선택: chrome-devtools-mcp)

[chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)를 함께 등록하면, 에이전트가 소스를 고친 뒤 실제 화면의 계산값을 `after`와 비교해 **일치한 항목만** 반영 완료로 표시할 수 있습니다. 등록하지 않으면 기존처럼 새로고침으로 확인합니다.

```sh
claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest --isolated --no-usage-statistics --no-performance-crux
```

| 플래그 | 이유 |
| :--- | :--- |
| `--isolated` | 임시 프로필로 브라우저를 띄우고 종료 시 삭제합니다. 평소 쓰는 프로필(쿠키·로그인)과 DOMirror 익스텐션이 섞이지 않습니다. |
| `--no-usage-statistics` | 기본으로 켜져 있는 Google 사용 통계 전송을 끕니다. |
| `--no-performance-crux` | 성능 도구가 페이지 URL을 Google CrUX API로 보내는 동작을 끕니다. |

MCP 지원 에이전트면 동일합니다. JSON 설정을 쓰는 에이전트는 `"command": "npx"`, `"args": ["-y", "chrome-devtools-mcp@latest", "--isolated", "--no-usage-statistics", "--no-performance-crux"]`로 등록합니다.

**별도 브라우저에서 비교하는 이유**: 익스텐션으로 편집한 탭에는 보낸 값이 요소의 인라인 `!important`로 남습니다(전송 성공 후에도 **반영 확인** 전까지 유지). 그 탭에서 비교하면 소스 반영에 실패해도 일치로 보입니다. 그래서 chrome-devtools-mcp가 띄운 별도 브라우저(DOMirror 익스텐션 없음)에서 `pageUrl`을 새로 열어 비교합니다. 같은 탭에서도 패널의 **반영 확인** 버튼을 누르면 전송한 항목의 인라인 값을 해제하고 소스 반영 결과를 일치·불일치·확인 불가로 표시하므로, 익스텐션 없이 확인하려면 이 버튼을 쓰면 됩니다(에이전트가 스스로 확인·표시하는 위 워크플로는 별도 브라우저를 그대로 씁니다).

사용 도구: `new_page`(`pageUrl` 열기), `navigate_page`(`type: "reload"`로 다시 불러오기), `wait_for`(페이지 문구가 나타날 때까지 대기), `evaluate_script`(검증 스니펫 실행), `take_screenshot`(필요 시 보고용 화면).

자동 확인을 포함한 프롬프트 예:

```text
domirror MCP의 list_pending_changes로 대기 중인 CSS 변경을 가져와 소스에 반영해 줘.
각 항목의 source(file:line:column) 위치 요소에 property를 after 값으로 바꾸되,
그 줄이 selectorHint·before.authored와 맞는지 먼저 확인하고 다르면 반영하지 말고 알려줘.
프로젝트의 스타일 방식(CSS 파일·Tailwind 등)을 따라 줘.
파일을 저장한 뒤 chrome-devtools MCP로 확인해 줘.
- pageUrl을 new_page로 열고(이미 열었으면 navigate_page로 다시 불러오기) wait_for로 로딩을 기다려.
- 항목마다 DOMirror README의 검증 스니펫에 source·inherited·property·after를 넣어 evaluate_script로 실행해.
- status가 match인 id만 mark_changes_applied로 표시해.
- 불일치·검증 불가는 표시하지 않고 보고해 줘(id·expected·actual·reason 포함). 그 항목은 대기 상태로 남겨.
- mismatch면 HMR·저장 지연일 수 있으니 다시 불러온 뒤 1회만 재확인해.
```

검증 스니펫(`evaluate_script`의 `function`에 그대로 넣고, 맨 위 4개 상수만 항목 값으로 바꿉니다. `evaluate_script`의 `args`는 요소 uid만 받으므로 값은 상수로 넣습니다):

```js
() => {
  const SOURCE = 'src/App.tsx:10:7'; // StyleChange.source의 file:line:column
  const INHERITED = false; // StyleChange.source.inherited
  const PROPERTY = 'color'; // StyleChange.property
  const AFTER = '#fff'; // StyleChange.after

  const result = (status, expected, actual, reason) =>
    reason ? { status, expected, actual, count: actual.length, reason } : { status, expected, actual, count: actual.length };

  if (INHERITED) return result('unverifiable', '', [], '조상 위치(inherited) 항목이라 요소를 특정할 수 없음');

  const els = [...document.querySelectorAll(`[data-domirror="${CSS.escape(SOURCE)}"]`)];
  if (els.length === 0) return result('unverifiable', '', [], '요소 0개: 주입을 켠 dev 서버(DOMIRROR=1)와 source 확인 필요');

  // after를 같은 부모 아래 임시 요소에 적용해 브라우저 정규화 값을 구한다(#fff → rgb(255, 255, 255), 1rem → 16px).
  const normalize = (el) => {
    const tmp = document.createElement(el.tagName);
    const cls = el.getAttribute('class');
    if (cls) tmp.setAttribute('class', cls);
    tmp.style.setProperty(PROPERTY, AFTER, 'important');
    if (tmp.style.getPropertyValue(PROPERTY) === '') return null;
    (el.parentElement ?? document.body).appendChild(tmp);
    const value = getComputedStyle(tmp).getPropertyValue(PROPERTY).trim();
    tmp.remove();
    return value;
  };

  const expectedList = els.map(normalize);
  if (expectedList.some((v) => v === null)) return result('unverifiable', '', [], `after 값을 브라우저가 해석하지 못함: ${PROPERTY}: ${AFTER}`);
  const actual = els.map((el) => getComputedStyle(el).getPropertyValue(PROPERTY).trim());
  const expected = expectedList[0];
  if (expected === '' || actual.some((v) => v === '')) return result('unverifiable', expected, actual, `계산값이 빈 문자열(shorthand 등): ${PROPERTY}`);
  return actual.every((v, i) => v === expectedList[i]) ? result('match', expected, actual) : result('mismatch', expected, actual);
}
```

출력: `{ status: 'match' | 'mismatch' | 'unverifiable', expected: string, actual: string[], count: number, reason?: string }`

| status | 조건 | 처리 |
| :--- | :--- | :--- |
| `match` | 같은 소스의 모든 요소(`count`개) 계산값이 각 요소 기준 정규화 기대값과 같음(`expected`는 첫 요소 기준 값) | 그 id만 `mark_changes_applied`로 표시 |
| `mismatch` | 하나라도 다름(요소별 정규화 후 비교). 보고되는 `expected`는 첫 요소 기준 값 | 표시하지 않고 `expected`·`actual`과 함께 보고 |
| `unverifiable` | `inherited: true`, 요소 0개, `after` 해석 불가, 계산값이 빈 문자열 | 표시하지 않고 `reason`과 함께 보고 |

`:hover` 같은 상태 의존 값이나 로그인·앱 상태가 필요한 페이지는 임시 프로필에서 재현되지 않아 `mismatch`·`unverifiable`이 될 수 있습니다. 이때도 보고만 하고 표시하지 않습니다.

확인 기준: 2026-11-17, chrome-devtools-mcp 1.13.0 README·`docs/tool-reference.md`·`docs/configuration.md`. 버전에 따라 도구명·플래그가 바뀔 수 있습니다.

## 사용법

1. 대상 앱을 주입을 켠 상태로 띄웁니다(예: `pnpm --filter example-react-vite dev`).
2. 서버를 실행하고 Claude Code에 등록합니다.
3. 앱 탭에서 DOMirror 툴바 아이콘을 누르면 패널이 열리고 선택 모드가 됩니다(다시 누르면 꺼지고 페이지에 적용한 편집은 원복됩니다. 변경 내역은 익스텐션 저장소에 남아 다시 켜면 복원됩니다).
4. 요소를 클릭하면 패널에 소스 위치가 표시됩니다. 위치가 없는 요소는 가장 가까운 조상의 위치를 쓰고 "조상 위치"로 표시합니다.
5. 패널에서 색·간격·크기·글꼴 속성을 편집합니다. 변경은 즉시 화면에 적용되고 "변경 내역"에 쌓입니다(개별·전체 되돌리기 가능).
6. 포트를 확인하고 **에이전트에 보내기**를 누릅니다. 응답이 올 때까지 편집·되돌리기가 잠깁니다. 성공하면 보낸 항목이 변경 내역에서 빠지고, 실패하면 내역이 유지되고 패널에 사유와 포트가 표시됩니다.
7. 같은 탭에서 소스 반영 결과를 바로 보려면 **반영 확인**을 누릅니다. 전송한 항목의 인라인 값을 해제한 뒤 소스 값과 비교해 항목별로 일치·불일치·확인 불가를 표시합니다. 미전송 편집값은 그대로 유지되고, 처리한 전송 기록은 비워집니다(1회성).
8. 에이전트에게 반영을 지시합니다(위 프롬프트 예). 에이전트는 반영 후 `mark_changes_applied`를 호출합니다.
9. 페이지를 새로고침해 소스 반영 결과를 확인합니다. chrome-devtools-mcp를 등록했다면 에이전트 보고(일치·불일치·검증 불가)로 확인할 수 있어 새로고침을 생략해도 됩니다.

간격 보기: 패널의 **간격 보기**를 켜면 마우스를 올린 요소의 크기·padding 영역·gap이 표시됩니다. **Alt(macOS는 Option)+클릭**으로 기준 요소를 고정/해제하면, 이후 마우스를 올린 요소까지의 수평·수직 거리가 표시됩니다.

코멘트: 요소를 선택한 상태에서 패널의 코멘트 입력란에 의견을 적고 **코멘트 남기기**를 누르면 로컬 서버로 보내고, 화면의 해당 요소 옆에 번호 핀이 표시됩니다. 핀을 누르면 본문이 보이고 스크롤·레이아웃 변화를 따라갑니다. 패널 목록에서 전송 상태를 확인하고 실패한 코멘트는 재전송할 수 있으며, 패널을 다시 켜면(새로고침 후에도) `chrome.storage.local`에 보관된 코멘트가 복원됩니다. 에이전트는 MCP `list_comments`로 미처리 코멘트를 읽고 처리한 뒤 `mark_comments_resolved`로 표시합니다.

AI 프롬프트 복사: MCP를 사용하지 않는 AI 도구(웹 채팅 등)에 넘길 구현 프롬프트를 클립보드로 복사합니다. 패널의 **AI 프롬프트 복사**를 누르면 변경 내역이 있으면 내역 전체를, 없으면 선택한 요소의 위치 정보를 한국어 마크다운으로 만듭니다. 프롬프트 말미에는 `## 자가 점검`(에이전트가 스스로 확인할 체크 목록)과 `## 반영 확인`(브라우저 확인 도구가 있으면 익스텐션이 설치되지 않은 별도 브라우저에서 계산값을 비교하고, 없으면 새로고침 후 직접 확인) 섹션이 붙습니다. 복사는 읽기 전용이라 내역·저장소·전송 상태를 바꾸지 않고 **에이전트에 보내기**와 함께 쓸 수 있습니다. 프롬프트에는 페이지 URL이 그대로 포함되므로 외부 AI 도구에 붙여 넣기 전에 확인하세요.

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
- **보관**: 변경 내역은 서버 메모리에만 있습니다. 서버를 재시작하면 대기 중인 내역은 사라집니다. 화면 코멘트도 서버 메모리에만 보관되어 재시작 시 사라지며(익스텐션 저장소에 사본이 남아 재전송 가능), 외부 서비스로 전송하지 않습니다. GitHub Issues·Slack 연동과 토큰 보관은 후속 범위입니다.
- **chrome-devtools-mcp(선택)**:
  - 띄운 브라우저의 페이지 내용·쿠키·네트워크 정보가 에이전트에 노출됩니다. 민감한 계정으로 로그인한 페이지에서는 쓰지 마세요.
  - `--browser-url`·`--autoConnect`로 평소 쓰는 Chrome에 붙이지 마세요. 디버깅 포트를 열면 같은 컴퓨터의 다른 프로그램도 그 브라우저를 조작할 수 있고, 익스텐션이 남긴 인라인 값 때문에 비교 결과도 틀어집니다.
  - Google 사용 통계와 CrUX 전송은 기본으로 켜져 있습니다. `--no-usage-statistics`·`--no-performance-crux`로 끄세요.

## 알려진 한계

- **지원 범위**: Vite만 지원합니다(webpack·Next.js/Turbopack은 후속). React는 호스트 요소(`<div>` 등 소문자 태그), Vue 3는 SFC 템플릿의 네이티브 요소만 1차 지원합니다. 컴포넌트 태그·Fragment·`<template>`·`<slot>`에는 위치를 넣지 않습니다(단, `designSystem` 패턴과 일치하는 import의 컴포넌트 태그에는 컴포넌트 정보 속성을 넣습니다).
- **컴포넌트 정보 한계**: 컴포넌트 정보는 빌드 시 이름 휴리스틱으로 만듭니다. 이름은 요소를 감싼 가장 가까운 대문자 함수·클래스 이름이며, 없으면 파일 basename을 씁니다(익명 default export도 basename). 패키지형 디자인 시스템은 사용처 측 속성이 컴포넌트 루트까지 전달될 때만 판별되고, `...props`를 넘기지 않거나 Vue에서 `inheritAttrs: false`·다중 루트면 보이지 않습니다. 전역 등록·자동 import 컴포넌트는 SFC 안에 import 출처가 없어 판별하지 않습니다. `@/ds` 같은 alias는 문자열로만 비교하며 해석하지 않습니다. `createElement` 등 런타임 생성 요소에는 속성이 없어 조상 컴포넌트 정보가 보입니다.
- **경고 조건**: 경고는 Vite가 프로덕션 모드로 판단할 때만 출력됩니다. `NODE_ENV=development vite build`처럼 빌드하면 경고가 나오지 않습니다.
- **iframe**: 익스텐션은 최상위 문서에만 동작합니다. iframe 내부 요소는 선택할 수 없고, iframe 안 앱의 클릭 등 동작은 막지 못합니다. 익스텐션을 켜기 전에 iframe에 포커스가 있었다면 첫 클릭 안내가 표시되지 않습니다.
- **Shadow DOM**: Shadow DOM 내부 요소는 선택할 수 없습니다. open Shadow DOM은 안내를 표시하지만, closed Shadow DOM은 감지하지 못해 호스트 요소가 선택됩니다.
- **키보드**: 선택 모드에서 Enter 키는 가로채지 않습니다(포커스된 버튼·링크가 그대로 동작).
- **이전값(`before.authored`)은 근사치**: `!important` → 인라인 → 명시도 → 문서 순서만 비교하며 `@layer` 순서·중첩 규칙·Shadow DOM 스타일시트는 반영하지 않습니다. `:hover` 등 상태 선택자의 영향을 받을 수 있습니다.
- **적용 방식**: 편집값은 요소의 인라인 `!important`로 적용됩니다.
- **전송 중 잠금과 전송 후 편집**: **에이전트에 보내기**를 누르면 응답이 올 때까지(서버가 응답하지 않으면 최대 약 10초) 편집 필드와 개별·전체 되돌리기 버튼이 잠기고 상태에 "전송 중…"이 표시됩니다. 요소 선택과 간격 보기는 그대로 쓸 수 있습니다. 전송이 성공하면 보낸 항목은 변경 내역에서 빠지고 페이지에는 보낸 값이 **반영 확인 전까지** 그대로 보입니다. 실패(서버 꺼짐·포트 불일치·시간 초과)하면 잠금만 풀리고 내역은 그대로 남습니다. 보낸 뒤 같은 요소·속성을 다시 편집하면 `before.authored`는 직전에 보낸 값이 되고, 그 항목을 되돌리면 페이지도 보낸 값으로 돌아갑니다(반영 확인 전까지이며, 확인 후에는 최초 원래 값으로 돌아갑니다). 보낸 값을 취소하려면 원래 값으로 다시 편집해 생긴 "보낸 값 → 원래 값" 항목을 보내세요. 단, 새로고침·재활성화로 복원되었거나 HMR로 교체되어 "페이지 표시가 사라졌을 수 있음"이 붙은 항목은 페이지가 이미 원래 값을 보이므로, 보낸 뒤에는 이 방법으로 취소 항목을 만들 수 없습니다. 보내기 전에 목록을 확인하고 필요 없는 항목은 되돌리기로 지우세요. 응답을 기다리는 중에 익스텐션을 끄면 페이지 표시는 원복되고 보낸 항목은 저장소에 남아 다시 켤 때 복원됩니다. 다시 보내면 서버의 같은 항목이 새로 대기 상태가 될 뿐 중복되지 않습니다.
  - **반영 확인**: 전송 기록이 1건 이상이고 전송 중이 아닐 때 활성됩니다. 누르면 전송한 항목의 인라인 `!important`만 해제해 소스 값이 보이게 하고, 같은 동기 구간에서 computed를 보낸 값과 비교해 항목별로 `일치`·`불일치`·`확인 불가`와 상태 줄 요약(`반영 확인: 일치 n · 불일치 m · 확인 불가 k`)을 표시합니다. 미전송 편집값은 해제하지 않으므로 그대로 유지되고, 화면 깜빡임을 막기 위해 측정 동안에만 `transition`을 잠시 끕니다. 요소가 페이지에서 교체되었거나(확인 불가: 분리) 보낸 값을 브라우저가 계산하지 못하면(빈 값) 확인 불가로 보고합니다. 전송 기록은 확인 후 비워지므로(1회성) 다시 확인하려면 다시 보내야 합니다.
- **같은 소스의 여러 요소**: 변경 내역은 요소 자신의 소스 위치(`파일:라인:컬럼`)와 속성 기준 1건입니다. 반복 렌더링된 여러 요소나 class가 바뀐 같은 요소(예: `li.item` → `li.item.active`)를 편집해도 1건으로 합쳐지며 이전값은 최초 값, 새 값은 마지막 값입니다. 페이지에는 요소마다 편집한 값이 그대로 보이고, 1건을 되돌리면 그 소스의 편집한 요소가 모두 원복됩니다(패널에 "같은 소스에서 나온 요소 N개" 표시). 조상 위치를 물려받은 요소·위치 없는 요소는 선택자 요약(`selectorHint`)까지 같아야 합쳐집니다. 요소마다 원래 값이 다르면(예: `.active` 규칙으로 16px, 나머지 8px) 각 요소는 자기 원래 값과 비교됩니다. 편집한 값이 그 요소의 원래 값과 같으면 그 요소만 원복되고, 항목은 편집한 모든 요소가 각자 원래 값으로 돌아왔을 때만 사라집니다. 이때 이전값(처음 편집한 요소의 원래 값)과 새 값이 같게 표시될 수 있으며, 패널에 안내가 붙고 그대로 전송됩니다.
- **새로고침·HMR**: 패널을 켠 채 편집한 요소가 HMR·새로고침 등으로 교체되면 해당 항목에 "페이지 표시가 사라졌을 수 있음"이 표시되고 변경 내역은 유지됩니다. 교체된 새 요소에는 편집값이 다시 적용되지 않으므로, 필요하면 요소를 다시 선택해 편집하세요. 그 항목을 되돌리면 교체된 요소는 원복되지 않고(아직 페이지에 남은 같은 소스 요소만 원복) 내역이 지워집니다.
- **여러 탭**: 같은 origin의 여러 탭은 변경 내역 저장소를 함께 씁니다. 각 탭은 저장 직전에 저장소를 다시 읽어 자기가 만들거나 지운 항목만 반영하므로 다른 탭의 미전송 내역을 덮어쓰지 않습니다. 다른 탭의 내역은 다시 켤(또는 새로고침할) 때 목록에 나타납니다. 다만 다른 탭이 이미 보낸 항목은 원래 탭의 목록에 그대로 남습니다. 원래 탭에서 그 항목을 다시 편집하면 같은 id로 저장소에 다시 저장되고, 보내면 서버의 그 항목이 새 값과 반영 전 이전값으로 대기 상태로 돌아갑니다. 원래 탭에서 되돌리면 페이지는 원래 값이지만 서버에는 보낸 값이 대기 중으로 남습니다. 다른 탭에서 보낸 뒤에는 원래 탭을 다시 켜거나 새로고침한 뒤 편집하세요. 또한 두 탭에서 같은 소스·속성을 각각 편집하면 다시 켤(또는 새로고침할) 때 같은 소스·속성 항목이 2건 복원되고, 그대로 보내면 두 값이 모두 에이전트에 전달되어 서로 상충하는 지시가 됩니다. 같은 소스·속성은 한 탭에서만 편집하거나, 다시 켠 뒤 목록에서 같은 `파일:라인:컬럼`·속성 항목이 여러 건이면 남길 항목만 두고 나머지를 되돌리기로 지운 다음 보내세요. 화면 코멘트는 변경 내역과 달리 탭 간 병합 없이 마지막 저장이 이기므로, 여러 탭에서 같은 페이지 코멘트를 동시에 작성하면 한쪽 목록이 덮어써질 수 있습니다.
- **위치 검증 없음**: 서버는 소스 라인이 바뀌었는지 검증하지 않습니다. 편집 후 소스가 바뀌어 라인이 어긋날 수 있으므로 **에이전트가 `selectorHint`와 `before`로 대조할 책임**이 있습니다. 반영 품질은 에이전트에 달려 있습니다.
- **보호 영역은 경고만**: 보호 패턴에 걸린 정의 파일에서 온 변경은 `warning`이 붙을 뿐 차단되지 않으며, 반영 여부는 에이전트·사용자가 판단합니다. 위치를 조상에서 물려받은 요소는 그 조상의 속성으로 판정하고, `source.file`에 `node_modules` 세그먼트가 있으면 `reason`이 `node_modules`(우선), 아니고 `source.protected`가 `true`면 `pattern`입니다.
- **보호 판정 시점**: 판정은 빌드 시점에 이뤄지므로 `protected` 패턴을 바꾸면 dev 서버를 재시작(재변환)해야 반영됩니다. `node_modules` 규칙은 커스텀 주입기 등 다른 경로로 들어온 위치에 대한 방어 규칙이고, `@acme/ui` 같은 패키지형 디자인 시스템 specifier는 파일 경로가 아니라 보호 판정에 쓰이지 않습니다.
- **SDK 업그레이드**: 서버의 MCP SDK(`@modelcontextprotocol/server`·`@modelcontextprotocol/node`)를 올리면 응답에 CORS 헤더가 생기지 않는지 다시 확인하세요.

## 수동 확인 체크리스트

자동화 도구로 확인하지 못한 항목입니다. 처음 설치할 때 한 번 확인하세요.

- [ ] 실제 Chrome 툴바의 DOMirror 아이콘 클릭으로 패널이 켜지고 꺼진다.
- [ ] `http://localhost:<포트>` 주소의 앱 탭에서 아이콘 클릭 시 `activeTab`으로 스크립트가 주입된다.
- [ ] 정식 Chrome에서 `127.0.0.1` 서버로 전송할 때 로컬 네트워크 접근 권한 프롬프트가 뜨는지(뜨면 허용 후 전송 성공 여부).
- [ ] macOS 실제 Option 키 + 클릭으로 간격 보기 기준 요소가 고정/해제된다.
- [ ] 종단(AC-8): Claude Code에 서버 등록 → React·Vue 예제 각각에서 편집·전송 → 에이전트가 소스 수정 → 새로고침 후 같은 변경이 보인다.
- [ ] 종단(자동 확인): chrome-devtools-mcp를 함께 등록한 상태에서 에이전트가 일치 항목만 반영 완료로 표시하고 불일치 항목을 보고한다.
- [ ] 반영 확인: 편집·전송 후 소스를 반영하지 않은 상태에서 **반영 확인**을 누르면 페이지가 원래 값으로 돌아가고 `불일치`가, 소스를 반영한 뒤에는 `일치`가 표시되며 콘솔 에러가 없다.
- [ ] 컴포넌트 라벨: `src/ds/` 컴포넌트 호버 시 초록 라벨(`이름 · DS`), 일반 컴포넌트는 회색 라벨(`이름`)이 보이고, 선택 시 패널에 `컴포넌트:`·`정의:` 줄이 보이며 콘솔 에러가 없다.
- [ ] 코멘트: 요소 선택 → 코멘트 작성 → 번호 핀이 요소를 따라가고 클릭 시 본문이 보인다. 전송 성공·실패 표시와 재전송, 새로고침 후 복원이 동작하며 `<script>` 같은 본문이 텍스트로만 보인다.

## 개발

```sh
pnpm typecheck
pnpm lint
pnpm test
```
