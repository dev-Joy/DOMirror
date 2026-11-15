import { DOMIRROR_ATTR, formatSourceLocation } from '@domirror/shared';

/**
 * 여는 태그 이름 바로 뒤에 넣을 속성 텍스트(앞 공백 포함).
 * JSX·Vue 템플릿 모두 문자열 속성의 HTML 엔티티를 해석하므로 `&`·`"`를 이스케이프한다.
 */
export function attributeText(file: string, line: number, column: number): string {
  const value = formatSourceLocation({ file, line, column }).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return ` ${DOMIRROR_ATTR}="${value}"`;
}

/** 주입기 내부 예외를 소스 위치와 함께 감싼다 (NFR-4). */
export class InjectError extends Error {
  readonly file: string;
  readonly line: number;
  readonly column: number;

  constructor(injector: string, file: string, line: number, column: number, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`[domirror] ${injector} 주입 실패: ${formatSourceLocation({ file, line, column })} — ${reason}`, { cause });
    this.name = 'InjectError';
    this.file = file;
    this.line = line;
    this.column = column;
  }
}
