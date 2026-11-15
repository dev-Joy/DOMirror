import { createRequire } from 'node:module';
import { DOMIRROR_ATTR, type Injector } from '@domirror/shared';
import type * as CompilerSfc from '@vue/compiler-sfc';
import MagicString from 'magic-string';
import { attributeText, InjectError } from '../inject-utils.js';
import { toRelativeFile } from '../paths.js';
import { createLineIndex } from '../positions.js';

// @vue/compiler-core의 const enum 값 (verbatimModuleSyntax에서 const enum을 import하지 않도록 숫자로 둔다)
const NODE_ELEMENT = 1;
const NODE_ATTRIBUTE = 6;
const NODE_DIRECTIVE = 7;
const NODE_SIMPLE_EXPRESSION = 4;
const ELEMENT_NATIVE = 0;

/** 순회에 필요한 필드만 구조적으로 정의한다. */
interface TemplateNode {
  type: number;
  tag?: string;
  tagType?: number;
  loc?: { start: { offset: number } };
  props?: { type: number; name: string; arg?: { type: number; content?: string } }[];
  children?: TemplateNode[];
}

let compiler: typeof CompilerSfc | null | undefined;

/** 사용자 프로젝트에 @vue/compiler-sfc가 없으면 `null` (optional peer). */
function loadCompiler(): typeof CompilerSfc | null {
  if (compiler === undefined) {
    try {
      compiler = createRequire(import.meta.url)('@vue/compiler-sfc') as typeof CompilerSfc;
    } catch {
      compiler = null;
    }
  }
  return compiler;
}

function hasDomirrorProp(node: TemplateNode): boolean {
  return (node.props ?? []).some(
    (prop) =>
      (prop.type === NODE_ATTRIBUTE && prop.name === DOMIRROR_ATTR) ||
      (prop.type === NODE_DIRECTIVE &&
        prop.name === 'bind' &&
        prop.arg?.type === NODE_SIMPLE_EXPRESSION &&
        prop.arg.content === DOMIRROR_ATTR),
  );
}

/**
 * `.vue` 원본의 `<template>` 안 네이티브 요소에만 속성을 넣는다 (FR-2).
 * 컴포넌트·`<template>`·`<slot>`은 제외한다.
 */
export const vueInjector: Injector = {
  name: 'vue',

  test(id) {
    return !/[?#]/.test(id) && id.endsWith('.vue');
  },

  transform(code, id, ctx) {
    const file = toRelativeFile(ctx.root, id);
    if (file === null) return null;

    const sfc = loadCompiler();
    if (sfc === null) return null;

    const { descriptor, errors } = sfc.parse(code, { filename: id });
    if (errors.length > 0) return null;

    const template = descriptor.template;
    if (!template || template.src || (template.lang !== undefined && template.lang !== 'html') || !template.ast) {
      return null;
    }

    const s = new MagicString(code);
    const lineOf = createLineIndex(code);
    let injected = 0;

    const visit = (node: TemplateNode): void => {
      if (node.type === NODE_ELEMENT && node.tagType === ELEMENT_NATIVE && node.tag && node.loc) {
        // descriptor.template.ast의 loc은 SFC 파일 전체 기준 오프셋이다.
        const start = node.loc.start.offset;
        const { line, column } = lineOf(start);
        try {
          if (!hasDomirrorProp(node)) {
            s.appendLeft(start + 1 + node.tag.length, attributeText(file, line, column));
            injected++;
          }
        } catch (cause) {
          throw new InjectError('vue', file, line, column, cause);
        }
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(template.ast as unknown as TemplateNode);

    if (injected === 0) return null;
    return {
      code: s.toString(),
      map: s.generateMap({ source: id, includeContent: true, hires: 'boundary' }),
    };
  },
};
