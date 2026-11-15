import { DOMIRROR_ATTR, type Injector } from '@domirror/shared';
import MagicString from 'magic-string';
import { parseSync, Visitor } from 'oxc-parser';
import { attributeText, InjectError } from '../inject-utils.js';
import { toRelativeFile } from '../paths.js';
import { createLineIndex } from '../positions.js';

const JSX_FILE = /\.(jsx|tsx)$/;

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
    let injected = 0;

    new Visitor({
      JSXOpeningElement(node) {
        const name = node.name;
        if (name.type !== 'JSXIdentifier' || !/^[a-z]/.test(name.name)) return;

        const { line, column } = lineOf(node.start);
        try {
          const already = node.attributes.some(
            (attr) => attr.type === 'JSXAttribute' && attr.name.type === 'JSXIdentifier' && attr.name.name === DOMIRROR_ATTR,
          );
          if (already) return;
          s.appendLeft(name.end, attributeText(file, line, column));
          injected++;
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
