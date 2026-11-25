import { nameOfType } from './react-runtime.js';

/** props 요약 문자열 최대 길이(INT-012 spec §6). 초과 시 1023자 + `…`. */
export const PROPS_SUMMARY_MAX = 1024;
/** 민감 키 값 대신 표시하는 문자열(FR-4). */
export const PROPS_MASK = '•••';

const SENSITIVE_KEY = /token|password|secret|key|auth/i;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const LINE_BREAK = /[\r\n\u2028\u2029]/g;
const STRING_MAX = 80;
const ARRAY_ITEMS_MAX = 5;
const OBJECT_KEYS_MAX = 20;
/** 최상위 props 객체 = 깊이 1. 이 깊이까지 펼치고 더 깊은 객체·배열은 접는다. */
const DEPTH_MAX = 2;
const ERROR_TEXT = '[Error]';
const REACT_ELEMENT_TYPES = new Set<unknown>([
  Symbol.for('react.transitional.element'),
  Symbol.for('react.element'),
]);

/** 키 이름에 token·password·secret·key·auth가 들어가면(대소문자 무시) 민감 키다. `keyboard` 같은 과마스킹은 의도된 동작이다(E-10). */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

/**
 * 컴포넌트 props를 한 줄 문자열로 요약·마스킹한다(INT-012 FR-3·FR-4, spec §6 표).
 * MAIN world에서 호출하므로 원본 객체·함수·노드는 돌려주지 않고, getter·Proxy 예외는 삼킨다(NFR-3).
 * props가 null이 아닌 객체가 아니면 undefined.
 */
export function summarizeProps(props: unknown): string | undefined {
  if (typeof props !== 'object' || props === null) return undefined;
  let text: string;
  try {
    text = summarizeValue(props, 1, new Set<object>());
  } catch {
    text = ERROR_TEXT;
  }
  text = text.replace(LINE_BREAK, ' ');
  return text.length > PROPS_SUMMARY_MAX ? `${text.slice(0, PROPS_SUMMARY_MAX - 1)}…` : text;
}

/** 값 하나를 요약한다. 예상 밖 예외는 이 값만 `[Error]`로 바꾼다. */
function summarizeValue(value: unknown, depth: number, ancestors: Set<object>): string {
  try {
    return summarizeUnsafe(value, depth, ancestors);
  } catch {
    return ERROR_TEXT;
  }
}

function summarizeUnsafe(value: unknown, depth: number, ancestors: Set<object>): string {
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value.length > STRING_MAX ? `${value.slice(0, STRING_MAX)}…` : value);
    case 'number':
    case 'boolean':
      return String(value);
    case 'undefined':
      return 'undefined';
    case 'bigint':
      return `${value}n`;
    case 'symbol':
      return value.toString();
    case 'function':
      return `ƒ ${functionName(value) || 'anonymous'}`;
    default:
      break;
  }
  if (value === null) return 'null';
  const target = value as object;

  const element = reactElementText(target);
  if (element !== null) return element;
  const node = domNodeText(target);
  if (node !== null) return node;
  if (ancestors.has(target)) return '[Circular]';

  const isArray = Array.isArray(target);
  if (depth > DEPTH_MAX) return isArray ? '[…]' : '{…}';

  ancestors.add(target);
  try {
    return isArray ? arrayText(target as unknown[], depth, ancestors) : objectText(target, depth, ancestors);
  } finally {
    ancestors.delete(target);
  }
}

function functionName(fn: unknown): string {
  try {
    const name = (fn as { name?: unknown }).name;
    return typeof name === 'string' ? name : '';
  } catch {
    return '';
  }
}

function reactElementText(value: object): string | null {
  const record = value as { $$typeof?: unknown; type?: unknown };
  if (!REACT_ELEMENT_TYPES.has(record.$$typeof)) return null;
  const type = record.type;
  if (typeof type === 'string') return `<${type}>`;
  return `<${nameOfType(type) ?? 'Anonymous'}>`;
}

function domNodeText(value: object): string | null {
  const record = value as { nodeType?: unknown; nodeName?: unknown };
  if (typeof record.nodeType !== 'number' || typeof record.nodeName !== 'string') return null;
  return `[Node ${record.nodeName.toLowerCase()}]`;
}

function arrayText(value: unknown[], depth: number, ancestors: Set<object>): string {
  const length = value.length;
  if (length === 0) return '[]';
  const items: string[] = [];
  const shown = Math.min(length, ARRAY_ITEMS_MAX);
  for (let i = 0; i < shown; i += 1) {
    let item: unknown;
    try {
      item = value[i];
    } catch {
      items.push(ERROR_TEXT);
      continue;
    }
    items.push(summarizeValue(item, depth + 1, ancestors));
  }
  if (length > shown) items.push(`…(+${length - shown})`);
  return `[${items.join(', ')}]`;
}

function objectText(value: object, depth: number, ancestors: Set<object>): string {
  let keys: string[];
  try {
    keys = Object.keys(value);
  } catch {
    return ERROR_TEXT;
  }
  if (keys.length === 0) return '{}';

  const entries: string[] = [];
  const shown = Math.min(keys.length, OBJECT_KEYS_MAX);
  for (let i = 0; i < shown; i += 1) {
    const key = keys[i];
    const label = IDENTIFIER.test(key) ? key : JSON.stringify(key);
    // 민감 키는 값을 읽기 전에 가린다(getter 미호출, 객체여도 펼치지 않음).
    if (isSensitiveKey(key)) {
      entries.push(`${label}: ${PROPS_MASK}`);
      continue;
    }
    let item: unknown;
    try {
      item = (value as Record<string, unknown>)[key];
    } catch {
      entries.push(`${label}: ${ERROR_TEXT}`);
      continue;
    }
    entries.push(`${label}: ${summarizeValue(item, depth + 1, ancestors)}`);
  }
  if (keys.length > shown) entries.push(`…(+${keys.length - shown})`);
  return `{ ${entries.join(', ')} }`;
}
