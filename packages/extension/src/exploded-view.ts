import {
  buildDomPath,
  clampCamera,
  DEFAULT_CAMERA,
  DRAG_THRESHOLD_PX,
  resolveDomPath,
  sameDomPath,
  type CameraState,
  type LayerNode,
  type LayerSnapshot,
} from './layer-model.js';
import { frameBlockedReason } from './picker.js';

export const EXPLODED_VIEW_CSS = `
.ev-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  background: rgb(13 17 23 / 0.9);
  color: #e6edf3;
  font: 12px/1.4 system-ui, -apple-system, sans-serif;
  user-select: none;
}
.ev-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #161b22;
  border-bottom: 1px solid #30363d;
}
.ev-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #f0f6fc;
}
.ev-badge {
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: #1f6feb;
  color: #ffffff;
}
.ev-badge[data-mode='dom-fallback'] {
  background: #9e6a03;
}
.ev-meta {
  color: #8b949e;
  font-size: 11px;
}
.ev-warn {
  padding: 2px 7px;
  border-radius: 4px;
  background: rgb(210 153 34 / 0.2);
  border: 1px solid rgb(210 153 34 / 0.5);
  color: #e3b341;
  font-size: 11px;
}
.ev-warn[hidden] { display: none; }
.ev-note {
  color: #8b949e;
  font-size: 11px;
}
.ev-controls {
  margin-left: auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.ev-slider {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #c9d1d9;
  font-size: 11px;
}
.ev-slider input[type='range'] {
  width: 92px;
  accent-color: #58a6ff;
  cursor: pointer;
}
.ev-btn {
  padding: 3px 8px;
  border: 1px solid #30363d;
  border-radius: 5px;
  background: #21262d;
  color: #e6edf3;
  font: inherit;
  cursor: pointer;
}
.ev-btn:hover {
  background: #30363d;
  border-color: #8b949e;
}
.ev-btn-close {
  border-color: #f85149;
  color: #ff7b72;
}
.ev-zoom-val {
  min-width: 36px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: #c9d1d9;
}
.ev-viewport {
  flex: 1;
  position: relative;
  overflow: hidden;
  perspective: 1400px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
}
.ev-viewport.is-dragging {
  cursor: grabbing;
}
.ev-stage {
  position: relative;
  transform-style: preserve-3d;
  transform-origin: center center;
}
.ev-layer {
  position: absolute;
  box-sizing: border-box;
  border: 1px solid var(--ev-border, rgb(88 166 255 / 0.85));
  background: var(--ev-bg, rgb(88 166 255 / 0.1));
  border-radius: 3px;
  cursor: pointer;
  transition: background-color 80ms ease, border-color 80ms ease, box-shadow 80ms ease;
}
.ev-layer:hover {
  border-color: #ffffff;
  background: var(--ev-bg-hover, rgb(88 166 255 / 0.28));
  box-shadow: 0 0 0 1px rgb(255 255 255 / 0.55);
}
.ev-layer.is-selected {
  border: 2px solid #3fb950;
  background: rgb(63 185 80 / 0.22);
  box-shadow: 0 0 0 2px rgb(63 185 80 / 0.45);
}
.ev-layer-label {
  position: absolute;
  top: 0;
  left: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 1px 5px;
  border-radius: 2px 0 3px 0;
  background: var(--ev-label-bg, rgb(13 17 23 / 0.82));
  color: #f0f6fc;
  font: 10px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
  pointer-events: none;
}
.ev-empty {
  position: absolute;
  padding: 12px 16px;
  border: 1px solid #30363d;
  border-radius: 8px;
  background: rgb(22 27 34 / 0.92);
  color: #c9d1d9;
  font-size: 13px;
}
.ev-tooltip {
  position: fixed;
  z-index: 2147483647;
  pointer-events: none;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgb(22 27 34 / 0.96);
  border: 1px solid #30363d;
  color: #e6edf3;
  font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.45);
  max-width: 340px;
  white-space: pre-line;
  word-break: break-all;
}
.ev-tooltip[hidden] { display: none; }
`;

export interface ExplodedViewOptions {
  readonly overlayRoot: ShadowRoot;
  readonly collectLayers: () => Promise<LayerSnapshot>;
  readonly getSelectedElement: () => Element | null;
  readonly onPickElement: (el: Element) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly onBlockedOrMissing?: (message: string) => void;
}

export interface ExplodedView {
  open(): Promise<void>;
  close(): void;
  isOpen(): boolean;
  dispose(): void;
}

interface CardEntry {
  readonly node: LayerNode;
  readonly el: HTMLDivElement;
}

function depthPalette(depth: number, isReact: boolean): { border: string; bg: string; hover: string; labelBg: string } {
  const hue = ((isReact ? 205 : 36) + depth * 29) % 360;
  return {
    border: `hsl(${hue} 85% 64% / 0.85)`,
    bg: `hsl(${hue} 78% 54% / 0.1)`,
    hover: `hsl(${hue} 85% 58% / 0.28)`,
    labelBg: `hsl(${hue} 45% 18% / 0.88)`,
  };
}

function formatTooltip(layer: LayerNode): string {
  const w = Math.round(layer.rect.width);
  const h = Math.round(layer.rect.height);
  const lines = [layer.name, `depth ${layer.depth} · ${w}×${h}px`];
  if (layer.file) lines.push(layer.file);
  return lines.join('\n');
}

export function createExplodedView(options: ExplodedViewOptions): ExplodedView {
  let camera: CameraState = { ...DEFAULT_CAMERA };
  let opened = false;
  let disposed = false;
  let loadSeq = 0;

  let backdrop: HTMLDivElement | null = null;
  let viewportEl: HTMLDivElement | null = null;
  let stageEl: HTMLDivElement | null = null;
  let modeBadgeEl: HTMLSpanElement | null = null;
  let countMetaEl: HTMLSpanElement | null = null;
  let warnBadgeEl: HTMLSpanElement | null = null;
  let spacingInputEl: HTMLInputElement | null = null;
  let spacingValEl: HTMLSpanElement | null = null;
  let zoomValEl: HTMLSpanElement | null = null;
  let tooltipEl: HTMLDivElement | null = null;
  let cards: CardEntry[] = [];

  let dragging = false;
  let dragMoved = false;
  let suppressClick = false;
  let startX = 0;
  let startY = 0;
  let startRotateX = DEFAULT_CAMERA.rotateX;
  let startRotateY = DEFAULT_CAMERA.rotateY;

  const applyCameraTransform = (): void => {
    if (!stageEl) return;
    stageEl.style.transform = `scale(${camera.scale}) rotateX(${camera.rotateX}deg) rotateY(${camera.rotateY}deg)`;
    if (zoomValEl) zoomValEl.textContent = `${Math.round(camera.scale * 100)}%`;
  };

  const applyLayerSpacing = (): void => {
    if (spacingInputEl) spacingInputEl.value = String(camera.spacing);
    if (spacingValEl) spacingValEl.textContent = `${Math.round(camera.spacing)}px`;
    for (const entry of cards) {
      entry.el.style.transform = `translateZ(${entry.node.depth * camera.spacing}px)`;
    }
  };

  const hideTooltip = (): void => {
    if (tooltipEl) tooltipEl.hidden = true;
  };

  const showTooltip = (layer: LayerNode, clientX: number, clientY: number): void => {
    if (!tooltipEl) return;
    tooltipEl.textContent = formatTooltip(layer);
    tooltipEl.hidden = false;
    const x = Math.min(window.innerWidth - 220, Math.max(8, clientX + 14));
    const y = Math.min(window.innerHeight - 80, Math.max(8, clientY + 14));
    tooltipEl.style.left = `${x}px`;
    tooltipEl.style.top = `${y}px`;
  };

  const handleCardPick = (layer: LayerNode): void => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const target = resolveDomPath(document.documentElement, layer.domPath);
    if (!(target instanceof Element) || !target.isConnected) {
      options.onBlockedOrMissing?.('선택한 레이어의 DOM 요소를 찾을 수 없습니다. Refresh를 눌러 다시 스캔하세요.');
      return;
    }
    if (target.tagName.toUpperCase() === 'DOMIRROR-PANEL') {
      options.onBlockedOrMissing?.('DOMirror 패널 자체는 선택할 수 없습니다.');
      return;
    }
    if (target === document.documentElement || target === document.body || frameBlockedReason(target.tagName) !== null) {
      options.onBlockedOrMissing?.('문서 루트(html/body) 또는 iframe 요소는 선택할 수 없습니다.');
      return;
    }
    options.onPickElement(target);
  };

  const renderSnapshot = (snapshot: LayerSnapshot): void => {
    if (!stageEl) return;
    hideTooltip();

    if (modeBadgeEl) {
      modeBadgeEl.dataset.mode = snapshot.mode;
      modeBadgeEl.textContent = snapshot.mode === 'react-fiber' ? 'React Fiber' : 'DOM Fallback';
    }
    if (countMetaEl) {
      countMetaEl.textContent = `${snapshot.layers.length}개 레이어`;
    }
    if (warnBadgeEl) {
      warnBadgeEl.hidden = !snapshot.truncated;
    }

    const stageW = snapshot.viewport.width > 0 ? snapshot.viewport.width : window.innerWidth;
    const stageH = snapshot.viewport.height > 0 ? snapshot.viewport.height : window.innerHeight;
    stageEl.style.width = `${stageW}px`;
    stageEl.style.height = `${stageH}px`;

    const selectedEl = options.getSelectedElement();
    const selectedPath = selectedEl ? buildDomPath(selectedEl, document.documentElement) : null;

    const nextCards: CardEntry[] = [];
    const fragment = document.createDocumentFragment();

    if (snapshot.layers.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ev-empty';
      empty.textContent = '표시할 가시 레이어가 없습니다. Refresh를 눌러 다시 스캔하세요.';
      fragment.append(empty);
    } else {
      for (const layer of snapshot.layers) {
        const card = document.createElement('div');
        card.className = 'ev-layer';
        card.dataset.layerId = layer.id;
        card.style.left = `${layer.rect.x}px`;
        card.style.top = `${layer.rect.y}px`;
        card.style.width = `${layer.rect.width}px`;
        card.style.height = `${layer.rect.height}px`;
        card.style.transform = `translateZ(${layer.depth * camera.spacing}px)`;

        const palette = depthPalette(layer.depth, layer.isReact);
        card.style.setProperty('--ev-border', palette.border);
        card.style.setProperty('--ev-bg', palette.bg);
        card.style.setProperty('--ev-bg-hover', palette.hover);
        card.style.setProperty('--ev-label-bg', palette.labelBg);

        if (sameDomPath(layer.domPath, selectedPath)) {
          card.classList.add('is-selected');
        }

        const label = document.createElement('span');
        label.className = 'ev-layer-label';
        label.textContent = layer.name;
        card.append(label);

        card.addEventListener('pointerenter', (e) => showTooltip(layer, e.clientX, e.clientY));
        card.addEventListener('pointermove', (e) => showTooltip(layer, e.clientX, e.clientY));
        card.addEventListener('pointerleave', hideTooltip);
        card.addEventListener('click', (e) => {
          e.stopPropagation();
          handleCardPick(layer);
        });

        nextCards.push({ node: layer, el: card });
        fragment.append(card);
      }
    }

    cards = nextCards;
    stageEl.replaceChildren(fragment);
    applyCameraTransform();
  };

  const onWindowPointerMove = (e: PointerEvent): void => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!dragMoved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      dragMoved = true;
      viewportEl?.classList.add('is-dragging');
      hideTooltip();
    }
    if (!dragMoved) return;
    camera = clampCamera(
      {
        rotateY: startRotateY + dx * 0.35,
        rotateX: startRotateX - dy * 0.35,
      },
      camera,
    );
    applyCameraTransform();
  };

  const onWindowPointerUp = (): void => {
    if (!dragging) return;
    dragging = false;
    suppressClick = dragMoved;
    dragMoved = false;
    viewportEl?.classList.remove('is-dragging');
  };

  const onWindowKeyDown = (e: KeyboardEvent): void => {
    if (!opened) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  const detachWindowListeners = (): void => {
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', onWindowPointerUp);
    window.removeEventListener('pointercancel', onWindowPointerUp);
    window.removeEventListener('keydown', onWindowKeyDown, true);
  };

  const teardownDom = (): void => {
    detachWindowListeners();
    dragging = false;
    dragMoved = false;
    suppressClick = false;
    cards = [];
    backdrop?.remove();
    backdrop = null;
    viewportEl = null;
    stageEl = null;
    modeBadgeEl = null;
    countMetaEl = null;
    warnBadgeEl = null;
    spacingInputEl = null;
    spacingValEl = null;
    zoomValEl = null;
    tooltipEl = null;
  };

  const refresh = async (): Promise<void> => {
    if (!opened || disposed) return;
    const seq = ++loadSeq;
    const snapshot = await options.collectLayers();
    if (seq !== loadSeq || !opened || disposed) return;
    renderSnapshot(snapshot);
  };

  const mountDom = (): void => {
    const root = document.createElement('div');
    root.className = 'ev-backdrop';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', '3D 컴포넌트 레이어 분해도');

    const header = document.createElement('div');
    header.className = 'ev-header';

    const title = document.createElement('span');
    title.className = 'ev-title';
    title.textContent = '3D 레이어';

    const modeBadge = document.createElement('span');
    modeBadge.className = 'ev-badge';
    modeBadge.textContent = '스캔 중…';

    const countMeta = document.createElement('span');
    countMeta.className = 'ev-meta';

    const warnBadge = document.createElement('span');
    warnBadge.className = 'ev-warn';
    warnBadge.hidden = true;
    warnBadge.textContent = '상위 150개 레이어 표시(일부 생략)';

    const scopeNote = document.createElement('span');
    scopeNote.className = 'ev-note';
    scopeNote.textContent = '최상위 문서 기준(iframe·외부 Shadow DOM 제외)';

    const controls = document.createElement('div');
    controls.className = 'ev-controls';

    const sliderLabel = document.createElement('label');
    sliderLabel.className = 'ev-slider';
    sliderLabel.textContent = '간격';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '80';
    slider.step = '1';
    slider.value = String(camera.spacing);
    const spacingVal = document.createElement('span');
    spacingVal.textContent = `${Math.round(camera.spacing)}px`;
    sliderLabel.append(slider, spacingVal);
    slider.addEventListener('input', () => {
      camera = clampCamera({ spacing: Number(slider.value) }, camera);
      applyLayerSpacing();
    });

    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.type = 'button';
    zoomOutBtn.className = 'ev-btn';
    zoomOutBtn.setAttribute('aria-label', '축소');
    zoomOutBtn.textContent = '−';
    zoomOutBtn.addEventListener('click', () => {
      camera = clampCamera({ scale: camera.scale - 0.15 }, camera);
      applyCameraTransform();
    });

    const zoomVal = document.createElement('span');
    zoomVal.className = 'ev-zoom-val';
    zoomVal.textContent = `${Math.round(camera.scale * 100)}%`;

    const zoomInBtn = document.createElement('button');
    zoomInBtn.type = 'button';
    zoomInBtn.className = 'ev-btn';
    zoomInBtn.setAttribute('aria-label', '확대');
    zoomInBtn.textContent = '+';
    zoomInBtn.addEventListener('click', () => {
      camera = clampCamera({ scale: camera.scale + 0.15 }, camera);
      applyCameraTransform();
    });

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'ev-btn';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => {
      camera = { ...DEFAULT_CAMERA };
      applyCameraTransform();
      applyLayerSpacing();
    });

    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'ev-btn';
    refreshBtn.textContent = 'Refresh';
    refreshBtn.addEventListener('click', () => {
      void refresh();
    });

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ev-btn ev-btn-close';
    closeBtn.setAttribute('aria-label', '닫기');
    closeBtn.textContent = '닫기';
    closeBtn.addEventListener('click', () => close());

    controls.append(sliderLabel, zoomOutBtn, zoomVal, zoomInBtn, resetBtn, refreshBtn, closeBtn);
    header.append(title, modeBadge, countMeta, warnBadge, scopeNote, controls);

    const viewport = document.createElement('div');
    viewport.className = 'ev-viewport';

    const stage = document.createElement('div');
    stage.className = 'ev-stage';
    viewport.append(stage);

    viewport.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      dragging = true;
      dragMoved = false;
      suppressClick = false;
      startX = e.clientX;
      startY = e.clientY;
      startRotateX = camera.rotateX;
      startRotateY = camera.rotateY;
    });

    viewport.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        camera = clampCamera({ scale: camera.scale + delta }, camera);
        applyCameraTransform();
      },
      { passive: false },
    );

    const tooltip = document.createElement('div');
    tooltip.className = 'ev-tooltip';
    tooltip.hidden = true;

    root.append(header, viewport, tooltip);
    options.overlayRoot.append(root);

    backdrop = root;
    viewportEl = viewport;
    stageEl = stage;
    modeBadgeEl = modeBadge;
    countMetaEl = countMeta;
    warnBadgeEl = warnBadge;
    spacingInputEl = slider;
    spacingValEl = spacingVal;
    zoomValEl = zoomVal;
    tooltipEl = tooltip;

    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerUp);
    window.addEventListener('keydown', onWindowKeyDown, true);
    applyCameraTransform();
  };

  function close(): void {
    if (!opened || disposed) return;
    opened = false;
    loadSeq += 1;
    teardownDom();
    options.onOpenChange(false);
  }

  return {
    async open(): Promise<void> {
      if (disposed) return;
      if (!opened) {
        opened = true;
        mountDom();
        options.onOpenChange(true);
      }
      await refresh();
    },
    close,
    isOpen(): boolean {
      return opened;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      opened = false;
      loadSeq += 1;
      teardownDom();
    },
  };
}
