import { FIBER_VISIT_LIMIT, type DevtoolsHook } from './devtools-hook.js';
import { currentTreeRoot } from './instance-count.js';
import {
  buildDomPath,
  MAX_LAYERS,
  normalizeLayers,
  type DomPathNode,
  type LayerSnapshot,
  type RawLayerInput,
} from './layer-model.js';
import {
  componentName,
  fiberFromNode,
  normalizeFile,
  parseStackFrames,
  toSourceRef,
  type FiberLike,
} from './react-runtime.js';

/** 사용자 React 컴포넌트 Fiber tag(0 함수, 1 클래스, 11 forwardRef, 14 memo, 15 simpleMemo). */
const COMPONENT_TAGS = new Set([0, 1, 11, 14, 15]);
/** 호스트 DOM 요소 Fiber tag(react-reconciler HostComponent). */
const HOST_COMPONENT = 5;

const EXCLUDED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'META',
  'LINK',
  'TITLE',
  'IFRAME',
  'FRAME',
  'DOMIRROR-PANEL',
]);

/** DevTools hook이 없을 때 `__reactFiber$` 루트를 찾기 위한 DOM BFS 상한. */
const DOM_PROBE_LIMIT = 2_000;
/** 컴포넌트 Fiber의 대표 호스트 DOM 탐색 스텝 상한. */
const HOST_SEARCH_LIMIT = 200;

export interface MeasurableElement extends DomPathNode {
  readonly tagName: string;
  readonly id?: string;
  readonly className?: unknown;
  readonly isConnected?: boolean;
  readonly parentElement: MeasurableElement | null;
  readonly children: ArrayLike<MeasurableElement>;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
}

export interface CollectDocumentLike {
  readonly documentElement: MeasurableElement | null;
  readonly body: MeasurableElement | null;
}

export interface FiberCollectOptions {
  readonly hook?: DevtoolsHook | null;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly maxLayers?: number;
  readonly visitLimit?: number;
  readonly isExcluded?: (el: MeasurableElement) => boolean;
  readonly isVisible?: (el: MeasurableElement) => boolean;
}

export interface DomFallbackOptions {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly maxLayers?: number;
  readonly visitLimit?: number;
  readonly isExcluded?: (el: MeasurableElement) => boolean;
  readonly getStyle?: (el: MeasurableElement) => { readonly display?: string; readonly visibility?: string } | null;
}

function isMeasurableElement(value: unknown): value is MeasurableElement {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as {
    tagName?: unknown;
    getBoundingClientRect?: unknown;
    children?: unknown;
  };
  return (
    typeof candidate.tagName === 'string' &&
    typeof candidate.getBoundingClientRect === 'function' &&
    typeof candidate.children === 'object' &&
    candidate.children !== null
  );
}

function defaultGetStyle(el: MeasurableElement): { readonly display?: string; readonly visibility?: string } | null {
  if (typeof globalThis.getComputedStyle !== 'function' || typeof Element === 'undefined') return null;
  if (!(el instanceof Element)) return null;
  try {
    return globalThis.getComputedStyle(el);
  } catch {
    return null;
  }
}

function defaultIsVisible(el: MeasurableElement): boolean {
  const style = defaultGetStyle(el);
  if (!style) return true;
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function sourceFileOf(fiber: FiberLike): string | undefined {
  const debugSource = (fiber as { _debugSource?: { fileName?: unknown } | null })._debugSource;
  if (debugSource && typeof debugSource === 'object' && typeof debugSource.fileName === 'string') {
    const file = normalizeFile(debugSource.fileName);
    if (file) return file;
  }
  return toSourceRef(parseStackFrames(fiber._debugStack))?.file;
}

function collectRootsFromHook(hook: DevtoolsHook | null | undefined, roots: Set<FiberLike>): void {
  if (!hook || typeof hook !== 'object' || !hook.renderers) return;
  try {
    if (typeof hook.renderers.keys !== 'function' || typeof hook.getFiberRoots !== 'function') return;
    for (const rendererId of hook.renderers.keys()) {
      const fiberRoots = hook.getFiberRoots(rendererId);
      if (!fiberRoots) continue;
      for (const root of fiberRoots) {
        if (root && typeof root.current === 'object' && root.current !== null) {
          roots.add(root.current);
        }
      }
    }
  } catch {
    // 비공개 DevTools hook 예외는 무시하고 DOM 스캔 폴백으로 넘긴다.
  }
}

function collectRootsFromDom(
  body: MeasurableElement | null,
  roots: Set<FiberLike>,
  visitLimit: number,
  isExcluded?: (el: MeasurableElement) => boolean,
): void {
  if (!body) return;
  const queue: MeasurableElement[] = [body];
  let head = 0;
  let probed = 0;

  while (head < queue.length && probed < DOM_PROBE_LIMIT) {
    const el = queue[head];
    head += 1;
    probed += 1;

    if (EXCLUDED_TAGS.has(el.tagName.toUpperCase()) || isExcluded?.(el)) continue;

    const fiber = fiberFromNode(el);
    if (fiber) {
      const root = currentTreeRoot(fiber, visitLimit);
      if (root) roots.add(root);
    }

    for (let i = 0; i < el.children.length; i += 1) {
      if (queue.length >= DOM_PROBE_LIMIT) break;
      const child = el.children[i];
      if (child) queue.push(child);
    }
  }
}

interface HostMatch {
  readonly el: MeasurableElement;
  readonly rect: { left: number; top: number; width: number; height: number };
}

function findRepresentativeHost(
  componentFiber: FiberLike,
  doc: CollectDocumentLike,
  isExcluded: ((el: MeasurableElement) => boolean) | undefined,
  isVisible: (el: MeasurableElement) => boolean,
): HostMatch | null {
  if (!componentFiber.child) return null;

  const stack: FiberLike[] = [componentFiber.child];
  const seen = new Set<FiberLike>();
  let steps = 0;

  while (stack.length > 0 && steps < HOST_SEARCH_LIMIT) {
    const node = stack.pop();
    if (!node || seen.has(node)) continue;
    seen.add(node);
    steps += 1;

    if (node.tag === HOST_COMPONENT && isMeasurableElement(node.stateNode)) {
      const el = node.stateNode;
      if (
        el.isConnected !== false &&
        el !== doc.documentElement &&
        el !== doc.body &&
        !EXCLUDED_TAGS.has(el.tagName.toUpperCase()) &&
        !isExcluded?.(el) &&
        isVisible(el)
      ) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return { el, rect };
        }
      }
    }

    if (node.sibling) stack.push(node.sibling);
    if (node.child) stack.push(node.child);
  }

  return null;
}

/**
 * MAIN world에서 현재 커밋된 React Fiber 트리를 순회해 컴포넌트 레이어 스냅샷을 수집한다.
 * 루트나 가시적 컴포넌트 레이어가 없으면 `null`을 돌려 DOM 폴백으로 전환하게 한다.
 */
export function collectFiberLayers(doc: CollectDocumentLike, options: FiberCollectOptions): LayerSnapshot | null {
  if (!doc.documentElement) return null;

  const visitLimit =
    options.visitLimit !== undefined && Number.isInteger(options.visitLimit) && options.visitLimit > 0
      ? options.visitLimit
      : FIBER_VISIT_LIMIT;
  const maxLayers = options.maxLayers ?? MAX_LAYERS;
  const isVisible = options.isVisible ?? defaultIsVisible;

  const roots = new Set<FiberLike>();
  collectRootsFromHook(options.hook, roots);
  if (roots.size === 0) {
    collectRootsFromDom(doc.body, roots, visitLimit, options.isExcluded);
  }
  if (roots.size === 0) return null;

  const raw: RawLayerInput[] = [];
  const seen = new Set<FiberLike>();
  let visited = 0;
  let hitVisitLimit = false;

  for (const root of roots) {
    if (hitVisitLimit) break;
    const stack: Array<{ fiber: FiberLike; depth: number }> = [{ fiber: root, depth: 0 }];

    while (stack.length > 0) {
      const entry = stack.pop();
      if (!entry) continue;
      const { fiber, depth } = entry;
      if (seen.has(fiber)) continue;
      if (visited >= visitLimit) {
        hitVisitLimit = true;
        break;
      }
      seen.add(fiber);
      visited += 1;

      const isComponent = COMPONENT_TAGS.has(fiber.tag);
      if (isComponent) {
        const host = findRepresentativeHost(fiber, doc, options.isExcluded, isVisible);
        if (host) {
          const domPath = buildDomPath(host.el, doc.documentElement);
          if (domPath && domPath.length > 0) {
            const name = componentName(fiber) || 'Anonymous';
            const file = sourceFileOf(fiber);
            raw.push({
              name,
              depth,
              rect: {
                x: host.rect.left,
                y: host.rect.top,
                width: host.rect.width,
                height: host.rect.height,
              },
              domPath,
              isReact: true,
              ...(file !== undefined ? { file } : {}),
            });
          }
        }
      }

      if (fiber.sibling) stack.push({ fiber: fiber.sibling, depth });
      if (fiber.child) stack.push({ fiber: fiber.child, depth: isComponent ? depth + 1 : depth });
    }
  }

  const { layers, truncated } = normalizeLayers(raw, options.viewport, maxLayers, hitVisitLimit);
  if (layers.length === 0) return null;

  return {
    mode: 'react-fiber',
    viewport: { width: options.viewport.width, height: options.viewport.height },
    layers,
    truncated,
  };
}

function domLayerLabel(el: MeasurableElement): string {
  const tag = el.tagName.toLowerCase();
  const id = typeof el.id === 'string' && el.id.trim() !== '' ? `#${el.id.trim().slice(0, 24)}` : '';
  let classes = '';
  if (typeof el.className === 'string' && el.className.trim() !== '') {
    const tokens = el.className
      .trim()
      .split(/\s+/)
      .filter((token) => token !== '')
      .slice(0, 2);
    if (tokens.length > 0) classes = `.${tokens.join('.')}`;
  }
  return `${tag}${id}${classes}`;
}

/**
 * React Fiber를 찾지 못했을 때 ISOLATED world에서 최상위 문서 `body` 하위의 가시적 DOM 계층을 수집한다.
 */
export function collectDomFallbackLayers(doc: CollectDocumentLike, options: DomFallbackOptions): LayerSnapshot {
  const viewport = { width: options.viewport.width, height: options.viewport.height };
  if (!doc.documentElement || !doc.body) {
    return { mode: 'dom-fallback', viewport, layers: [], truncated: false };
  }

  const visitLimit =
    options.visitLimit !== undefined && Number.isInteger(options.visitLimit) && options.visitLimit > 0
      ? options.visitLimit
      : FIBER_VISIT_LIMIT;
  const maxLayers = options.maxLayers ?? MAX_LAYERS;
  const getStyle = options.getStyle ?? defaultGetStyle;

  const stack: Array<{ el: MeasurableElement; depth: number }> = [];
  for (let i = doc.body.children.length - 1; i >= 0; i -= 1) {
    const child = doc.body.children[i];
    if (child) stack.push({ el: child, depth: 0 });
  }

  const raw: RawLayerInput[] = [];
  let visited = 0;
  let hitVisitLimit = false;

  while (stack.length > 0) {
    if (visited >= visitLimit) {
      hitVisitLimit = true;
      break;
    }
    const entry = stack.pop();
    if (!entry) continue;
    const { el, depth } = entry;
    visited += 1;

    if (EXCLUDED_TAGS.has(el.tagName.toUpperCase()) || options.isExcluded?.(el)) continue;

    const style = getStyle(el);
    if (style?.display === 'none') continue;

    for (let i = el.children.length - 1; i >= 0; i -= 1) {
      const child = el.children[i];
      if (child) stack.push({ el: child, depth: depth + 1 });
    }

    if (style?.visibility === 'hidden') continue;

    const rect = el.getBoundingClientRect();
    const domPath = buildDomPath(el, doc.documentElement);
    if (!domPath || domPath.length === 0) continue;

    raw.push({
      name: domLayerLabel(el),
      depth,
      rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      domPath,
      isReact: false,
    });
  }

  const { layers, truncated } = normalizeLayers(raw, viewport, maxLayers, hitVisitLimit);
  return { mode: 'dom-fallback', viewport, layers, truncated };
}
