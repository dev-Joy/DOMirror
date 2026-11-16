import type { InlineStyle, StyledElement } from '../src/applier.js';

/** 인라인 style 선언과 style 속성 유무만 흉내 내는 가짜 요소. */
export class FakeElement implements StyledElement {
  readonly decls = new Map<string, { value: string; priority: string }>();
  readonly style: InlineStyle;
  hasStyle: boolean;
  isConnected = true;

  constructor(initial: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(initial)) this.decls.set(k, { value: v, priority: '' });
    this.hasStyle = this.decls.size > 0;
    const decls = this.decls;
    const setHasStyle = (): void => {
      this.hasStyle = true;
    };
    this.style = {
      get length() {
        return decls.size;
      },
      getPropertyValue: (p) => decls.get(p)?.value ?? '',
      getPropertyPriority: (p) => decls.get(p)?.priority ?? '',
      setProperty: (p, value, priority = '') => {
        decls.set(p, { value, priority });
        setHasStyle();
      },
      removeProperty: (p) => {
        const old = decls.get(p)?.value ?? '';
        decls.delete(p);
        return old;
      },
    };
  }

  hasAttribute(name: string): boolean {
    return name === 'style' && this.hasStyle;
  }

  removeAttribute(name: string): void {
    if (name === 'style') this.hasStyle = false;
  }
}
