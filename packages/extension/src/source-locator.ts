import {
  DOMIRROR_ATTR,
  DOMIRROR_COMPONENT_ATTR,
  DOMIRROR_DS_ATTR,
  DOMIRROR_PROTECTED_ATTR,
  parseComponentInfo,
  parseSourceLocation,
  type ComponentInfo,
  type SourceLocation,
} from '@domirror/shared';

/**
 * 위치 탐색에 필요한 최소 요소 인터페이스. 실제 `Element`가 구조적으로 만족하며,
 * 테스트에서는 DOM 환경 없이 가짜 객체로 대체한다.
 */
export interface LocatableElement {
  readonly tagName: string;
  readonly parentElement: LocatableElement | null;
  getAttribute(name: string): string | null;
  closest(selectors: string): LocatableElement | null;
}

export interface Located {
  location: SourceLocation;
  /** 선택 요소가 아니라 조상의 위치를 쓴 경우 true (E-1·E-3). */
  inherited: boolean;
  /** 위치를 제공한 요소에 보호 속성이 있으면 true (FR-5·E-1·E-4). */
  protected: boolean;
}

export interface LocatedComponent extends ComponentInfo {
  /** 디자인 시스템 컴포넌트면 true (FR-7). */
  designSystem: boolean;
}

const ATTR_SELECTOR = `[${DOMIRROR_ATTR}]`;
const COMPONENT_SELECTOR = `[${DOMIRROR_COMPONENT_ATTR}]`;
const HINT_MAX_CLASSES = 3;

/**
 * 요소 자신 → 가장 가까운 조상 순으로 해석 가능한 `data-domirror` 값을 찾는다.
 * 값이 깨진 요소는 건너뛰고 더 위로 올라가며, 끝까지 없으면 `null`(전송 제외, E-1).
 */
export function locate(el: LocatableElement): Located | null {
  let current = el.closest(ATTR_SELECTOR);
  while (current) {
    const location = parseSourceLocation(current.getAttribute(DOMIRROR_ATTR) ?? '');
    if (location)
      // 보호 여부는 위치를 제공한 요소(자신 또는 조상) 기준으로 판정한다(E-1).
      return {
        location,
        inherited: current !== el,
        protected: current.getAttribute(DOMIRROR_PROTECTED_ATTR) !== null,
      };
    current = current.parentElement?.closest(ATTR_SELECTOR) ?? null;
  }
  return null;
}

/**
 * 요소 자신 → 가장 가까운 조상 순으로 `data-domirror-component` 값을 찾는다.
 * 값이 깨진 요소는 건너뛰고 더 위로 올라가며, 끝까지 없으면 `null`(라벨 숨김·컴포넌트 정보 없음, E-9).
 */
export function locateComponent(el: LocatableElement): LocatedComponent | null {
  let current = el.closest(COMPONENT_SELECTOR);
  while (current) {
    const info = parseComponentInfo(current.getAttribute(DOMIRROR_COMPONENT_ATTR) ?? '');
    if (info) return { ...info, designSystem: current.getAttribute(DOMIRROR_DS_ATTR) !== null };
    current = current.parentElement?.closest(COMPONENT_SELECTOR) ?? null;
  }
  return null;
}

/** 속성 값이 정확히 `value`인 요소를 찾는 선택자. 값은 큰따옴표 문자열로 이스케이프한다. */
export function sameSourceSelector(value: string): string {
  const escaped = value.replace(/["\\]/g, '\\$&').replace(/\n/g, '\\a ');
  return `[${DOMIRROR_ATTR}="${escaped}"]`;
}

/** 같은 소스 위치에서 렌더링된 요소 수(E-2). */
export function countSameSource(value: string, root: Pick<ParentNode, 'querySelectorAll'> = document): number {
  return root.querySelectorAll(sameSourceSelector(value)).length;
}

/** 사람이 알아보기 위한 요소 요약(예: `div#main.card.active`). 정확한 선택자를 보장하지 않는다. */
export function selectorHint(el: Pick<LocatableElement, 'tagName' | 'getAttribute'>): string {
  let hint = el.tagName.toLowerCase();
  const id = el.getAttribute('id')?.trim();
  if (id) hint += `#${id}`;
  const classes = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
  for (const name of classes.slice(0, HINT_MAX_CLASSES)) hint += `.${name}`;
  if (classes.length > HINT_MAX_CLASSES) hint += '…';
  return hint;
}
