import { BRIDGE_OWNER_MAX, type ComponentRuntimeInfo, type RuntimeSourceRef } from '@domirror/shared';

/**
 * React fiber 중 이 모듈이 읽는 필드만 담은 구조적 인터페이스. 실제 fiber가 만족하며,
 * 테스트에서는 DOM·React 없이 가짜 객체로 대체한다(NFR-6).
 */
export interface FiberLike {
  tag: number;
  type: unknown;
  stateNode?: unknown;
  return?: FiberLike | null;
  child?: FiberLike | null;
  sibling?: FiberLike | null;
  _debugOwner?: FiberLike | null;
  _debugStack?: string | { stack?: string } | null;
  memoizedProps?: unknown;
  alternate?: FiberLike | null;
}

export interface StackFrame {
  url: string;
  line: number;
  column: number;
}

export interface RuntimeDescription {
  /** 컴포넌트 fiber를 찾지 못하면 null(브리지는 이 값을 그대로 돌려준다). */
  info: ComponentRuntimeInfo | null;
  /** 선택 요소(호스트 태그)가 쓰인 위치. 코멘트 `source` 채움에도 쓴다(E-6·Q2). */
  hostSource?: RuntimeSourceRef;
  /** 호스트 위치를 못 얻어 owner/return 상위에서 위치를 얻었을 때, 원래 컴포넌트 이름(INT-013 FR-3). 익스텐션 내부 전용. */
  fallbackFrom?: string;
}

/** Fiber tag 상수(react-reconciler). 0 함수, 1 클래스, 3 HostRoot, 11 forwardRef, 14 memo, 15 simpleMemo. */
const FUNCTION_COMPONENT = 0;
const CLASS_COMPONENT = 1;
const HOST_ROOT = 3;
const FORWARD_REF = 11;
const MEMO_COMPONENT = 14;
const SIMPLE_MEMO_COMPONENT = 15;

const COMPONENT_TAGS = new Set([
  FUNCTION_COMPONENT,
  CLASS_COMPONENT,
  FORWARD_REF,
  MEMO_COMPONENT,
  SIMPLE_MEMO_COMPONENT,
]);

const FIBER_KEY_PREFIX = '__reactFiber$';
const SOURCE_EXTENSION = /\.(?:tsx|ts|jsx|js)$/;
const V8_FRAME = /^\s*at\s+(?:.*?\()?(.+?):(\d+):(\d+)\)?\s*$/;
/** 프로젝트 소스가 아닌 프레임. 첫 프로젝트 프레임을 고를 때 건너뛴다. */
const NOISE_FRAME = /node_modules|@react-refresh|\.vite\/deps|react-dom|react-jsx/;
/** CRA/Webpack dev 번들 프레임(원점 바로 아래 `/static/js/`·`.chunk.js`). 소스맵 없이는 프로젝트 위치가 아니므로 건너뛴다(E-3). */
const WEBPACK_BUNDLE_FRAME = /^[a-z][\w+.-]*:\/\/[^/]+\/static\/js\/|\.chunk\.js(?:[?#]|$)/i;

/**
 * 호스트 DOM 노드의 own key 중 `__reactFiber$` 접두 키에서 fiber를 읽는다(FR-2).
 * 키 뒤 접미사는 렌더마다 달라지므로 접두사로 찾는다.
 */
export function fiberFromNode(node: unknown): FiberLike | null {
  if (typeof node !== 'object' || node === null) return null;

  let keys: string[];
  try {
    keys = Object.getOwnPropertyNames(node);
  } catch {
    return null;
  }
  for (const key of keys) {
    if (!key.startsWith(FIBER_KEY_PREFIX)) continue;
    const fiber = (node as Record<string, unknown>)[key];
    if (typeof fiber === 'object' && fiber !== null) return fiber as FiberLike;
  }
  return null;
}

/**
 * 호스트 fiber에서 `return`을 타고 올라가 가장 가까운 함수·클래스 컴포넌트 fiber를 찾는다(FR-3·E-6).
 * HostRoot(3)에 닿으면 중단하고, Offscreen(22) 같은 비컴포넌트 fiber는 통과한다.
 */
export function nearestComponent(fiber: FiberLike | null): FiberLike | null {
  let current = fiber?.return ?? null;
  while (current) {
    if (current.tag === HOST_ROOT) return null;
    if (COMPONENT_TAGS.has(current.tag)) return current;
    current = current.return ?? null;
  }
  return null;
}

/** 함수·객체 타입에서 컴포넌트 이름을 고른다. displayName > name, memo·forwardRef는 감싼 대상을 따른다. */
export function nameOfType(type: unknown): string | null {
  if (typeof type === 'function') return nameOfFunction(type as { displayName?: unknown; name?: unknown });
  if (typeof type !== 'object' || type === null) return null;

  const record = type as { displayName?: unknown; type?: unknown; render?: unknown };
  if (typeof record.displayName === 'string' && record.displayName.trim() !== '') return record.displayName.trim();
  if ('type' in record) return nameOfType(record.type); // memo
  if ('render' in record) return nameOfType(record.render); // forwardRef
  return null;
}

function nameOfFunction(value: { displayName?: unknown; name?: unknown }): string | null {
  if (typeof value.displayName === 'string' && value.displayName.trim() !== '') return value.displayName.trim();
  if (typeof value.name === 'string' && value.name.trim() !== '') return value.name.trim();
  return null;
}

/** 컴포넌트 이름. 이름이 없으면 `Anonymous`(E-5). */
export function componentName(fiber: FiberLike | null): string {
  return nameOfType(fiber?.type) ?? 'Anonymous';
}

function stackText(source: string | { stack?: string } | null | undefined): string {
  if (typeof source === 'string') return source;
  if (source && typeof source === 'object' && typeof source.stack === 'string') return source.stack;
  return '';
}

/**
 * V8 스택에서 `url:line:column` 프레임만 뽑는다. 괄호형(`at Fn (url:1:2)`)·비괄호형(`at url:1:2`)을 모두 받는다.
 * Safari 형식 등 나머지 줄은 버린다.
 */
export function parseStackFrames(stack: string | { stack?: string } | null | undefined): StackFrame[] {
  const text = stackText(stack);
  if (text === '') return [];

  const frames: StackFrame[] = [];
  for (const line of text.split('\n')) {
    const match = V8_FRAME.exec(line);
    if (!match) continue;
    frames.push({ url: match[1], line: Number(match[2]), column: Number(match[3]) });
  }
  return frames;
}

/**
 * 스택 프레임 URL을 프로젝트 파일 경로로 정규화한다(E-4).
 * 쿼리·해시를 떼고 `/@fs/`·프로토콜 URL은 경로만 남긴다. node_modules이거나 소스 확장자가 아니면 null.
 */
export function normalizeFile(url: string): string | null {
  let path = url.trim();
  if (path === '') return null;

  let fromUrl = false;
  let absolute = false;
  const schemeIndex = path.indexOf('://');
  if (schemeIndex >= 0) {
    absolute = path.slice(0, schemeIndex).toLowerCase() === 'file';
    const rest = path.slice(schemeIndex + 3);
    const slash = rest.indexOf('/');
    path = slash >= 0 ? rest.slice(slash) : '';
    fromUrl = true;
  }
  path = path.replace(/[?#].*$/, '');
  if (path === '') return null;
  if (path.includes('/node_modules/')) return null;

  const fsIndex = path.indexOf('/@fs/');
  if (fsIndex >= 0) {
    // `/@fs/` 뒤부터가 파일 시스템 절대 경로다(경계의 '/'는 남긴다).
    path = path.slice(fsIndex + 4);
  } else if (fromUrl && !absolute && path.startsWith('/')) {
    // dev 서버 URL의 경로는 프로젝트 루트 기준이다.
    path = path.slice(1);
  }
  if (path === '' || !SOURCE_EXTENSION.test(path)) return null;
  return path;
}

/** 프로젝트 프레임 중 첫 번째를 위치로 쓴다. 소스맵 보정을 하지 않으므로 라인은 `line-unverified`다(Q1 (a)). */
export function toSourceRef(frames: StackFrame[]): RuntimeSourceRef | undefined {
  for (const frame of frames) {
    if (NOISE_FRAME.test(frame.url) || WEBPACK_BUNDLE_FRAME.test(frame.url)) continue;
    const file = normalizeFile(frame.url);
    if (!file) continue;
    return { file, line: frame.line, column: frame.column, precision: 'line-unverified' };
  }
  return undefined;
}

/** 가까운 순 owner chain. HostRoot에서 중단하고 `max`개까지만 담는다(FR-4). 순환 참조도 방어한다. */
export function ownerChain(fiber: FiberLike | null, max: number = BRIDGE_OWNER_MAX): string[] {
  const limit = Number.isInteger(max) && max > 0 ? max : BRIDGE_OWNER_MAX;
  const names: string[] = [];
  const seen = new Set<FiberLike>();

  let current = fiber;
  // `_debugOwner`는 페이지가 변조할 수 있으므로 순환·무한 상향을 막는다(E-11).
  while (current && names.length < limit && !seen.has(current)) {
    seen.add(current);
    if (current.tag === HOST_ROOT) break;
    if (COMPONENT_TAGS.has(current.tag)) names.push(componentName(current));
    current = current._debugOwner ?? current.return ?? null;
  }
  return names;
}

interface DebugSourceLike {
  fileName?: unknown;
  lineNumber?: unknown;
  columnNumber?: unknown;
}

/** React ≤18의 `_debugSource`(파일·라인·컬럼 신뢰). React 19에는 없으므로 방어적으로만 읽는다. */
function debugSourceRef(fiber: FiberLike | null): RuntimeSourceRef | undefined {
  if (!fiber) return undefined;
  const source = (fiber as { _debugSource?: DebugSourceLike | null })._debugSource;
  if (!source || typeof source !== 'object') return undefined;

  const fileName = typeof source.fileName === 'string' ? source.fileName.trim() : '';
  const file = normalizeFile(fileName);
  if (!file) return undefined;

  const line = positiveInteger(source.lineNumber);
  const column = positiveInteger(source.columnNumber);
  const ref: RuntimeSourceRef = { file, precision: 'line-unverified' };
  if (line !== undefined) ref.line = line;
  if (column !== undefined) ref.column = column;
  if (line !== undefined && column !== undefined) ref.precision = 'exact';
  return ref;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

/** fiber의 `_debugSource`(있으면) 또는 `_debugStack`에서 위치를 얻는다(FR-3·R-1). */
function sourceRefFrom(fiber: FiberLike | null): RuntimeSourceRef | undefined {
  const debugSource = debugSourceRef(fiber);
  if (debugSource) return debugSource;
  // owner stack 캡처가 열화되면(1만 회 생성 후) 프로젝트 프레임이 없어 자연히 undefined가 된다.
  return toSourceRef(parseStackFrames(fiber?._debugStack));
}

/**
 * `_debugOwner ?? return` 순으로 올라가며 처음 얻은 프로젝트 위치(FR-1·FR-2·E-1·E-2). 시작 fiber 자신은 보지 않는다.
 * HostRoot에서 중단, 방문 상한 max(기본 BRIDGE_OWNER_MAX), seen으로 순환 방지.
 */
export function ancestorSourceRef(
  fiber: FiberLike | null,
  max: number = BRIDGE_OWNER_MAX,
): RuntimeSourceRef | undefined {
  const limit = Number.isInteger(max) && max > 0 ? max : BRIDGE_OWNER_MAX;
  const seen = new Set<FiberLike>();
  if (fiber) seen.add(fiber);

  let visited = 0;
  let current = fiber?._debugOwner ?? fiber?.return ?? null;
  // `_debugOwner`는 페이지가 변조할 수 있으므로 순환·무한 상향을 막는다(E-2).
  while (current && visited < limit && !seen.has(current)) {
    seen.add(current);
    visited++;
    if (current.tag === HOST_ROOT) break;
    const ref = sourceRefFrom(current);
    if (ref) return ref;
    current = current._debugOwner ?? current.return ?? null;
  }
  return undefined;
}

/**
 * 선택 요소의 fiber에서 컴포넌트 정보를 만든다(FR-3~FR-5).
 * - `definition`·`hostSource`: 호스트 fiber의 위치(컴포넌트 파일 안에서 호스트 태그를 쓴 곳)
 * - `callSite`: 가장 가까운 composite fiber의 위치(그 컴포넌트를 쓴 JSX)
 * `via`는 획득 경로로, 호출자(브리지)가 정한다.
 */
export function describeRuntime(
  fiber: FiberLike | null,
  via: ComponentRuntimeInfo['via'] = 'fiber',
): RuntimeDescription {
  const own = sourceRefFrom(fiber);
  const nearest = nearestComponent(fiber);
  if (!nearest) return own ? { info: null, hostSource: own } : { info: null };

  // 호스트 위치가 라이브러리(node_modules) 안이면 상위 프로젝트 컴포넌트 위치로 대신한다(INT-013 FR-1).
  const fallback = own ? undefined : ancestorSourceRef(fiber);
  const hostSource = own ?? fallback;

  const info: ComponentRuntimeInfo = { name: componentName(nearest), via };
  if (hostSource) info.definition = hostSource;

  // 호스트 폴백일 때만 상위를 탐색한다(그 외에는 nearest 자신의 위치만 쓴다).
  const callSite = sourceRefFrom(nearest) ?? (fallback ? ancestorSourceRef(nearest) : undefined);
  if (callSite) info.callSite = callSite;

  const owners = ownerChain(fiber);
  if (owners.length > 0) info.owners = owners;

  const description: RuntimeDescription = hostSource ? { info, hostSource } : { info };
  if (fallback) description.fallbackFrom = componentName(nearest);
  return description;
}
