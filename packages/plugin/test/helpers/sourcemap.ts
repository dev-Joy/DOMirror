/**
 * 테스트 전용 최소 소스맵(v3) 역매핑기. 새 의존성 없이 `mappings`의 Base64 VLQ만 디코딩한다.
 * 반환 위치는 모두 0부터 시작하는 line·column이다.
 */

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

interface Segment {
  generatedColumn: number;
  sourceIndex: number;
  sourceLine: number;
  sourceColumn: number;
}

function decodeVlq(text: string): number[] {
  const values: number[] = [];
  let value = 0;
  let shift = 0;
  for (const char of text) {
    const digit = BASE64.indexOf(char);
    if (digit < 0) throw new Error(`잘못된 VLQ 문자: ${char}`);
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
    } else {
      values.push(value & 1 ? -(value >>> 1) : value >>> 1);
      value = 0;
      shift = 0;
    }
  }
  return values;
}

function decodeMappings(mappings: string): Segment[][] {
  let sourceIndex = 0;
  let sourceLine = 0;
  let sourceColumn = 0;
  return mappings.split(';').map((line) => {
    let generatedColumn = 0;
    const segments: Segment[] = [];
    for (const raw of line.split(',')) {
      if (raw === '') continue;
      const fields = decodeVlq(raw);
      generatedColumn += fields[0] ?? 0;
      if (fields.length < 4) continue;
      sourceIndex += fields[1] ?? 0;
      sourceLine += fields[2] ?? 0;
      sourceColumn += fields[3] ?? 0;
      segments.push({ generatedColumn, sourceIndex, sourceLine, sourceColumn });
    }
    return segments;
  });
}

/** 생성 코드의 (line, column)을 원본 (source, line, column)으로 되돌린다. 매핑이 없으면 `null`. */
export function originalPositionFor(
  map: { mappings: string; sources: (string | null)[] },
  line: number,
  column: number,
): { source: string | null; line: number; column: number } | null {
  const segments = decodeMappings(map.mappings)[line] ?? [];
  let found: Segment | undefined;
  for (const segment of segments) {
    if (segment.generatedColumn > column) break;
    found = segment;
  }
  if (!found) return null;
  return {
    source: map.sources[found.sourceIndex] ?? null,
    line: found.sourceLine,
    column: found.sourceColumn + (column - found.generatedColumn),
  };
}

/** 문자열에서 needle의 n번째(0부터) 등장 위치를 0부터 시작하는 line·column으로 돌려준다. */
export function positionOf(code: string, needle: string, nth = 0): { line: number; column: number } {
  let offset = -1;
  for (let i = 0; i <= nth; i++) {
    offset = code.indexOf(needle, offset + 1);
    if (offset < 0) throw new Error(`찾을 수 없음: ${needle}`);
  }
  const before = code.slice(0, offset).split('\n');
  return { line: before.length - 1, column: (before.at(-1) ?? '').length };
}
