// 간격 보기(FR-11)의 순수 계산: 계산값 파싱, 두 상자 사이 거리, padding 영역·거리선 좌표.
// DOM에 의존하지 않으므로 단위 테스트로 검증한다. 좌표는 모두 뷰포트 기준 px.

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Spacing {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const PX = /^(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)px$/i;

/**
 * 계산값 문자열 하나를 px 숫자로 바꾼다. `px` 값만 인정하고 `normal`·백분율·빈 값 등은 0이다
 * (gap의 백분율은 계산값에서 px로 해석되지 않으므로 수치로 표시할 수 없다).
 */
export function toPx(value: string | null | undefined): number {
  const match = PX.exec((value ?? '').trim());
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : 0;
}

export function parseSpacing(cs: Pick<CSSStyleDeclaration, 'paddingTop' | 'paddingRight' | 'paddingBottom' | 'paddingLeft'>): Spacing {
  return {
    top: toPx(cs.paddingTop),
    right: toPx(cs.paddingRight),
    bottom: toPx(cs.paddingBottom),
    left: toPx(cs.paddingLeft),
  };
}

export function parseBorder(
  cs: Pick<CSSStyleDeclaration, 'borderTopWidth' | 'borderRightWidth' | 'borderBottomWidth' | 'borderLeftWidth'>,
): Spacing {
  return {
    top: toPx(cs.borderTopWidth),
    right: toPx(cs.borderRightWidth),
    bottom: toPx(cs.borderBottomWidth),
    left: toPx(cs.borderLeftWidth),
  };
}

export function parseGap(cs: Pick<CSSStyleDeclaration, 'rowGap' | 'columnGap'>): { row: number; column: number } {
  return { row: toPx(cs.rowGap), column: toPx(cs.columnGap) };
}

/** 한 축에서 두 구간 사이의 빈 거리. 구간이 겹치거나 맞닿으면 0. */
function axisGap(aStart: number, aSize: number, bStart: number, bSize: number): number {
  return Math.max(0, Math.max(aStart, bStart) - Math.min(aStart + aSize, bStart + bSize));
}

/** 두 상자 사이 수평·수직 거리. 해당 축에서 겹치면(포함 관계 포함) 그 축은 0. */
export function distanceBetween(a: Box, b: Box): { horizontal: number; vertical: number } {
  return {
    horizontal: axisGap(a.x, a.width, b.x, b.width),
    vertical: axisGap(a.y, a.height, b.y, b.height),
  };
}

/**
 * 두 상자 사이 거리선. 수평 거리가 있으면 가까운 두 세로 변을 잇는 수평선, 수직 거리가 있으면 수직선을 낸다.
 * 선의 높이(가로선의 y)는 두 상자가 겹치는 구간의 가운데, 겹치지 않으면 `b`(마우스를 올린 요소)의 가운데다.
 */
export function distanceLines(a: Box, b: Box): { horizontal: Segment | null; vertical: Segment | null } {
  const { horizontal, vertical } = distanceBetween(a, b);
  const mid = (aStart: number, aSize: number, bStart: number, bSize: number): number => {
    const lo = Math.max(aStart, bStart);
    const hi = Math.min(aStart + aSize, bStart + bSize);
    return lo <= hi ? (lo + hi) / 2 : bStart + bSize / 2;
  };
  let h: Segment | null = null;
  if (horizontal > 0) {
    const y = mid(a.y, a.height, b.y, b.height);
    const [left, right] = a.x < b.x ? [a, b] : [b, a];
    h = { x1: left.x + left.width, y1: y, x2: right.x, y2: y };
  }
  let v: Segment | null = null;
  if (vertical > 0) {
    const x = mid(a.x, a.width, b.x, b.width);
    const [top, bottom] = a.y < b.y ? [a, b] : [b, a];
    v = { x1: x, y1: top.y + top.height, x2: x, y2: bottom.y };
  }
  return { horizontal: h, vertical: v };
}

/** 테두리 상자에서 padding 영역 4개(위·오른쪽·아래·왼쪽)를 구한다. 크기가 0 이하인 영역은 뺀다. */
export function paddingRects(box: Box, border: Spacing, padding: Spacing): Box[] {
  const x = box.x + border.left;
  const y = box.y + border.top;
  const width = Math.max(0, box.width - border.left - border.right);
  const height = Math.max(0, box.height - border.top - border.bottom);
  const top = Math.min(padding.top, height);
  const bottom = Math.min(padding.bottom, height - top);
  const middle = height - top - bottom;
  const rects: Box[] = [
    { x, y, width, height: top },
    { x: x + width - Math.min(padding.right, width), y: y + top, width: Math.min(padding.right, width), height: middle },
    { x, y: y + height - bottom, width, height: bottom },
    { x, y: y + top, width: Math.min(padding.left, width), height: middle },
  ];
  return rects.filter((r) => r.width > 0 && r.height > 0);
}

/** 표시용 px 문자열: 소수 둘째 자리에서 반올림하고 끝자리 0은 뺀다(`12px`, `12.5px`). */
export function formatPx(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return `${Object.is(rounded, -0) ? 0 : rounded}px`;
}
