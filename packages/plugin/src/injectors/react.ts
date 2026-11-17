import { DOMIRROR_ATTR, DOMIRROR_COMPONENT_ATTR, type Injector } from '@domirror/shared';
import MagicString from 'magic-string';
import { parseSync, Visitor } from 'oxc-parser';
import { mapStaticImports } from '../imports.js';
import { attributeText, componentAttributeText, dsAttributeText, InjectError } from '../inject-utils.js';
import { toRelativeFile } from '../paths.js';
import { createLineIndex } from '../positions.js';

const JSX_FILE = /\.(jsx|tsx)$/;
const HOST_TAG = /^[a-z]/;
const COMPONENT_NAME = /^[A-Z]/;

/** 순회·이름 해석에 필요한 필드만 구조적으로 정의한다. */
interface JsxNameNode {
  type: string;
  name?: string;
  object?: JsxNameNode;
  property?: { name?: string };
}

interface AttributeNode {
  type: string;
  name?: { type: string; name?: unknown };
}

/** 같은 이름의 속성이 이미 있으면 다시 넣지 않는다 (FR-5). */
function hasAttribute(attributes: readonly AttributeNode[], target: string): boolean {
  return attributes.some(
    (attr) => attr.type === 'JSXAttribute' && attr.name?.type === 'JSXIdentifier' && attr.name.name === target,
  );
}

/** `UI.Button`·`UI.Button.Sub`의 점 표기 태그 이름 (FR-5). */
function dottedName(name: JsxNameNode): string {
  return name.object ? `${dottedName(name.object)}.${name.property?.name ?? ''}` : (name.name ?? '');
}

/** JSXMemberExpression의 루트 로컬 이름 (`UI.Button` → `UI`). 소문자 루트도 허용한다. */
function rootName(name: JsxNameNode): string | null {
  let current = name;
  while (current.object) current = current.object;
  return current.type === 'JSXIdentifier' ? (current.name ?? null) : null;
}

/** 정의 파일의 basename에서 마지막 확장자를 뗀다. 예: `src/App.tsx` → `App` (FR-3). */
function fileBasename(file: string): string {
  const base = file.slice(file.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/** 호스트 요소(소문자로 시작하는 JSX 태그)에만 소스 위치 속성을 넣는다 (FR-1). */
export const reactInjector: Injector = {
  name: 'react',

  test(id) {
    return !/[?#]/.test(id) && JSX_FILE.test(id);
  },

  transform(code, id, ctx) {
    const file = toRelativeFile(ctx.root, id);
    if (file === null) return null;

    const lang = id.endsWith('.tsx') ? 'tsx' : 'jsx';
    const parsed = parseSync(id, code, { lang });
    // 구문 오류는 프레임워크 컴파일러가 보고하도록 주입을 건너뛴다.
    if (parsed.errors.length > 0) return null;

    const s = new MagicString(code);
    const lineOf = createLineIndex(code);
    const imports = mapStaticImports(parsed.module?.staticImports);
    /** 감싼 함수 이름 스택. 뒤쪽이 요소에 가장 가까운 함수다 (FR-3). */
    const stack: (string | null)[] = [];
    /** `const X = …`의 선언자 이름. 함수 표현식이 소비하면 비운다. */
    let pendingDeclarator: string | null = null;
    let injected = 0;

    /** 가장 가까운 대문자 함수 이름, 없으면 파일 basename. */
    const componentName = (): string => {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        const frame = stack[index];
        if (frame !== null && COMPONENT_NAME.test(frame)) return frame;
      }
      return fileBasename(file);
    };

    new Visitor({
      VariableDeclarator(node) {
        pendingDeclarator = node.id.type === 'Identifier' ? node.id.name : null;
      },
      'VariableDeclarator:exit'() {
        // 함수가 아니어서 소비되지 않은 선언자 이름을 정리한다.
        pendingDeclarator = null;
      },
      FunctionDeclaration(node) {
        stack.push(node.id?.name ?? null);
      },
      'FunctionDeclaration:exit'() {
        stack.pop();
      },
      FunctionExpression(node) {
        stack.push(pendingDeclarator ?? node.id?.name ?? null);
        pendingDeclarator = null;
      },
      'FunctionExpression:exit'() {
        stack.pop();
      },
      ArrowFunctionExpression() {
        stack.push(pendingDeclarator);
        pendingDeclarator = null;
      },
      'ArrowFunctionExpression:exit'() {
        stack.pop();
      },
      ClassDeclaration(node) {
        stack.push(node.id?.name ?? null);
      },
      'ClassDeclaration:exit'() {
        stack.pop();
      },

      JSXOpeningElement(node) {
        const name = node.name;
        const { line, column } = lineOf(node.start);

        // 정의 측: 호스트 요소 (FR-1·FR-3)
        if (name.type === 'JSXIdentifier' && HOST_TAG.test(name.name)) {
          try {
            // 기존 규칙 유지: 이미 위치 속성이 있으면 이 요소는 건너뛴다 (E-6).
            if (hasAttribute(node.attributes, DOMIRROR_ATTR)) return;

            // inject-error 계약상 위치 속성을 먼저 계산한다 (NFR-4).
            let text = attributeText(file, line, column);
            if (!hasAttribute(node.attributes, DOMIRROR_COMPONENT_ATTR)) {
              text += componentAttributeText(`${componentName()}|${file}`);
              if (ctx.isDesignSystem?.({ file }) === true) text += dsAttributeText();
            }
            s.appendLeft(name.end, text);
            injected += 1;
          } catch (cause) {
            throw new InjectError('react', file, line, column, cause);
          }
          return;
        }

        // 사용처 측: 정적 import로 출처가 확인된 디자인 시스템 컴포넌트 태그 (FR-5)
        if (name.type !== 'JSXIdentifier' && name.type !== 'JSXMemberExpression') return;
        const local = name.type === 'JSXIdentifier' ? name.name : rootName(name);
        if (local === null) return;
        const specifier = imports.get(local);
        if (specifier === undefined) return;
        // 판정 함수가 없거나 매칭되지 않으면 아무것도 넣지 않는다 (E-10).
        if (ctx.isDesignSystem?.({ specifier }) !== true) return;
        if (hasAttribute(node.attributes, DOMIRROR_COMPONENT_ATTR)) return;

        try {
          s.appendLeft(name.end, componentAttributeText(`${dottedName(name)}|${specifier}`) + dsAttributeText());
          injected += 1;
        } catch (cause) {
          throw new InjectError('react', file, line, column, cause);
        }
      },
    }).visit(parsed.program);

    if (injected === 0) return null;
    return {
      code: s.toString(),
      map: s.generateMap({ source: id, includeContent: true, hires: 'boundary' }),
    };
  },
};
