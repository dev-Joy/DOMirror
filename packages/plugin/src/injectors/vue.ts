import { createRequire } from 'node:module';
import { DOMIRROR_ATTR, DOMIRROR_COMPONENT_ATTR, type Injector } from '@domirror/shared';
import type * as CompilerSfc from '@vue/compiler-sfc';
import MagicString from 'magic-string';
import { parseSync } from 'oxc-parser';
import { mapStaticImports } from '../imports.js';
import { attributeText, componentAttributeText, dsAttributeText, InjectError } from '../inject-utils.js';
import { toRelativeFile } from '../paths.js';
import { createLineIndex } from '../positions.js';

// @vue/compiler-core의 const enum 값 (verbatimModuleSyntax에서 const enum을 import하지 않도록 숫자로 둔다)
const NODE_ELEMENT = 1;
const NODE_ATTRIBUTE = 6;
const NODE_DIRECTIVE = 7;
const NODE_SIMPLE_EXPRESSION = 4;
const ELEMENT_NATIVE = 0;
const ELEMENT_COMPONENT = 1;

type ScriptLang = 'js' | 'jsx' | 'ts' | 'tsx';

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

/** 같은 이름의 속성이 이미 있으면 다시 넣지 않는다 (E-6). */
function hasProp(node: TemplateNode, name: string): boolean {
  return (node.props ?? []).some(
    (prop) =>
      (prop.type === NODE_ATTRIBUTE && prop.name === name) ||
      (prop.type === NODE_DIRECTIVE &&
        prop.name === 'bind' &&
        prop.arg?.type === NODE_SIMPLE_EXPRESSION &&
        prop.arg.content === name),
  );
}

/** 스크립트 블록의 lang을 oxc-parser 옵션으로 옮긴다 (FR-5). */
function scriptLang(lang: string | undefined): ScriptLang {
  switch (lang) {
    case 'ts':
      return 'ts';
    case 'tsx':
      return 'tsx';
    case 'jsx':
      return 'jsx';
    default:
      return 'js';
  }
}

/** kebab-case 태그를 PascalCase 로컬 이름으로 바꾼다 (`acme-button` → `AcmeButton`). */
function pascalCase(tag: string): string {
  return tag
    .split('-')
    .map((segment) => (segment.length === 0 ? segment : segment[0].toUpperCase() + segment.slice(1)))
    .join('');
}

/** 정의 파일의 basename에서 마지막 확장자를 뗀다. 예: `src/ds/Button.vue` → `Button` (FR-4). */
function fileBasename(file: string): string {
  const base = file.split('/').pop() ?? file;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/**
 * `.vue` 원본의 `<template>` 안 네이티브 요소에 위치·컴포넌트 정보를 넣는다 (FR-4).
 * 정적 import로 출처가 확인된 디자인 시스템 컴포넌트 태그에는 사용처 측 정보를 넣는다 (FR-5).
 * `<component :is>`·`<template>`·`<slot>`은 제외한다.
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
    const isDesignSystem = ctx.isDesignSystem;
    const name = fileBasename(file);
    let injected = 0;

    /** 사용처 측 주입에 쓸 정적 import 맵. 첫 컴포넌트 태그에서 1회만 파싱한다 (E-10). */
    let imports: Map<string, string> | null = null;
    const loadImports = (): Map<string, string> => {
      if (imports !== null) return imports;

      const merged = new Map<string, string>();
      for (const block of [descriptor.scriptSetup, descriptor.script]) {
        if (!block) continue;
        try {
          const parsed = parseSync(id, block.content, { lang: scriptLang(block.lang) });
          // 파싱에 실패한 블록의 결과만 버린다 (E-7).
          if (parsed.errors.length > 0) continue;
          for (const [local, specifier] of mapStaticImports(parsed.module?.staticImports)) {
            merged.set(local, specifier);
          }
        } catch {
          // 정의 측 주입은 유지하고 사용처 측만 생략한다 (E-7).
        }
      }

      imports = merged;
      return merged;
    };

    const visit = (node: TemplateNode): void => {
      if (node.type === NODE_ELEMENT && node.tag && node.loc) {
        // descriptor.template.ast의 loc은 SFC 파일 전체 기준 오프셋이다.
        const start = node.loc.start.offset;
        const { line, column } = lineOf(start);
        // 여는 태그 이름 바로 뒤가 기존 삽입 지점이다 (NFR-5).
        const insertAt = start + 1 + node.tag.length;
        try {
          if (node.tagType === ELEMENT_NATIVE) {
            // 기존 규칙 유지: 이미 위치 속성이 있으면 이 요소는 건너뛴다.
            if (!hasProp(node, DOMIRROR_ATTR)) {
              // inject-error 계약상 위치 속성을 먼저 계산한다 (NFR-4).
              let text = attributeText(file, line, column);
              if (!hasProp(node, DOMIRROR_COMPONENT_ATTR)) {
                text += componentAttributeText(`${name}|${file}`);
                if (isDesignSystem?.({ file }) === true) text += dsAttributeText();
              }
              s.appendLeft(insertAt, text);
              injected++;
            }
          } else if (node.tagType === ELEMENT_COMPONENT && isDesignSystem) {
            // 사용처 측: 정적 import로 출처가 확인된 디자인 시스템 컴포넌트 태그 (FR-5).
            // isDesignSystem이 없으면 script 파싱 자체를 하지 않는다 (E-10).
            const specifier = loadImports().get(pascalCase(node.tag));
            if (specifier !== undefined && isDesignSystem({ specifier }) === true && !hasProp(node, DOMIRROR_COMPONENT_ATTR)) {
              s.appendLeft(insertAt, componentAttributeText(`${node.tag}|${specifier}`) + dsAttributeText());
              injected++;
            }
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
