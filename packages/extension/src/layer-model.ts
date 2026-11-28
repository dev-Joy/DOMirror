export type LayerSourceMode = 'react-fiber' | 'dom-fallback';

export interface LayerRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LayerNode {
  readonly id: string;
  readonly name: string;
  readonly depth: number;
  readonly rect: LayerRect;
  readonly domPath: readonly number[];
  readonly isReact: boolean;
  readonly file?: string;
}

export interface LayerSnapshot {
  readonly mode: LayerSourceMode;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly layers: readonly LayerNode[];
  readonly truncated: boolean;
}

export interface CameraState {
  readonly rotateX: number;
  readonly rotateY: number;
  readonly scale: number;
  readonly spacing: number;
}

export interface RawLayerInput {
  readonly name: string;
  readonly depth: number;
  readonly rect: LayerRect;
  readonly domPath: readonly number[];
  readonly isReact: boolean;
  readonly file?: string;
}

export interface DomPathNode {
  readonly parentElement: DomPathNode | null;
  readonly children: ArrayLike<DomPathNode>;
}

export const MAX_LAYERS = 150;
export const DRAG_THRESHOLD_PX = 4;

export const DEFAULT_CAMERA: CameraState = {
  rotateX: 55,
  rotateY: -25,
  scale: 0.85,
  spacing: 24,
};

function clampFinite(value: number | undefined, fallback: number, min: number, max: number): number {
  const candidate = value !== undefined && Number.isFinite(value) ? value : fallback;
  const safe = Number.isFinite(candidate) ? candidate : min;
  if (safe < min) return min;
  if (safe > max) return max;
  return safe;
}

/** 카메라 각도·확대율·깊이 간격을 허용 범위 안으로 제한한다. 비유한 값은 base/기본값으로 대체한다. */
export function clampCamera(next: Partial<CameraState>, base: CameraState = DEFAULT_CAMERA): CameraState {
  return {
    rotateX: clampFinite(next.rotateX, Number.isFinite(base.rotateX) ? base.rotateX : DEFAULT_CAMERA.rotateX, -85, 85),
    rotateY: clampFinite(next.rotateY, Number.isFinite(base.rotateY) ? base.rotateY : DEFAULT_CAMERA.rotateY, -180, 180),
    scale: clampFinite(next.scale, Number.isFinite(base.scale) ? base.scale : DEFAULT_CAMERA.scale, 0.3, 2.5),
    spacing: clampFinite(next.spacing, Number.isFinite(base.spacing) ? base.spacing : DEFAULT_CAMERA.spacing, 0, 80),
  };
}

/** 사각형이 양수 크기를 가지며 뷰포트와 교차하면 true. */
export function isRectInViewport(rect: LayerRect, viewport: { width: number; height: number }): boolean {
  if (
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height)
  ) {
    return false;
  }
  if (viewport.width <= 0 || viewport.height <= 0) return false;
  if (rect.width <= 0 || rect.height <= 0) return false;
  return rect.x + rect.width > 0 && rect.y + rect.height > 0 && rect.x < viewport.width && rect.y < viewport.height;
}

function isValidDomPath(path: unknown): path is readonly number[] {
  if (!Array.isArray(path) || path.length === 0) return false;
  for (const index of path) {
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) return false;
  }
  return true;
}

/**
 * 수집된 원시 레이어 목록을 뷰포트 필터링·상한 절단·0-based 깊이 정규화·ID 부여한다.
 * React 래퍼 컴포넌트 중첩을 보존하기 위해 `domPath` 중복 제거는 하지 않는다.
 */
export function normalizeLayers(
  raw: readonly RawLayerInput[],
  viewport: { width: number; height: number },
  maxLayers: number = MAX_LAYERS,
  hitVisitLimit: boolean = false,
): { layers: LayerNode[]; truncated: boolean } {
  const limit = Number.isInteger(maxLayers) && maxLayers > 0 ? maxLayers : MAX_LAYERS;

  const filtered = raw.filter(
    (item) => Number.isFinite(item.depth) && isRectInViewport(item.rect, viewport) && isValidDomPath(item.domPath),
  );

  const overLimit = filtered.length > limit;
  const selected = overLimit
    ? [...filtered]
        .sort((a, b) => {
          if (a.depth !== b.depth) return a.depth - b.depth;
          return b.rect.width * b.rect.height - a.rect.width * a.rect.height;
        })
        .slice(0, limit)
    : [...filtered];

  if (selected.length === 0) {
    return { layers: [], truncated: hitVisitLimit || overLimit };
  }

  let minDepth = selected[0].depth;
  for (let i = 1; i < selected.length; i += 1) {
    if (selected[i].depth < minDepth) minDepth = selected[i].depth;
  }

  selected.sort((a, b) => a.depth - b.depth);

  const layers: LayerNode[] = selected.map((item, idx) => {
    const base: LayerNode = {
      id: `L-${idx}`,
      name: item.name,
      depth: Math.max(0, Math.round(item.depth - minDepth)),
      rect: {
        x: item.rect.x,
        y: item.rect.y,
        width: item.rect.width,
        height: item.rect.height,
      },
      domPath: [...item.domPath],
      isReact: item.isReact,
    };
    return item.file !== undefined && item.file !== '' ? { ...base, file: item.file } : base;
  });

  return { layers, truncated: hitVisitLimit || overLimit };
}

/** `root` 기준 `children` 인덱스 경로를 만든다. 도달할 수 없거나 순환이면 null. */
export function buildDomPath(node: DomPathNode | null, root: DomPathNode | null): number[] | null {
  if (!node || !root) return null;
  if (node === root) return [];

  const reversed: number[] = [];
  const seen = new Set<DomPathNode>();
  let current: DomPathNode | null = node;

  while (current && current !== root) {
    if (seen.has(current)) return null;
    seen.add(current);
    const parent: DomPathNode | null = current.parentElement;
    if (!parent) return null;

    let found = -1;
    for (let i = 0; i < parent.children.length; i += 1) {
      if (parent.children[i] === current) {
        found = i;
        break;
      }
    }
    if (found < 0) return null;
    reversed.push(found);
    current = parent;
  }

  if (current !== root) return null;
  reversed.reverse();
  return reversed;
}

/** `root`에서 `path` 인덱스 배열을 따라 대응 노드를 역조회한다. 벗어나면 null. */
export function resolveDomPath<T extends DomPathNode>(root: T | null, path: readonly number[]): T | null {
  if (!root) return null;
  let current: T = root;
  for (const index of path) {
    if (!Number.isInteger(index) || index < 0 || index >= current.children.length) return null;
    const next = current.children[index] as T | undefined;
    if (!next) return null;
    current = next;
  }
  return current;
}

/** 두 `domPath`가 모두 존재하고 길이·인덱스가 완전히 같으면 true. */
export function sameDomPath(a: readonly number[] | null, b: readonly number[] | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function isLayerRect(value: unknown): value is LayerRect {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
  return (
    typeof r.x === 'number' &&
    Number.isFinite(r.x) &&
    typeof r.y === 'number' &&
    Number.isFinite(r.y) &&
    typeof r.width === 'number' &&
    Number.isFinite(r.width) &&
    r.width > 0 &&
    typeof r.height === 'number' &&
    Number.isFinite(r.height) &&
    r.height > 0
  );
}

function isLayerNode(value: unknown): value is LayerNode {
  if (typeof value !== 'object' || value === null) return false;
  const n = value as {
    id?: unknown;
    name?: unknown;
    depth?: unknown;
    rect?: unknown;
    domPath?: unknown;
    isReact?: unknown;
    file?: unknown;
  };
  if (typeof n.id !== 'string' || n.id === '') return false;
  if (typeof n.name !== 'string' || n.name === '') return false;
  if (typeof n.depth !== 'number' || !Number.isInteger(n.depth) || n.depth < 0) return false;
  if (!isLayerRect(n.rect)) return false;
  if (!isValidDomPath(n.domPath)) return false;
  if (typeof n.isReact !== 'boolean') return false;
  if (n.file !== undefined && (typeof n.file !== 'string' || n.file === '')) return false;
  return true;
}

/** 브리지로 넘어온 `LayerSnapshot` 화이트리스트 검증. */
export function isLayerSnapshot(value: unknown): value is LayerSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as {
    mode?: unknown;
    viewport?: unknown;
    layers?: unknown;
    truncated?: unknown;
  };
  if (data.mode !== 'react-fiber' && data.mode !== 'dom-fallback') return false;
  if (typeof data.truncated !== 'boolean') return false;

  if (typeof data.viewport !== 'object' || data.viewport === null) return false;
  const vp = data.viewport as { width?: unknown; height?: unknown };
  if (
    typeof vp.width !== 'number' ||
    !Number.isFinite(vp.width) ||
    vp.width < 0 ||
    typeof vp.height !== 'number' ||
    !Number.isFinite(vp.height) ||
    vp.height < 0
  ) {
    return false;
  }

  if (!Array.isArray(data.layers) || data.layers.length > MAX_LAYERS) return false;
  for (const layer of data.layers) {
    if (!isLayerNode(layer)) return false;
  }
  return true;
}
