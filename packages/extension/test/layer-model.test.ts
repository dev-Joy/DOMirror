import { describe, expect, it } from 'vitest';
import {
  buildDomPath,
  clampCamera,
  DEFAULT_CAMERA,
  DRAG_THRESHOLD_PX,
  isLayerSnapshot,
  isRectInViewport,
  MAX_LAYERS,
  normalizeLayers,
  resolveDomPath,
  sameDomPath,
  type DomPathNode,
  type LayerSnapshot,
  type RawLayerInput,
} from '../src/layer-model.js';

interface FakeNode extends DomPathNode {
  name: string;
  parentElement: FakeNode | null;
  children: FakeNode[];
}

function makeNode(name: string, children: FakeNode[] = []): FakeNode {
  const node: FakeNode = { name, parentElement: null, children };
  for (const child of children) child.parentElement = node;
  return node;
}

describe('clampCamera', () => {
  it('부분 입력을 base와 병합하고 허용 범위로 클램핑한다', () => {
    expect(clampCamera({})).toEqual(DEFAULT_CAMERA);
    expect(clampCamera({ rotateX: 120, rotateY: -250, scale: 5, spacing: 120 })).toEqual({
      rotateX: 85,
      rotateY: -180,
      scale: 2.5,
      spacing: 80,
    });
    expect(clampCamera({ rotateX: -120, rotateY: 250, scale: 0.05, spacing: -10 })).toEqual({
      rotateX: -85,
      rotateY: 180,
      scale: 0.3,
      spacing: 0,
    });
  });

  it('NaN·Infinity 입력은 base 값으로 방어한다', () => {
    const base = { rotateX: 40, rotateY: -10, scale: 1.2, spacing: 30 };
    expect(clampCamera({ rotateX: Number.NaN, rotateY: Number.POSITIVE_INFINITY, scale: Number.NEGATIVE_INFINITY, spacing: Number.NaN }, base)).toEqual(
      base,
    );
  });

  it('DRAG_THRESHOLD_PX와 MAX_LAYERS 기본 상수가 명세와 일치한다', () => {
    expect(DRAG_THRESHOLD_PX).toBe(4);
    expect(MAX_LAYERS).toBe(150);
    expect(DEFAULT_CAMERA).toEqual({ rotateX: 55, rotateY: -25, scale: 0.85, spacing: 24 });
  });
});

describe('isRectInViewport', () => {
  const viewport = { width: 1280, height: 720 };

  it('뷰포트와 교차하고 크기가 양수인 사각형만 true다', () => {
    expect(isRectInViewport({ x: 10, y: 20, width: 100, height: 50 }, viewport)).toBe(true);
    expect(isRectInViewport({ x: -50, y: 10, width: 100, height: 50 }, viewport)).toBe(true);
    expect(isRectInViewport({ x: 1279, y: 719, width: 10, height: 10 }, viewport)).toBe(true);
  });

  it('크기가 0 이하이거나 뷰포트 밖·비유한 값이면 false다', () => {
    expect(isRectInViewport({ x: 10, y: 10, width: 0, height: 50 }, viewport)).toBe(false);
    expect(isRectInViewport({ x: 10, y: 10, width: 50, height: -5 }, viewport)).toBe(false);
    expect(isRectInViewport({ x: -100, y: 10, width: 100, height: 50 }, viewport)).toBe(false);
    expect(isRectInViewport({ x: 1280, y: 10, width: 100, height: 50 }, viewport)).toBe(false);
    expect(isRectInViewport({ x: 10, y: 720, width: 100, height: 50 }, viewport)).toBe(false);
    expect(isRectInViewport({ x: Number.NaN, y: 10, width: 100, height: 50 }, viewport)).toBe(false);
    expect(isRectInViewport({ x: 10, y: 10, width: 100, height: 50 }, { width: 0, height: 720 })).toBe(false);
  });
});

describe('normalizeLayers', () => {
  const viewport = { width: 1000, height: 800 };

  it('비가시·잘못된 domPath를 제외하고 0-based 깊이 정규화 및 L-idx ID를 부여한다', () => {
    const raw: RawLayerInput[] = [
      { name: 'Hidden', depth: 2, rect: { x: 0, y: 0, width: 0, height: 10 }, domPath: [1, 0], isReact: true },
      { name: 'RootOnly', depth: 2, rect: { x: 0, y: 0, width: 10, height: 10 }, domPath: [], isReact: true },
      { name: 'BadPath', depth: 2, rect: { x: 0, y: 0, width: 10, height: 10 }, domPath: [1, -1], isReact: true },
      { name: 'Child', depth: 5, rect: { x: 10, y: 10, width: 50, height: 50 }, domPath: [1, 0, 0], isReact: true, file: 'src/Child.tsx' },
      { name: 'App', depth: 3, rect: { x: 0, y: 0, width: 200, height: 200 }, domPath: [1, 0], isReact: true },
      { name: 'Wrapper', depth: 4, rect: { x: 0, y: 0, width: 200, height: 200 }, domPath: [1, 0], isReact: true },
    ];

    const { layers, truncated } = normalizeLayers(raw, viewport);
    expect(truncated).toBe(false);
    expect(layers).toHaveLength(3);
    // 동일 domPath 래퍼 중첩도 보존된다.
    expect(layers.map((l) => [l.id, l.name, l.depth, l.domPath])).toEqual([
      ['L-0', 'App', 0, [1, 0]],
      ['L-1', 'Wrapper', 1, [1, 0]],
      ['L-2', 'Child', 2, [1, 0, 0]],
    ]);
    expect(layers[2].file).toBe('src/Child.tsx');
    expect(layers[0].file).toBeUndefined();
  });

  it('maxLayers 초과 시 깊이 오름차순·면적 내림차순 상위 항목만 남기고 truncated=true를 설정한다', () => {
    const raw: RawLayerInput[] = [
      { name: 'SmallD1', depth: 1, rect: { x: 0, y: 0, width: 20, height: 20 }, domPath: [1, 0], isReact: true },
      { name: 'BigD1', depth: 1, rect: { x: 0, y: 0, width: 100, height: 100 }, domPath: [1, 1], isReact: true },
      { name: 'HugeD2', depth: 2, rect: { x: 0, y: 0, width: 500, height: 500 }, domPath: [1, 2], isReact: true },
      { name: 'RootD0', depth: 0, rect: { x: 0, y: 0, width: 50, height: 50 }, domPath: [1], isReact: true },
    ];

    const { layers, truncated } = normalizeLayers(raw, viewport, 2);
    expect(truncated).toBe(true);
    expect(layers.map((l) => l.name)).toEqual(['RootD0', 'BigD1']);
  });

  it('hitVisitLimit=true이면 개수가 상한 이하라도 truncated=true를 유지한다', () => {
    const { layers, truncated } = normalizeLayers([], viewport, MAX_LAYERS, true);
    expect(layers).toEqual([]);
    expect(truncated).toBe(true);
  });
});

describe('buildDomPath / resolveDomPath / sameDomPath', () => {
  const leaf = makeNode('span');
  const section = makeNode('section', [makeNode('h1'), leaf]);
  const body = makeNode('body', [section]);
  const root = makeNode('html', [makeNode('head'), body]);

  it('루트 기준 경로를 생성하고 동일 노드로 역조회한다', () => {
    const path = buildDomPath(leaf, root);
    expect(path).toEqual([1, 0, 1]);
    expect(resolveDomPath(root, path ?? [])).toBe(leaf);
    expect(buildDomPath(root, root)).toEqual([]);
    expect(resolveDomPath(root, [])).toBe(root);
  });

  it('분리된 노드·범위 밖 인덱스·순환 참조는 null을 반환한다', () => {
    const detached = makeNode('div');
    expect(buildDomPath(detached, root)).toBeNull();
    expect(buildDomPath(null, root)).toBeNull();
    expect(resolveDomPath(root, [1, 5])).toBeNull();
    expect(resolveDomPath(root, [-1])).toBeNull();
    expect(resolveDomPath(root, [1.5])).toBeNull();
    expect(resolveDomPath(null, [0])).toBeNull();

    const a = makeNode('a');
    const b = makeNode('b', [a]);
    a.children.push(b);
    b.parentElement = a;
    expect(buildDomPath(a, root)).toBeNull();
  });

  it('sameDomPath는 길이와 모든 인덱스가 일치할 때만 true다', () => {
    expect(sameDomPath([1, 0, 1], [1, 0, 1])).toBe(true);
    expect(sameDomPath([1, 0], [1, 0, 1])).toBe(false);
    expect(sameDomPath([1, 0], [1, 1])).toBe(false);
    expect(sameDomPath(null, [1, 0])).toBe(false);
    expect(sameDomPath([1, 0], null)).toBe(false);
  });
});

describe('isLayerSnapshot', () => {
  const valid: LayerSnapshot = {
    mode: 'react-fiber',
    viewport: { width: 1280, height: 720 },
    truncated: false,
    layers: [
      {
        id: 'L-0',
        name: 'App',
        depth: 0,
        rect: { x: 0, y: 0, width: 1280, height: 720 },
        domPath: [1, 0],
        isReact: true,
        file: 'src/App.tsx',
      },
    ],
  };

  it('정상 스냅샷을 통과시킨다', () => {
    expect(isLayerSnapshot(valid)).toBe(true);
    expect(isLayerSnapshot({ ...valid, mode: 'dom-fallback', layers: [] })).toBe(true);
  });

  it('필드 타입·상한·경로가 잘못된 위조 스냅샷은 거부한다', () => {
    expect(isLayerSnapshot(null)).toBe(false);
    expect(isLayerSnapshot({ ...valid, mode: 'unknown' })).toBe(false);
    expect(isLayerSnapshot({ ...valid, truncated: 'no' })).toBe(false);
    expect(isLayerSnapshot({ ...valid, viewport: { width: -1, height: 100 } })).toBe(false);
    expect(isLayerSnapshot({ ...valid, viewport: { width: Number.NaN, height: 100 } })).toBe(false);
    expect(isLayerSnapshot({ ...valid, layers: Array.from({ length: MAX_LAYERS + 1 }, () => valid.layers[0]) })).toBe(false);
    expect(isLayerSnapshot({ ...valid, layers: [{ ...valid.layers[0], id: '' }] })).toBe(false);
    expect(isLayerSnapshot({ ...valid, layers: [{ ...valid.layers[0], name: '' }] })).toBe(false);
    expect(isLayerSnapshot({ ...valid, layers: [{ ...valid.layers[0], depth: -1 }] })).toBe(false);
    expect(isLayerSnapshot({ ...valid, layers: [{ ...valid.layers[0], depth: 1.5 }] })).toBe(false);
    expect(isLayerSnapshot({ ...valid, layers: [{ ...valid.layers[0], rect: { x: 0, y: 0, width: 0, height: 10 } }] })).toBe(false);
    expect(isLayerSnapshot({ ...valid, layers: [{ ...valid.layers[0], domPath: [] }] })).toBe(false);
    expect(isLayerSnapshot({ ...valid, layers: [{ ...valid.layers[0], domPath: [1, -2] }] })).toBe(false);
    expect(isLayerSnapshot({ ...valid, layers: [{ ...valid.layers[0], file: '' }] })).toBe(false);
    expect(isLayerSnapshot({ ...valid, layers: [{ ...valid.layers[0], isReact: 'yes' }] })).toBe(false);
  });
});
