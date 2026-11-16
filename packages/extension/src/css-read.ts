// 편집 전 값(before) 읽기(S-16): 인라인 → 매칭 CSSStyleRule → getComputedStyle.
// `authored`는 작성 원문(없으면 null), `computed`는 resolved value다.
// 캐스케이드는 근사치다: !important → 인라인 → 명시도 → 문서 순서만 비교하고 @layer 순서·중첩 규칙·Shadow DOM 시트는 보지 않는다.

export interface BeforeValue {
  authored: string | null;
  computed: string;
}

/** [id, class·속성·의사 클래스, 타입·의사 요소] */
export type Specificity = readonly [number, number, number];

export interface Declaration {
  value: string;
  important: boolean;
  /** 인라인 style 속성이면 true(같은 중요도에서 규칙보다 우선). */
  inline: boolean;
  specificity: Specificity;
  /** 문서 순서. 클수록 나중. */
  order: number;
}

const LEGACY_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter']);
const ZERO: Specificity = [0, 0, 0];

/** 최상위 쉼표로 선택자 목록을 나눈다(괄호·대괄호·문자열 안의 쉼표는 무시). */
export function splitSelectorList(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') {
      i++;
    } else if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '(' || ch === '[') {
      depth++;
    } else if (ch === ')' || ch === ']') {
      depth = Math.max(0, depth - 1);
    } else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts.filter(Boolean);
}

export function compareSpecificity(x: Specificity, y: Specificity): number {
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

function maxSpecificity(list: readonly Specificity[]): Specificity {
  return list.reduce<Specificity>((max, s) => (compareSpecificity(s, max) > 0 ? s : max), ZERO);
}

/** `start`의 '('와 짝인 ')'의 인덱스(없으면 문자열 끝). */
function closingParen(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') i++;
    else if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return i;
  }
  return text.length;
}

/**
 * CSS 식별자 문자(영숫자·'_'·'-'·비 ASCII). 비 ASCII는 정규식 범위 대신 코드 값으로 판정한다
 * (번들러가 범위 끝을 U+FFFF 같은 비문자 리터럴로 바꾸면 Chrome이 content script를 UTF-8 아님으로 거부한다).
 */
function isIdentChar(ch: string): boolean {
  return /[\w-]/.test(ch) || ch.charCodeAt(0) >= 0x80;
}

function readIdent(text: string, start: number): string {
  let end = start;
  while (end < text.length) {
    if (text[end] === '\\') end += 2;
    else if (isIdentChar(text[end])) end++;
    else break;
  }
  return text.slice(start, Math.min(end, text.length));
}

/** 복합 선택자 1개의 명시도(근사). `:is`·`:not`·`:has`는 인자 최대값, `:where`는 0. */
export function specificity(selector: string): Specificity {
  let a = 0;
  let b = 0;
  let c = 0;
  let i = 0;
  while (i < selector.length) {
    const ch = selector[i];
    if (ch === '#') {
      a++;
      i += 1 + readIdent(selector, i + 1).length;
    } else if (ch === '.') {
      b++;
      i += 1 + readIdent(selector, i + 1).length;
    } else if (ch === '[') {
      b++;
      const end = selector.indexOf(']', i);
      i = end === -1 ? selector.length : end + 1;
    } else if (ch === ':') {
      const isElement = selector[i + 1] === ':';
      const nameStart = i + (isElement ? 2 : 1);
      const name = readIdent(selector, nameStart).toLowerCase();
      let next = nameStart + name.length;
      let inner: string | null = null;
      if (selector[next] === '(') {
        const close = closingParen(selector, next);
        inner = selector.slice(next + 1, close);
        next = close + 1;
      }
      if (isElement || LEGACY_PSEUDO_ELEMENTS.has(name)) {
        c++;
      } else if (name === 'where') {
        // 명시도 0
      } else if ((name === 'is' || name === 'not' || name === 'has' || name === 'matches') && inner !== null) {
        const s = maxSpecificity(splitSelectorList(inner).map(specificity));
        a += s[0];
        b += s[1];
        c += s[2];
      } else {
        b++;
      }
      i = next;
    } else if (ch === '"' || ch === "'") {
      const end = selector.indexOf(ch, i + 1);
      i = end === -1 ? selector.length : end + 1;
    } else if (isIdentChar(ch) && !/[0-9]/.test(ch)) {
      c++;
      i += readIdent(selector, i).length || 1;
    } else {
      // 결합자·공백·'*'·'|'
      i++;
    }
  }
  return [a, b, c];
}

function outranks(x: Declaration, y: Declaration): boolean {
  if (x.important !== y.important) return x.important;
  if (x.inline !== y.inline) return x.inline;
  return (compareSpecificity(x.specificity, y.specificity) || x.order - y.order) > 0;
}

/** 캐스케이드 승자의 값. 선언이 없으면 null. */
export function pickAuthored(declarations: readonly Declaration[]): string | null {
  let winner: Declaration | null = null;
  for (const d of declarations) {
    if (!d.value) continue;
    if (!winner || outranks(d, winner)) winner = d;
  }
  return winner ? winner.value : null;
}

/** 선택자 목록 중 `el`과 일치하는 것의 최대 명시도. 일치 없음이면 null. */
function matchedSpecificity(el: Element, selectorText: string): Specificity | null {
  let best: Specificity | null = null;
  for (const part of splitSelectorList(selectorText)) {
    let matches = false;
    try {
      matches = el.matches(part);
    } catch {
      // 의사 요소 등 matches()가 받지 않는 선택자는 건너뛴다.
    }
    if (!matches) continue;
    const s = specificity(part);
    if (!best || compareSpecificity(s, best) > 0) best = s;
  }
  return best;
}

function mediaMatches(media: MediaList): boolean {
  return media.length === 0 || window.matchMedia(media.mediaText).matches;
}

function readRules(owner: { readonly cssRules: CSSRuleList }): CSSRuleList | null {
  try {
    return owner.cssRules;
  } catch {
    // 교차 출처 시트는 cssRules 접근 시 SecurityError — 건너뛴다.
    return null;
  }
}

/** 문서의 스타일시트에서 `el`과 일치하고 `property`를 선언한 규칙을 문서 순서로 모은다. */
function collectRuleDeclarations(el: Element, property: string): Declaration[] {
  const found: Declaration[] = [];
  let order = 0;

  const visit = (rules: CSSRuleList | null): void => {
    if (!rules) return;
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        const value = rule.style.getPropertyValue(property).trim();
        if (!value) continue;
        const s = matchedSpecificity(el, rule.selectorText);
        if (s) found.push({ value, important: rule.style.getPropertyPriority(property) === 'important', inline: false, specificity: s, order: order++ });
      } else if (rule instanceof CSSMediaRule) {
        if (mediaMatches(rule.media)) visit(readRules(rule));
      } else if (rule instanceof CSSSupportsRule) {
        if (CSS.supports(rule.conditionText)) visit(readRules(rule));
      } else if (rule instanceof CSSImportRule) {
        if (rule.styleSheet && mediaMatches(rule.media)) visit(readRules(rule.styleSheet));
      } else if (rule instanceof CSSGroupingRule) {
        // @layer 블록 등. 레이어 순서는 반영하지 않는다(근사).
        visit(readRules(rule));
      }
    }
  };

  const sheets = [...document.styleSheets, ...document.adoptedStyleSheets];
  for (const sheet of sheets) {
    if (sheet.disabled || !mediaMatches(sheet.media)) continue;
    visit(readRules(sheet));
  }
  return found;
}

/** 편집 전 값. 인라인 → 매칭 CSSStyleRule → getComputedStyle 순(S-16). */
export function readBefore(el: Element, property: string): BeforeValue {
  const declarations = collectRuleDeclarations(el, property);
  if (el instanceof HTMLElement || el instanceof SVGElement) {
    const value = el.style.getPropertyValue(property).trim();
    if (value) {
      declarations.push({
        value,
        important: el.style.getPropertyPriority(property) === 'important',
        inline: true,
        specificity: ZERO,
        order: Number.MAX_SAFE_INTEGER,
      });
    }
  }
  return {
    authored: pickAuthored(declarations),
    computed: getComputedStyle(el).getPropertyValue(property).trim(),
  };
}
