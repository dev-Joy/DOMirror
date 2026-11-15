/** line·column 모두 1부터 시작하며, 여는 태그의 '<' 위치를 가리킨다. */
export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

const POSITIVE_INTEGER = /^[1-9]\d*$/;

/** 예: `src/App.tsx:12:5` */
export function formatSourceLocation(loc: SourceLocation): string {
  return `${loc.file}:${loc.line}:${loc.column}`;
}

/** 오른쪽에서 ':' 2개를 분리한다. 라인·컬럼이 양의 정수가 아니거나 파일이 비면 `null`. */
export function parseSourceLocation(value: string): SourceLocation | null {
  const columnSep = value.lastIndexOf(':');
  if (columnSep <= 0) return null;
  const lineSep = value.lastIndexOf(':', columnSep - 1);
  if (lineSep <= 0) return null;

  const file = value.slice(0, lineSep);
  const line = value.slice(lineSep + 1, columnSep);
  const column = value.slice(columnSep + 1);
  if (!POSITIVE_INTEGER.test(line) || !POSITIVE_INTEGER.test(column)) return null;

  return { file, line: Number(line), column: Number(column) };
}
