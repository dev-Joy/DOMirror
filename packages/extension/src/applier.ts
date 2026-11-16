// 편집 즉시 반영(FR-6)과 원복(FR-8·NFR-3). 대상 요소에는 인라인 style 외에 아무것도 쓰지 않는다.

/** 테스트에서 가짜 객체로 대체할 수 있는 최소 인라인 스타일 인터페이스. */
export interface InlineStyle {
  readonly length: number;
  getPropertyValue(property: string): string;
  getPropertyPriority(property: string): string;
  setProperty(property: string, value: string, priority?: string): void;
  removeProperty(property: string): string;
}

export interface StyledElement {
  readonly style: InlineStyle;
  hasAttribute(name: string): boolean;
  removeAttribute(name: string): void;
}

/** 편집 전 인라인 값과 우선순위(`''` 또는 `'important'`). 값이 `''`이면 인라인 선언이 없었다. */
export interface PrevInline {
  value: string;
  priority: string;
}

export interface RestoreOptions {
  /** 원복 후 인라인 선언이 하나도 없으면 빈 `style` 속성도 지운다(원래 속성이 없던 요소). */
  removeEmptyStyleAttribute?: boolean;
}

/**
 * 인라인 `!important`로 적용한다. 페이지 규칙의 `!important`보다도 우선해 즉시 보이도록 하기 위함이다.
 * 값 유효성은 호출 측이 `CSS.supports`로 먼저 확인한다.
 */
export function applyStyle(el: StyledElement, property: string, value: string): PrevInline {
  const prev: PrevInline = {
    value: el.style.getPropertyValue(property),
    priority: el.style.getPropertyPriority(property),
  };
  el.style.setProperty(property, value, 'important');
  return prev;
}

export function restoreStyle(el: StyledElement, property: string, prev: PrevInline, options: RestoreOptions = {}): void {
  if (prev.value) el.style.setProperty(property, prev.value, prev.priority);
  else el.style.removeProperty(property);
  if (options.removeEmptyStyleAttribute && el.style.length === 0 && el.hasAttribute('style')) el.removeAttribute('style');
}

interface KeyRecord {
  property: string;
  /** 이 변경 항목이 시작될 때의 요소별 인라인 값. 같은 소스의 여러 요소(E-2)를 함께 원복한다. */
  prevs: Map<StyledElement, PrevInline>;
}

/**
 * 적용 이력. 변경 항목(key) 단위 원복과, 끌 때(NFR-3) 처음 손대기 전 상태로의 전체 원복을 함께 관리한다.
 */
export class AppliedStyles {
  readonly #byKey = new Map<string, KeyRecord>();
  /** 요소·속성별 최초 인라인 값(전송으로 항목이 사라져도 끌 때 원복하기 위해 유지). */
  readonly #originals = new Map<StyledElement, Map<string, PrevInline>>();
  /** 처음 손대기 전 `style` 속성이 있었는지. */
  readonly #hadStyleAttribute = new Map<StyledElement, boolean>();

  apply(key: string, el: StyledElement, property: string, value: string): void {
    if (!this.#hadStyleAttribute.has(el)) this.#hadStyleAttribute.set(el, el.hasAttribute('style'));
    const prev = applyStyle(el, property, value);

    let originals = this.#originals.get(el);
    if (!originals) this.#originals.set(el, (originals = new Map()));
    if (!originals.has(property)) originals.set(property, prev);

    let record = this.#byKey.get(key);
    if (!record) this.#byKey.set(key, (record = { property, prevs: new Map() }));
    if (!record.prevs.has(el)) record.prevs.set(el, prev);
  }

  /** 변경 항목 시작 전 인라인 값으로 되돌린다(FR-8). 추적 중이 아니면(복원된 항목 등) 아무것도 하지 않는다. */
  revert(key: string): void {
    const record = this.#byKey.get(key);
    if (!record) return;
    this.#byKey.delete(key);
    for (const [el, prev] of record.prevs) {
      restoreStyle(el, record.property, prev, { removeEmptyStyleAttribute: this.#hadStyleAttribute.get(el) === false });
    }
  }

  /** 전송된 항목: 페이지 표시는 유지하고 항목 단위 원복 대상에서만 뺀다. */
  forget(key: string): void {
    this.#byKey.delete(key);
  }

  /** 처음 손대기 전 상태로 모두 되돌린다(NFR-3). */
  restoreAll(): void {
    for (const [el, originals] of this.#originals) {
      const removeEmptyStyleAttribute = this.#hadStyleAttribute.get(el) === false;
      for (const [property, prev] of originals) restoreStyle(el, property, prev, { removeEmptyStyleAttribute });
    }
    this.#byKey.clear();
    this.#originals.clear();
    this.#hadStyleAttribute.clear();
  }
}
