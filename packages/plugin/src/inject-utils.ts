import {
  DOMIRROR_ATTR,
  DOMIRROR_COMPONENT_ATTR,
  DOMIRROR_DS_ATTR,
  DOMIRROR_PROTECTED_ATTR,
  formatSourceLocation,
} from '@domirror/shared';

/** 문자열 속성 값의 `&`·`"`를 HTML 엔티티로 바꾼다(순서 고정). */
export function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * 여는 태그 이름 바로 뒤에 넣을 속성 텍스트(앞 공백 포함).
 * JSX·Vue 템플릿 모두 문자열 속성의 HTML 엔티티를 해석하므로 `&`·`"`를 이스케이프한다.
 */
export function attributeText(file: string, line: number, column: number): string {
  return ` ${DOMIRROR_ATTR}="${escapeAttribute(formatSourceLocation({ file, line, column }))}"`;
}

/** 컴포넌트 정보 속성 텍스트(앞 공백 포함, FR-6). */
export function componentAttributeText(value: string): string {
  return ` ${DOMIRROR_COMPONENT_ATTR}="${escapeAttribute(value)}"`;
}

/** 값이 없는 디자인 시스템 표시 속성 텍스트(앞 공백 포함, FR-6). */
export function dsAttributeText(): string {
  return ` ${DOMIRROR_DS_ATTR}`;
}

/** 값이 없는 보호 영역(수정 금지) 표시 속성 텍스트(앞 공백 포함, FR-2). */
export function protectedAttributeText(): string {
  return ` ${DOMIRROR_PROTECTED_ATTR}`;
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
