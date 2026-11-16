import { describe, expect, it } from 'vitest';
import { distanceBetween, distanceLines, formatPx, paddingRects, parseBorder, parseGap, parseSpacing, toPx, type Box } from '../src/measure.js';

const box = (x: number, y: number, width: number, height: number): Box => ({ x, y, width, height });

describe('toPx', () => {
  it('px 값과 소수점·지수 표기를 숫자로 읽는다', () => {
    expect(toPx('12px')).toBe(12);
    expect(toPx('12.5px')).toBe(12.5);
    expect(toPx('.5px')).toBe(0.5);
    expect(toPx(' 3px ')).toBe(3);
    expect(toPx('1e1px')).toBe(10);
    expect(toPx('-4px')).toBe(-4);
  });

  it('normal·백분율·빈 값·단위 없는 값은 0', () => {
    expect(toPx('normal')).toBe(0);
    expect(toPx('10%')).toBe(0);
    expect(toPx('')).toBe(0);
    expect(toPx('auto')).toBe(0);
    expect(toPx('12')).toBe(0);
    expect(toPx(undefined)).toBe(0);
  });
});

describe('parseSpacing·parseBorder·parseGap', () => {
  it('padding 네 방향을 읽는다', () => {
    expect(parseSpacing({ paddingTop: '4px', paddingRight: '8.25px', paddingBottom: '0px', paddingLeft: '16px' })).toEqual({
      top: 4,
      right: 8.25,
      bottom: 0,
      left: 16,
    });
  });

  it('테두리 두께 네 방향을 읽는다', () => {
    expect(parseBorder({ borderTopWidth: '1px', borderRightWidth: '2px', borderBottomWidth: '0px', borderLeftWidth: '0.5px' })).toEqual({
      top: 1,
      right: 2,
      bottom: 0,
      left: 0.5,
    });
  });

  it('gap: px 값은 숫자, normal은 0', () => {
    expect(parseGap({ rowGap: '12px', columnGap: '8px' })).toEqual({ row: 12, column: 8 });
    expect(parseGap({ rowGap: 'normal', columnGap: 'normal' })).toEqual({ row: 0, column: 0 });
    expect(parseGap({ rowGap: 'normal', columnGap: '1.5px' })).toEqual({ row: 0, column: 1.5 });
  });
});

describe('distanceBetween', () => {
  it('수평 거리: 왼쪽 상자의 오른쪽 변에서 오른쪽 상자의 왼쪽 변까지', () => {
    expect(distanceBetween(box(0, 0, 100, 50), box(120, 10, 30, 30))).toEqual({ horizontal: 20, vertical: 0 });
    expect(distanceBetween(box(120, 10, 30, 30), box(0, 0, 100, 50))).toEqual({ horizontal: 20, vertical: 0 });
  });

  it('수직 거리: 위 상자의 아래 변에서 아래 상자의 위 변까지', () => {
    expect(distanceBetween(box(0, 0, 100, 50), box(10, 74.5, 30, 30))).toEqual({ horizontal: 0, vertical: 24.5 });
  });

  it('대각선으로 떨어지면 두 축 모두 거리가 있다', () => {
    expect(distanceBetween(box(0, 0, 10, 10), box(30, 50, 10, 10))).toEqual({ horizontal: 20, vertical: 40 });
  });

  it('겹치거나 맞닿거나 포함되면 0', () => {
    expect(distanceBetween(box(0, 0, 100, 100), box(50, 50, 100, 100))).toEqual({ horizontal: 0, vertical: 0 });
    expect(distanceBetween(box(0, 0, 100, 100), box(100, 100, 10, 10))).toEqual({ horizontal: 0, vertical: 0 });
    expect(distanceBetween(box(0, 0, 100, 100), box(10, 10, 20, 20))).toEqual({ horizontal: 0, vertical: 0 });
    expect(distanceBetween(box(5, 5, 10, 10), box(5, 5, 10, 10))).toEqual({ horizontal: 0, vertical: 0 });
  });
});

describe('distanceLines', () => {
  it('수평 거리선은 두 상자가 겹치는 세로 구간의 가운데 높이에 그린다', () => {
    expect(distanceLines(box(0, 0, 100, 50), box(120, 10, 30, 30))).toEqual({
      horizontal: { x1: 100, y1: 25, x2: 120, y2: 25 },
      vertical: null,
    });
  });

  it('수직 거리선은 위 상자 아래 변에서 아래 상자 위 변까지', () => {
    expect(distanceLines(box(10, 100, 30, 30), box(0, 0, 100, 50))).toEqual({
      horizontal: null,
      vertical: { x1: 25, y1: 50, x2: 25, y2: 100 },
    });
  });

  it('겹침 구간이 없는 축은 b(hover 요소)의 가운데를 지난다', () => {
    expect(distanceLines(box(0, 0, 10, 10), box(30, 50, 10, 20))).toEqual({
      horizontal: { x1: 10, y1: 60, x2: 30, y2: 60 },
      vertical: { x1: 35, y1: 10, x2: 35, y2: 50 },
    });
  });

  it('겹치면 선이 없다', () => {
    expect(distanceLines(box(0, 0, 100, 100), box(10, 10, 20, 20))).toEqual({ horizontal: null, vertical: null });
  });
});

describe('paddingRects', () => {
  const zero = { top: 0, right: 0, bottom: 0, left: 0 };

  it('테두리 안쪽에 위·오른쪽·아래·왼쪽 padding 영역을 만든다', () => {
    expect(paddingRects(box(0, 0, 100, 60), { top: 1, right: 1, bottom: 1, left: 1 }, { top: 10, right: 20, bottom: 5, left: 8 })).toEqual([
      { x: 1, y: 1, width: 98, height: 10 },
      { x: 79, y: 11, width: 20, height: 43 },
      { x: 1, y: 54, width: 98, height: 5 },
      { x: 1, y: 11, width: 8, height: 43 },
    ]);
  });

  it('padding 0인 방향은 빼고, 모두 0이면 빈 배열', () => {
    expect(paddingRects(box(0, 0, 100, 60), zero, { top: 4, right: 0, bottom: 0, left: 0 })).toEqual([{ x: 0, y: 0, width: 100, height: 4 }]);
    expect(paddingRects(box(0, 0, 100, 60), zero, zero)).toEqual([]);
  });

  it('padding이 상자보다 커도 상자 밖으로 나가지 않는다', () => {
    const rects = paddingRects(box(0, 0, 10, 10), zero, { top: 8, right: 0, bottom: 8, left: 0 });
    expect(rects).toEqual([
      { x: 0, y: 0, width: 10, height: 8 },
      { x: 0, y: 8, width: 10, height: 2 },
    ]);
  });
});

describe('formatPx', () => {
  it('소수 첫째 자리까지 반올림하고 불필요한 0은 뺀다', () => {
    expect(formatPx(12)).toBe('12px');
    expect(formatPx(12.5)).toBe('12.5px');
    expect(formatPx(12.34)).toBe('12.3px');
    expect(formatPx(0.04)).toBe('0px');
    expect(formatPx(-0.01)).toBe('0px');
  });
});
