// 요소 선택: 캡처 단계에서 페이지 클릭을 가로채 선택으로 바꾸고, hover 중인 요소에 윤곽선을 그린다.
// 윤곽선은 패널 Shadow DOM 안에 그려 대상 페이지 요소에는 아무 속성도 쓰지 않는다(NFR-3).
// 윤곽선 위(공간이 없으면 아래)에는 컴포넌트 이름 라벨을 붙인다(FR-8).

import { locateComponent } from './source-locator.js';

export type BlockedReason = 'shadow-dom' | 'iframe';

export interface PickerOptions {
  /** 윤곽선을 그릴 위치(패널의 Shadow root). */
  overlayRoot: ShadowRoot;
  /** 자체 UI(패널 호스트)에서 발생한 이벤트면 true — 가로채지 않는다. */
  isOwn(target: EventTarget | null): boolean;
  /** Shadow DOM·iframe 내부 요소를 클릭했을 때 호출된다(E-7). */
  onBlocked(reason: BlockedReason): void;
  /** Alt+클릭을 일반 선택 대신 처리하려면 true를 돌려준다(간격 보기 기준 요소 고정, FR-11). */
  onAltPick?(el: Element): boolean;
}

export interface Picker {
  start(): void;
  stop(): void;
}

export const PICKER_CSS = `
.outline {
  position: fixed;
  box-sizing: border-box;
  border: 2px solid #0969da;
  background: rgb(9 105 218 / 0.08);
  pointer-events: none;
  z-index: 2147483646;
}
.outline[hidden] { display: none; }
.outline.blocked {
  border: 2px dashed #cf222e;
  background: rgb(207 34 46 / 0.08);
}
.pick-label {
  position: fixed;
  padding: 1px 6px;
  border-radius: 3px;
  background: #57606a;
  color: #fff;
  font: 11px/1.4 system-ui, -apple-system, sans-serif;
  white-space: nowrap;
  pointer-events: none;
  z-index: 2147483647;
}
.pick-label.ds { background: #1a7f37; }
.pick-label[hidden] { display: none; }
`;

/** 페이지 동작(링크 이동·버튼 핸들러·포커스)을 막기 위해 함께 가로채는 이벤트. 선택은 click에서만 한다. */
const SUPPRESSED_EVENTS = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'dblclick', 'auxclick'] as const;

/** 프레임 요소(iframe·frame) 태그면 'iframe', 아니면 null. 내부 문서는 콘텐츠 스크립트가 닿지 않아 선택할 수 없다. */
export function frameBlockedReason(tagName: string | null | undefined): BlockedReason | null {
  const tag = tagName?.toUpperCase();
  return tag === 'IFRAME' || tag === 'FRAME' ? 'iframe' : null;
}

function blockedReason(event: Event, target: Element): BlockedReason | null {
  // Shadow DOM 내부 노드는 문서 수준에서 호스트로 재지정되므로 실제 최초 대상과 달라진다.
  if (event.composedPath()[0] !== target) return 'shadow-dom';
  return frameBlockedReason(target.tagName);
}

export function createPicker(onPick: (el: Element) => void, options: PickerOptions): Picker {
  const { overlayRoot, isOwn, onBlocked, onAltPick } = options;
  let outline: HTMLDivElement | null = null;
  let label: HTMLDivElement | null = null;
  let hovered: Element | null = null;
  let blurTimer: ReturnType<typeof setTimeout> | undefined;

  /** 윤곽선 위(공간이 없으면 아래)에 컴포넌트 이름 라벨을 붙인다. 정보가 없으면 숨긴다(E-9). */
  const drawLabel = (el: Element, rect: DOMRect): void => {
    if (!label) return;
    const component = locateComponent(el);
    if (!component) {
      label.hidden = true;
      return;
    }
    label.textContent = component.designSystem ? `${component.name} · DS` : component.name;
    label.classList.toggle('ds', component.designSystem);
    label.hidden = false;
    const h = label.offsetHeight || 17;
    label.style.left = `${Math.max(0, rect.left)}px`;
    label.style.top = rect.top >= h + 4 ? `${rect.top - h - 2}px` : `${rect.top + rect.height + 2}px`;
  };

  const draw = (): void => {
    if (!outline) return;
    if (!hovered || !hovered.isConnected) {
      outline.hidden = true;
      if (label) label.hidden = true;
      return;
    }
    const rect = hovered.getBoundingClientRect();
    outline.style.left = `${rect.left}px`;
    outline.style.top = `${rect.top}px`;
    outline.style.width = `${rect.width}px`;
    outline.style.height = `${rect.height}px`;
    // 프레임 요소는 선택할 수 없으므로 다른 윤곽선으로 구분한다.
    outline.classList.toggle('blocked', frameBlockedReason(hovered.tagName) !== null);
    outline.hidden = false;
    drawLabel(hovered, rect);
  };

  const onPointerMove = (event: PointerEvent): void => {
    const target = event.target instanceof Element && !isOwn(event.target) ? event.target : null;
    if (target === hovered) return;
    hovered = target;
    draw();
  };

  const onPointerOut = (event: PointerEvent): void => {
    // 창 밖으로 나가면 윤곽선을 숨긴다.
    if (event.relatedTarget === null) {
      hovered = null;
      draw();
    }
  };

  const onScroll = (): void => draw();

  const suppress = (event: Event): void => {
    if (isOwn(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const onClick = (event: MouseEvent): void => {
    if (isOwn(event.target)) return;
    suppress(event);
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    if (event.altKey && onAltPick?.(event.target)) return;
    const reason = blockedReason(event, event.target);
    if (reason) onBlocked(reason);
    else onPick(event.target);
  };

  // iframe 내부 클릭은 최상위 문서로 오지 않는다. 대신 포커스가 프레임으로 옮겨 가며 window가 blur되므로,
  // 다음 틱에 activeElement가 프레임 요소인지 보고 안내한다(E-7).
  const onWindowBlur = (): void => {
    clearTimeout(blurTimer);
    blurTimer = setTimeout(() => {
      blurTimer = undefined;
      const active = document.activeElement;
      const reason = frameBlockedReason(active?.tagName);
      if (!reason) return;
      // 포커스를 최상위 문서로 되돌려야 같은 프레임을 다시 클릭할 때도 blur가 발생한다.
      if (active instanceof HTMLElement) active.blur();
      onBlocked(reason);
    }, 0);
  };

  return {
    start() {
      if (outline) return;
      outline = document.createElement('div');
      outline.className = 'outline';
      outline.hidden = true;
      overlayRoot.append(outline);
      label = document.createElement('div');
      label.className = 'pick-label';
      label.hidden = true;
      overlayRoot.append(label);
      window.addEventListener('pointermove', onPointerMove, true);
      window.addEventListener('pointerout', onPointerOut, true);
      window.addEventListener('scroll', onScroll, { capture: true, passive: true });
      window.addEventListener('resize', onScroll, { passive: true });
      window.addEventListener('click', onClick, true);
      window.addEventListener('blur', onWindowBlur);
      for (const type of SUPPRESSED_EVENTS) window.addEventListener(type, suppress, true);
    },
    stop() {
      if (!outline) return;
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerout', onPointerOut, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('blur', onWindowBlur);
      clearTimeout(blurTimer);
      blurTimer = undefined;
      for (const type of SUPPRESSED_EVENTS) window.removeEventListener(type, suppress, true);
      outline.remove();
      outline = null;
      label?.remove();
      label = null;
      hovered = null;
    },
  };
}
