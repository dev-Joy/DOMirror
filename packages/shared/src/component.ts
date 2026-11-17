/** 컴포넌트 이름과 정의 위치를 함께 담는 값 (FR-6). */
export interface ComponentInfo {
  name: string;
  source: string;
}

/** 예: `Card|src/App.tsx` */
export function formatComponentInfo(info: ComponentInfo): string {
  return `${info.name}|${info.source}`;
}

/** 첫 '|'만 분리하며, 이름·위치 중 하나라도 비면 `null`. 공백은 자르지 않는다. */
export function parseComponentInfo(value: string): ComponentInfo | null {
  const sep = value.indexOf('|');
  if (sep <= 0) return null;

  const name = value.slice(0, sep);
  const source = value.slice(sep + 1);
  if (!source) return null;

  return { name, source };
}
