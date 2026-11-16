// 간격 보기(FR-11): 켜면 hover 요소의 크기·padding 영역·gap을, 기준 요소를 고정하면 hover 요소까지의 거리를 그린다.
// 모든 표시는 패널 Shadow root 안에 그리고 대상 페이지 요소는 읽기만 한다(NFR-3).
// 기준 요소 고정/해제는 Alt+클릭이며, 클릭 가로채기는 picker가 맡고 `handleAltPick`으로 넘겨받는다.

import { distanceBetween, distanceLines, formatPx, paddingRects, parseBorder, parseGap, parseSpacing, type Box, type Segment } from './measure.js';
import { selectorHint } from './source-locator.js';

export const MEASURE_CSS = `
.measure { margin: 10px 0 0; padding-top: 8px; border-top: 1px solid #d0d4da; }
.measure label { display: flex; gap: 6px; align-items: center; font-weight: 600; cursor: pointer; }
.measure p { margin: 4px 0 0; word-break: break-all; }
.measure .muted { color: #59636e; font-size: 12px; }
.measure .readout { font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-line; }
.m-layer, .m-layer * { pointer-events: none; }
.m-box, .m-pad, .m-anchor, .m-line, .m-label { position: fixed; box-sizing: border-box; z-index: 2147483646; }
.m-box { border: 1px solid #d1242f; }
.m-pad { background: rgb(31 136 61 / 0.25); }
.m-anchor { border: 2px dashed #8250df; }
.m-line { background: #d1242f; }
.m-label {
  padding: 1px 4px;
  border-radius: 3px;
  background: #d1242f;
  color: #ffffff;
  font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: nowrap;
}
.m-label.anchor { background: #8250df; }
.m-label.dist { background: #1f2328; }
`;

export interface MeasureOverlayOptions {
  /** 오버레이를 그릴 위치(패널의 Shadow root). */
  overlayRoot: ShadowRoot;
  /** 켜기/끄기 토글과 수치를 표시할 패널 영역. */
  controls: HTMLElement;
  /** 자체 UI(패널 호스트)에서 발생한 이벤트면 true. */
  isOwn(target: EventTarget | null): boolean;
}

export interface MeasureOverlay {
  /** 간격 보기가 켜져 있으면 Alt+클릭한 요소를 기준 요소로 고정/해제하고 true를 돌려준다. 꺼져 있으면 false. */
  handleAltPick(el: Element): boolean;
  dispose(): void;
}

function toBox(r: DOMRect): Box {
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

function div(className: string, box?: Box): HTMLDivElement {
  const d = document.createElement('div');
  d.className = className;
  if (box) {
    d.style.left = `${box.x}px`;
    d.style.top = `${box.y}px`;
    d.style.width = `${box.width}px`;
    d.style.height = `${box.height}px`;
  }
  return d;
}

/** 상자 위쪽(공간이 없으면 아래쪽)에 붙는 라벨. 화면 왼쪽 밖으로 나가지 않게 한다. */
function label(className: string, text: string, box: Box): HTMLDivElement {
  const d = div(`m-label ${className}`.trim());
  d.textContent = text;
  d.style.left = `${Math.max(0, box.x)}px`;
  d.style.top = box.y >= 20 ? `${box.y - 19}px` : `${box.y + box.height + 2}px`;
  return d;
}

function lineEl(seg: Segment): HTMLDivElement {
  const horizontal = seg.y1 === seg.y2;
  return div('m-line', {
    x: horizontal ? seg.x1 : seg.x1 - 0.5,
    y: horizontal ? seg.y1 - 0.5 : seg.y1,
    width: horizontal ? seg.x2 - seg.x1 : 1,
    height: horizontal ? 1 : seg.y2 - seg.y1,
  });
}

function distLabel(text: string, seg: Segment): HTMLDivElement {
  const d = div('m-label dist');
  d.textContent = text;
  d.style.left = `${Math.max(0, (seg.x1 + seg.x2) / 2 + 4)}px`;
  d.style.top = `${Math.max(0, (seg.y1 + seg.y2) / 2 + 4)}px`;
  return d;
}

function hoverInfo(el: Element, box: Box): { labelText: string; readout: string; nodes: HTMLElement[] } {
  const cs = getComputedStyle(el);
  const padding = parseSpacing(cs);
  const gap = parseGap(cs);
  const nodes: HTMLElement[] = paddingRects(box, parseBorder(cs), padding).map((r) => div('m-pad', r));
  nodes.push(div('m-box', box));
  const size = `${formatPx(box.width)} × ${formatPx(box.height)}`;
  const pad = `padding ${[padding.top, padding.right, padding.bottom, padding.left].map(formatPx).join(' ')}`;
  const hasGap = gap.row > 0 || gap.column > 0;
  const gapText = hasGap ? `gap ${formatPx(gap.row)} ${formatPx(gap.column)}` : '';
  const labelText = [size, gapText].filter(Boolean).join(' · ');
  return { labelText, readout: [size, pad, hasGap ? gapText : 'gap 0px'].join('\n'), nodes };
}

export function createMeasureOverlay(options: MeasureOverlayOptions): MeasureOverlay {
  const { overlayRoot, controls, isOwn } = options;

  const box = document.createElement('div');
  box.className = 'measure';
  const toggleLabel = document.createElement('label');
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggleLabel.append(toggle, '간격 보기');
  const hint = document.createElement('p');
  hint.className = 'muted';
  hint.textContent = '켜면 요소에 마우스를 올려 크기·padding·gap을 봅니다. Alt+클릭으로 기준 요소를 고정/해제합니다.';
  const anchorInfo = document.createElement('p');
  anchorInfo.className = 'muted';
  const readout = document.createElement('p');
  readout.className = 'readout';
  box.append(toggleLabel, hint, anchorInfo, readout);
  controls.replaceChildren(box);

  let layer: HTMLDivElement | null = null;
  let hovered: Element | null = null;
  let anchor: Element | null = null;
  let frame = 0;

  const render = (): void => {
    frame = 0;
    if (!layer) return;
    if (anchor && !anchor.isConnected) anchor = null;
    const nodes: HTMLElement[] = [];
    const lines: string[] = [];
    let anchorBox: Box | null = null;
    if (anchor) {
      anchorBox = toBox(anchor.getBoundingClientRect());
      nodes.push(div('m-anchor', anchorBox), label('anchor', `기준 ${formatPx(anchorBox.width)} × ${formatPx(anchorBox.height)}`, anchorBox));
    }
    if (hovered?.isConnected) {
      const hoverBox = toBox(hovered.getBoundingClientRect());
      const info = hoverInfo(hovered, hoverBox);
      nodes.push(...info.nodes, label('', info.labelText, hoverBox));
      lines.push(info.readout);
      if (anchorBox && hovered !== anchor) {
        const d = distanceBetween(anchorBox, hoverBox);
        const segs = distanceLines(anchorBox, hoverBox);
        if (segs.horizontal) nodes.push(lineEl(segs.horizontal), distLabel(formatPx(d.horizontal), segs.horizontal));
        if (segs.vertical) nodes.push(lineEl(segs.vertical), distLabel(formatPx(d.vertical), segs.vertical));
        lines.push(`기준까지 수평 ${formatPx(d.horizontal)} · 수직 ${formatPx(d.vertical)}`);
      }
    }
    layer.replaceChildren(...nodes);
    anchorInfo.textContent = anchor ? `기준 요소: ${selectorHint(anchor)}` : '기준 요소 없음';
    readout.textContent = lines.join('\n');
  };

  const schedule = (): void => {
    if (!frame) frame = requestAnimationFrame(render);
  };

  const onPointerMove = (event: PointerEvent): void => {
    const target = event.target instanceof Element && !isOwn(event.target) ? event.target : null;
    if (target === hovered) return;
    hovered = target;
    schedule();
  };

  const onPointerOut = (event: PointerEvent): void => {
    if (event.relatedTarget === null) {
      hovered = null;
      schedule();
    }
  };

  const start = (): void => {
    if (layer) return;
    layer = document.createElement('div');
    layer.className = 'm-layer';
    overlayRoot.append(layer);
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerout', onPointerOut, true);
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    render();
  };

  const stop = (): void => {
    if (!layer) return;
    window.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('pointerout', onPointerOut, true);
    window.removeEventListener('scroll', schedule, true);
    window.removeEventListener('resize', schedule);
    cancelAnimationFrame(frame);
    frame = 0;
    layer.remove();
    layer = null;
    hovered = null;
    anchor = null;
    anchorInfo.textContent = '';
    readout.textContent = '';
  };

  const onToggle = (): void => (toggle.checked ? start() : stop());
  toggle.addEventListener('change', onToggle);

  return {
    handleAltPick(el) {
      if (!layer) return false;
      anchor = anchor === el ? null : el;
      schedule();
      return true;
    },
    dispose() {
      stop();
      toggle.removeEventListener('change', onToggle);
      controls.replaceChildren();
    },
  };
}
