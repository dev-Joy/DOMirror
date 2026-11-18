import type { StyleChangeInput } from '@domirror/shared';
import { applyStyle, restoreStyle, type PrevInline, type RestoreOptions, type StyledElement } from './applier.js';

// 반영 확인(FR-3·FR-4): 전송한 인라인을 해제한 뒤 computed를 보낸 값과 비교한다.
// DOM에 의존하지 않는다: computed 읽기는 주입 함수로 받고, 대상 요소는 인라인 style만 쓴다(NFR-1).

/** computed 읽기(호출 측이 `getComputedStyle`을 주입한다). */
export type ReadComputed = (el: StyledElement, property: string) => string;
export type VerifyStatus = 'match' | 'mismatch' | 'unverifiable';
/** 확인 불가 사유: 요소 분리(E-5)·빈 값(E-6)·미전송 재편집(D-S2). */
export type VerifyReason = 'detached' | 'empty' | 'pending-edit';

/** 전송 기록의 표시용 정보(위치 요약·소스). */
export interface SentInfo {
  selectorHint: string;
  source: StyleChangeInput['source'];
}

/** 요소 1개의 판정. `actual`은 해제 후 값, `expected`는 보낸 값을 같은 요소에 잠시 적용해 읽은 값이다(D-S1). */
export interface ElementVerify {
  actual: string;
  expected: string;
  status: VerifyStatus;
  reason?: VerifyReason;
}

/** 변경 항목(key) 1건의 판정. 요소 판정을 FR-5 규칙으로 합친다. */
export interface VerifyItem {
  key: string;
  property: string;
  after: string;
  info: SentInfo;
  status: VerifyStatus;
  elements: ElementVerify[];
}

/** transition shorthand와 longhand. 측정 중에는 shorthand로 덮어쓰고, 끝나면 있던 값만 되돌린다(R-2). */
const TRANSITION_LONGHANDS = ['transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay'] as const;
const TRANSITION_PROPERTY = 'transition';

/**
 * `fn` 실행 동안 transition을 끈다(D-S4). 해제 직후 읽으면 transition 시작값(=보낸 값)이 읽혀 거짓 일치가 날 수 있다.
 * shorthand가 longhand를 덮어써 longhand 인라인이 사라지지 않도록 5개 슬롯을 모두 저장하고, 끝나면 있던 값만 복원한다.
 */
function withTransitionDisabled<T>(el: StyledElement, fn: () => T): T {
  const slots = [TRANSITION_PROPERTY, ...TRANSITION_LONGHANDS].map((property) => ({
    property,
    prev: { value: el.style.getPropertyValue(property), priority: el.style.getPropertyPriority(property) },
  }));
  el.style.setProperty(TRANSITION_PROPERTY, 'none', 'important');
  try {
    return fn();
  } finally {
    el.style.removeProperty(TRANSITION_PROPERTY);
    for (const { property, prev } of slots) {
      if (property !== TRANSITION_PROPERTY && prev.value) el.style.setProperty(property, prev.value, prev.priority);
    }
    // shorthand가 있던 요소는 그것이 longhand를 덮던 상태이므로 마지막에 되돌린다.
    const shorthand = slots[0].prev;
    if (shorthand.value) el.style.setProperty(TRANSITION_PROPERTY, shorthand.value, shorthand.priority);
  }
}

/**
 * 전송한 요소 1개를 해제하고 같은 요소에서 기대값을 읽어 비교한다(FR-3·FR-4). `await` 없이 한 동기 구간에서 끝낸다(NFR-3).
 * 1) 보낸 값이 빈 문자열이면 해제만 하고 `unverifiable('empty')`
 * 2) transition을 끈 뒤 `prev`로 해제 → `actual`
 * 3) 같은 요소에 보낸 값을 잠시 `!important`로 적용 → `expected` → 즉시 해제 상태로 복귀(D-S1)
 * 4) `actual`·`expected`가 비었으면 `empty`, 같으면 `match`, 아니면 `mismatch`
 * 5) transition을 원복하고, 요청 시 빈 `style` 속성을 지운다.
 */
export function measureReleased(
  el: StyledElement,
  property: string,
  after: string,
  prev: PrevInline,
  options: RestoreOptions,
  read: ReadComputed,
): ElementVerify {
  if (after === '') {
    restoreStyle(el, property, prev, options);
    return { actual: '', expected: '', status: 'unverifiable', reason: 'empty' };
  }
  // 측정 중간에는 style 속성을 지우지 않는다(속성 제거는 맨 끝에서 한 번).
  const restore = (): void => restoreStyle(el, property, prev, { ...options, removeEmptyStyleAttribute: false });
  try {
    return withTransitionDisabled(el, () => {
      restore();
      const actual = read(el, property).trim();
      applyStyle(el, property, after);
      let expected: string;
      try {
        expected = read(el, property).trim();
      } finally {
        restore();
      }
      if (actual === '' || expected === '') return { actual, expected, status: 'unverifiable', reason: 'empty' };
      return { actual, expected, status: actual === expected ? 'match' : 'mismatch' };
    });
  } finally {
    if (options.removeEmptyStyleAttribute && el.style.length === 0 && el.hasAttribute('style')) el.removeAttribute('style');
  }
}

/** 요소 판정 합산(FR-5): 불일치가 하나라도 있으면 불일치, 아니면 확인 불가가 있을 때 확인 불가, 나머지는 일치. */
export function aggregateStatus(elements: readonly ElementVerify[]): VerifyStatus {
  if (elements.some((e) => e.status === 'mismatch')) return 'mismatch';
  if (elements.some((e) => e.status === 'unverifiable')) return 'unverifiable';
  return 'match';
}

/** 상태별 건수(상태 줄 요약, FR-5). */
export function summarize(items: readonly { status: VerifyStatus }[]): { match: number; mismatch: number; unverifiable: number } {
  const count = { match: 0, mismatch: 0, unverifiable: 0 };
  for (const item of items) count[item.status] += 1;
  return count;
}
