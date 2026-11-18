// 편집 즉시 반영(FR-6)과 원복(FR-8·NFR-3). 대상 요소에는 인라인 style 외에 아무것도 쓰지 않는다.

import { aggregateStatus, measureReleased, type ReadComputed, type SentInfo, type VerifyItem } from './verify.js';

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
  /** 문서에 붙어 있는지. 새로고침·HMR로 교체되면 false(E-6). */
  readonly isConnected: boolean;
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

interface ElementState {
  /** 이 항목에서 이 요소를 처음 건드리기 전 인라인 값(되돌리기 기준). */
  prev: PrevInline;
  /** 이 요소의 원래 값(처음 건드릴 때 readBefore의 authored ?? computed, trim). 편집값이 같으면 이 요소만 원복한다. */
  original: string;
}

interface KeyRecord {
  property: string;
  /** 같은 소스의 여러 요소(E-2)별 상태. 불변식: record가 있으면 1개 이상. */
  elements: Map<StyledElement, ElementState>;
}

/** 전송 기록(FR-1). 반영 확인 때 해제·원복 기준이다(전송 이전 인라인 값). */
interface SentRecord {
  property: string;
  /** 보낸 값(마지막 전송). */
  after: string;
  info: SentInfo;
  /** 요소별 전송 이전 인라인 값. 같은 key를 다시 보내도 최초값을 유지한다(D-S3). */
  elements: Map<StyledElement, PrevInline>;
}

/**
 * 적용 이력. 변경 항목(key) 단위 원복과, 끌 때(NFR-3) 처음 손대기 전 상태로의 전체 원복을 함께 관리한다.
 */
export class AppliedStyles {
  readonly #byKey = new Map<string, KeyRecord>();
  /** 전송한 항목의 기록. 반영 확인(1회성) 또는 끌 때 비운다(FR-6). */
  readonly #sent = new Map<string, SentRecord>();
  /** 요소·속성별 최초 인라인 값(전송으로 항목이 사라져도 끌 때 원복하기 위해 유지). */
  readonly #originals = new Map<StyledElement, Map<string, PrevInline>>();
  /** 처음 손대기 전 `style` 속성이 있었는지. */
  readonly #hadStyleAttribute = new Map<StyledElement, boolean>();

  #restoreOptions(el: StyledElement): RestoreOptions {
    return { removeEmptyStyleAttribute: this.#hadStyleAttribute.get(el) === false };
  }

  /**
   * 적용한다. `original`은 이 요소의 원래 값으로, 이 항목에서 요소를 처음 건드릴 때만 쓴다.
   * 편집값이 그 요소의 원래 값과 같으면 그 요소만 원복한다(D-2).
   * 반환값: key에 원래 값과 다른 요소가 남아 있는지(false면 호출 측이 항목을 지운다).
   */
  apply(key: string, el: StyledElement, property: string, value: string, original: string): boolean {
    if (!this.#hadStyleAttribute.has(el)) this.#hadStyleAttribute.set(el, el.hasAttribute('style'));
    const prev = applyStyle(el, property, value);

    let originals = this.#originals.get(el);
    if (!originals) this.#originals.set(el, (originals = new Map()));
    if (!originals.has(property)) originals.set(property, prev);

    let record = this.#byKey.get(key);
    if (!record) this.#byKey.set(key, (record = { property, elements: new Map() }));
    let state = record.elements.get(el);
    if (!state) record.elements.set(el, (state = { prev, original: original.trim() }));
    if (value.trim() === state.original) {
      restoreStyle(el, property, state.prev, this.#restoreOptions(el));
      record.elements.delete(el);
    }
    if (record.elements.size === 0) {
      this.#byKey.delete(key);
      return false;
    }
    return true;
  }

  /** 변경 항목의 각 요소를 자기 편집 전 인라인 값으로 되돌린다(FR-8). 추적 중이 아니면(복원된 항목 등) 아무것도 하지 않는다. */
  revert(key: string): void {
    const record = this.#byKey.get(key);
    if (!record) return;
    this.#byKey.delete(key);
    for (const [el, state] of record.elements) restoreStyle(el, record.property, state.prev, this.#restoreOptions(el));
  }

  /**
   * 전송 성공(FR-9): 보낸 항목의 요소 추적을 끝낸다. 페이지 표시(인라인 값)는 보낸 값 그대로 두고,
   * 끌 때 원복(restoreAll)용 최초 값은 유지한다. 추적 중이 아니면 아무것도 하지 않는다.
   */
  forget(key: string): void {
    this.#byKey.delete(key);
  }

  /**
   * 전송 성공(FR-1): 보낸 항목의 요소 추적을 전송 기록으로 옮긴다. 페이지 표시는 보낸 값 그대로 두고,
   * 반영 확인 때 전송 이전 인라인 값으로 원복한다. 우리가 인라인 적용한 적 없는 key는 무시한다.
   * 같은 key를 다시 보내면 요소별 이전값은 먼저 보관된 값을 유지하고 보낸 값만 갱신한다(D-S3).
   */
  markSent(key: string, after: string, info: SentInfo): void {
    const record = this.#byKey.get(key);
    if (!record) return;
    this.#byKey.delete(key);
    const existing = this.#sent.get(key);
    if (existing) {
      for (const [el, state] of record.elements) if (!existing.elements.has(el)) existing.elements.set(el, state.prev);
      existing.after = after;
      existing.info = info;
      return;
    }
    const elements = new Map<StyledElement, PrevInline>();
    for (const [el, state] of record.elements) elements.set(el, state.prev);
    this.#sent.set(key, { property: record.property, after, info, elements });
  }

  /** 반영 확인할 전송 항목 수(FR-2 활성 조건). */
  get sentCount(): number {
    return this.#sent.size;
  }

  /**
   * 반영 확인(FR-3·FR-4): 전송한 요소를 전송 이전 인라인 값으로 원복하고 computed를 보낸 값과 비교한다.
   * 미전송 상태로 다시 편집 중인 요소는 해제하지 않고 그 record의 이전값만 전송 이전 값으로 바꾼다(D-S2).
   * 처리한 기록은 먼저 비운다(1회성, FR-6). 미전송 편집 항목(#byKey)은 그대로 둔다.
   */
  releaseSent(read: ReadComputed): VerifyItem[] {
    const sent = [...this.#sent];
    this.#sent.clear();
    return sent.map(([key, record]) => {
      const elements = [...record.elements].map(([el, prev]) => {
        if (!el.isConnected) return { actual: '', expected: '', status: 'unverifiable', reason: 'detached' } as const;
        const pending = this.#byKey.get(key)?.elements.get(el);
        if (pending) {
          // 미전송 편집값은 유지하고, 이후 되돌리면 소스 값(전송 이전 값)으로 가게 한다.
          pending.prev = prev;
          return { actual: '', expected: '', status: 'unverifiable', reason: 'pending-edit' } as const;
        }
        return measureReleased(el, record.property, record.after, prev, this.#restoreOptions(el), read);
      });
      return {
        key,
        property: record.property,
        after: record.after,
        info: record.info,
        status: aggregateStatus(elements),
        elements,
      };
    });
  }

  /**
   * 문서에서 분리된 요소를 항목 단위 원복 대상에서 빼고, 요소를 잃은 key를 돌려준다(E-6·HMR).
   * 요소가 하나도 남지 않은 항목은 지운다. 끌 때 원복(restoreAll)용 최초 값은 다시 붙는 경우를 위해 남긴다.
   */
  pruneDetached(): Set<string> {
    const keys = new Set<string>();
    for (const [key, record] of this.#byKey) {
      for (const el of record.elements.keys()) {
        if (el.isConnected) continue;
        record.elements.delete(el);
        keys.add(key);
      }
      if (record.elements.size === 0) this.#byKey.delete(key);
    }
    return keys;
  }

  /** 처음 손대기 전 상태로 모두 되돌린다(NFR-3). */
  restoreAll(): void {
    for (const [el, originals] of this.#originals) {
      const options = this.#restoreOptions(el);
      for (const [property, prev] of originals) restoreStyle(el, property, prev, options);
    }
    this.#byKey.clear();
    this.#sent.clear();
    this.#originals.clear();
    this.#hadStyleAttribute.clear();
  }
}
