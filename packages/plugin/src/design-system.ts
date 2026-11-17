import type { InjectorContext } from '@domirror/shared';

export type DesignSystemMatcher = NonNullable<InjectorContext['isDesignSystem']>;

const REGEXP_META = '\\^$.|?+()[]{}';

/** 백슬래시·선행 `./`·앞뒤 공백을 정리한 비교용 패턴 (FR-1). */
function normalizePattern(pattern: string): string {
  return pattern.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '').trim();
}

/** `*`·`**`만 지원하는 최소 글롭을 `^...$` 전체 일치 정규식으로 바꾼다 (NFR-3: 신규 의존성 0). */
export function globToRegExp(pattern: string): RegExp {
  const source = normalizePattern(pattern);
  let body = '';

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '*') {
      if (source[index + 1] !== '*') {
        body += '[^/]*';
      } else if (source[index + 2] === '/') {
        body += '(?:[^/]+/)*';
        index += 2;
      } else {
        body += '.*';
        index += 1;
      }
      continue;
    }
    body += REGEXP_META.includes(char) ? `\\${char}` : char;
  }

  return new RegExp(`^${body}$`);
}

/**
 * `designSystem` 항목을 정의 파일 경로(글롭)와 import specifier 양쪽으로 판정하는 함수를 만든다.
 * 정규식은 호출 시 1회만 만들어 두고 판정에서는 재사용한다 (FR-2·NFR-4).
 */
export function createDesignSystemMatcher(patterns: readonly string[]): DesignSystemMatcher {
  const rules = patterns
    .map((pattern) => normalizePattern(pattern))
    .filter((pattern) => pattern !== '')
    .map((pattern) => ({ pattern, glob: globToRegExp(pattern) }));

  if (rules.length === 0) return () => false;

  return ({ file, specifier }) =>
    rules.some(({ pattern, glob }) => {
      if (file !== undefined && glob.test(file)) return true;
      if (specifier === undefined) return false;
      return specifier === pattern || specifier.startsWith(`${pattern}/`);
    });
}
