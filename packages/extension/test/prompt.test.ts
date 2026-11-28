import { describe, expect, it } from 'vitest';
import { changeKey, type LocalChange } from '../src/change-log.js';
import {
  buildPrompt,
  changesPromptInput,
  copyStatusText,
  type PromptChange,
  type PromptInput,
  type PromptSelection,
} from '../src/prompt.js';

const SOURCE = { file: 'src/App.tsx', line: 12, column: 5, inherited: false };
const PAGE = 'http://127.0.0.1:5173/';

function change(overrides: Partial<LocalChange> = {}): LocalChange {
  return {
    id: 'id-1',
    source: SOURCE,
    selectorHint: 'h1.title',
    property: 'padding-top',
    before: { authored: '8px', computed: '8px' },
    after: '12px',
    pageUrl: PAGE,
    createdAt: '2026-11-16T00:00:00.000Z',
    stale: false,
    ...overrides,
  };
}

function changes(...list: LocalChange[]): PromptInput {
  return { kind: 'changes', changes: list };
}

/** 부분 문자열 등장 횟수. */
function count(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

describe('buildPrompt — 변경 내역 모드 (AC-1)', () => {
  const located = change();
  const inherited = change({
    id: 'id-2',
    source: { file: 'src/Card.vue', line: 3, column: 1, inherited: true },
    selectorHint: 'span.label',
    property: 'color',
    before: { authored: null, computed: 'rgb(0, 0, 0)' },
    after: '#333',
  });
  const missing = change({
    id: 'id-3',
    source: null,
    selectorHint: 'em.note',
    property: 'margin-top',
    after: '4px',
  });
  const text = buildPrompt(changes(located, inherited, missing));

  it('머리와 요청 문단을 넣는다 (FR-6)', () => {
    expect(text.startsWith('# 화면 스타일 변경 반영 요청\n\n')).toBe(true);
    expect(text).toContain('아래 CSS 변경을 소스 코드에 반영해 주세요.');
  });

  it('위치·조상 위치·위치 미확인을 항목마다 표기한다 (FR-5)', () => {
    expect(text).toContain('- 위치: `src/App.tsx:12:5`');
    expect(text).toContain('- 위치: `src/Card.vue:3:1` (조상 위치)');
    expect(text).toContain('- 위치: 위치 미확인');
    expect(count(text, '- 위치: ')).toBe(3);
  });

  it('번호·속성·요소·이전 값·새 값을 항목 순서대로 적는다 (FR-2·FR-5)', () => {
    expect(text).toContain('### 1. `padding-top`');
    expect(text).toContain('### 2. `color`');
    expect(text).toContain('### 3. `margin-top`');
    expect(text).toContain('- 요소: `h1.title`');
    expect(text).toContain('- 요소: `span.label`');
    expect(text).toContain('- 이전 값: `8px`');
    expect(text).toContain('- 새 값: `12px`');
    expect(text).toContain('- 새 값: `#333`');
  });

  it('대조 안내와 조건부 안내 2줄을 넣는다 (FR-6)', () => {
    expect(text).toContain('`요소`와 `이전 값`으로 대조');
    expect(text).toContain('`(조상 위치)`는 해당 요소에 위치 표시가 없어');
    expect(text).toContain('`위치 미확인` 항목은 `요소` 요약과 값으로 소스를 직접 찾아 주세요.');
  });

  it('절대 경로·홈 경로·file URL을 넣지 않는다 (AC-6·NFR-2)', () => {
    expect(text).not.toContain('/Users');
    expect(text).not.toContain('~/');
    expect(text).not.toContain('file://');
  });
});

describe('buildPrompt — 조건부 표기 (AC-2)', () => {
  it('위치 있는 항목만 있으면 조상·직접 찾기 안내를 넣지 않는다 (FR-6)', () => {
    const text = buildPrompt(changes(change()));
    expect(text).not.toContain('조상 위치');
    expect(text).not.toContain('직접 찾아');
  });

  it('작성 원문이 없으면 (계산값)을 덧붙인다 (FR-5)', () => {
    const text = buildPrompt(changes(change({ before: { authored: null, computed: '0px' } })));
    expect(text).toContain('- 이전 값: `0px` (계산값)');
  });

  it('stale 항목에 주의 줄을 넣는다 (FR-5)', () => {
    const text = buildPrompt(changes(change({ stale: true })));
    expect(text).toContain('- 주의: 페이지 표시가 바뀌었을 수 있음. 새로고침·HMR로 요소가 교체되었을 수 있습니다.');
    expect(buildPrompt(changes(change()))).not.toContain('- 주의:');
  });
});

describe('buildPrompt — 페이지 URL (AC-3·FR-7)', () => {
  it('같은 페이지 2건이면 머리에 1번만 적는다', () => {
    const text = buildPrompt(changes(change(), change({ id: 'id-2', property: 'color' })));
    expect(count(text, '- 페이지: ')).toBe(1);
    expect(text).toContain(`- 페이지: ${PAGE}`);
  });

  it('페이지가 다르면 항목마다 적는다', () => {
    const text = buildPrompt(
      changes(change(), change({ id: 'id-2', property: 'color', pageUrl: 'http://127.0.0.1:5173/about' })),
    );
    expect(count(text, '- 페이지: ')).toBe(2);
    expect(text).toContain('- 페이지: http://127.0.0.1:5173/about');
  });
});

describe('buildPrompt — 선택 요소 모드 (AC-4·FR-3)', () => {
  it('위치가 있으면 경로·요소·페이지를 적는다', () => {
    const text = buildPrompt({
      kind: 'selection',
      selection: {
        hint: 'div.card',
        located: { location: { file: 'src/App.tsx', line: 12, column: 5 }, inherited: false, protected: false },
        pageUrl: PAGE,
      },
    });
    expect(text.startsWith('# 화면 요소 위치\n\n')).toBe(true);
    expect(text).toContain('이어서 적겠습니다');
    expect(text).toContain('- 위치: `src/App.tsx:12:5` (Vite 루트 기준 상대 경로, 여는 태그 `<` 위치)');
    expect(text).toContain('- 요소: `div.card`');
    expect(text).toContain(`- 페이지: ${PAGE}`);
  });

  it('위치가 없으면 위치 미확인만 적는다 (E-6)', () => {
    const text = buildPrompt({
      kind: 'selection',
      selection: { hint: 'div.card', located: null, pageUrl: PAGE },
    });
    expect(text).toContain('- 위치: 위치 미확인');
    expect(text).not.toContain('Vite 루트 기준');
  });

  it('조상 위치면 조상 표기를 덧붙인다', () => {
    const text = buildPrompt({
      kind: 'selection',
      selection: {
        hint: 'span.label',
        located: { location: { file: 'src/Card.vue', line: 3, column: 1 }, inherited: true, protected: false },
        pageUrl: PAGE,
      },
    });
    expect(text).toContain('- 위치: `src/Card.vue:3:1` (조상 위치) (Vite 루트 기준 상대 경로');
  });
});

describe('buildPrompt — 인라인 코드·빈 값 (AC-5)', () => {
  it('값에 든 가장 긴 백틱보다 1개 긴 펜스를 쓴다 (E-2)', () => {
    const text = buildPrompt(changes(change({ after: 'a``b' })));
    expect(text).toContain('- 새 값: ```a``b```');
  });

  it('백틱으로 시작·끝나는 값은 양쪽에 공백을 둔다 (E-2)', () => {
    const text = buildPrompt(changes(change({ after: '`x`' })));
    expect(text).toContain('- 새 값: `` `x` ``');
  });

  it('빈 새 값은 (빈 값)으로 적는다 (E-3)', () => {
    const text = buildPrompt(changes(change({ after: '   ' })));
    expect(text).toContain('- 새 값: (빈 값)');
  });
});

describe('buildPrompt — 위치 없음·중복·순서 (E-1·E-8·FR-2)', () => {
  it('모든 항목이 위치 없음이면 전부 위치 미확인으로 적고 복사는 그대로 만든다 (E-1)', () => {
    const text = buildPrompt(changes(change({ source: null }), change({ id: 'id-2', source: null, property: 'color' })));
    expect(count(text, '- 위치: 위치 미확인')).toBe(2);
    expect(text).toContain('`위치 미확인` 항목은');
  });

  it('입력 순서를 지키고 중복을 병합하지 않는다 (FR-2·E-8)', () => {
    const first = change({ after: '12px' });
    const second = change({ id: 'id-2', after: '20px' });
    const text = buildPrompt(changes(first, second));
    expect(count(text, '### ')).toBe(2);
    expect(text.indexOf('- 새 값: `12px`')).toBeLessThan(text.indexOf('### 2.'));
    expect(text).toContain('- 새 값: `20px`');
  });

  it('빈 내역이면 머리만 돌려주고 던지지 않는다 (E-1)', () => {
    const text = buildPrompt(changes());
    expect(text.startsWith('# 화면 스타일 변경 반영 요청')).toBe(true);
    expect(text).not.toContain('- 위치: ');
    expect(text).not.toContain('- 페이지: ');
  });
});

describe('buildPrompt — 자가 점검·반영 확인 (AC-1~AC-4)', () => {
  it('내역 모드: 마지막 항목 뒤에 두 섹션을 붙이고 항목 수를 적는다 (AC-1)', () => {
    const text = buildPrompt(changes(change(), change({ id: 'id-2', property: 'color', after: '20px' })));
    expect(count(text, '## 자가 점검')).toBe(1);
    expect(count(text, '## 반영 확인')).toBe(1);
    expect(text).toContain('\n\n## 자가 점검\n');
    expect(text).toContain('\n\n## 반영 확인\n');
    expect(text).toContain('위 2개 항목');
    expect(text.indexOf('## 자가 점검')).toBeGreaterThan(text.indexOf('### 2.'));
    expect(text.indexOf('## 반영 확인')).toBeGreaterThan(text.indexOf('## 자가 점검'));
  });

  it('내역 모드: 확인 수단과 같은 탭 비교 금지를 적는다 (AC-2)', () => {
    const text = buildPrompt(changes(change(), change({ id: 'id-2', property: 'color' })));
    expect(text).toContain('chrome-devtools-mcp');
    expect(text).toContain('별도 브라우저');
    expect(text).toContain('`!important`');
    expect(text).toContain('새로고침');
    expect(text).toContain('`after`');
  });

  it('선택 모드: 위치 있음·없음 모두 두 섹션을 붙이고 after 비교는 없다 (AC-3)', () => {
    const cases = [
      {
        location: { file: 'src/App.tsx', line: 12, column: 5 },
        inherited: false,
        protected: false,
      },
      null,
    ];
    for (const located of cases) {
      const text = buildPrompt({ kind: 'selection', selection: { hint: 'div.card', located, pageUrl: PAGE } });
      expect(count(text, '## 자가 점검')).toBe(1);
      expect(count(text, '## 반영 확인')).toBe(1);
      expect(text).toContain('새로고침');
      expect(text).not.toContain('`after`');
    }
  });

  it('빈 내역: 두 섹션을 붙이지 않는다 (AC-4)', () => {
    const text = buildPrompt(changes());
    expect(text).not.toContain('## 자가 점검');
    expect(text).not.toContain('## 반영 확인');
  });
});

describe('buildPrompt — 런타임 컴포넌트 정보 (AC-7·FR-10)', () => {
  const RUNTIME = {
    name: 'Card',
    definition: { file: 'src/components/Card.tsx', line: 12, column: 5, precision: 'line-unverified' as const },
    callSite: { file: 'src/App.tsx', line: 20, column: 7, precision: 'line-unverified' as const },
    owners: ['Card', 'Layout', 'App'],
    via: 'fiber' as const,
  };

  it('선택 모드: 위치 줄 뒤에 컴포넌트·계층 줄을 넣고 라인 미확인을 표시한다', () => {
    const text = buildPrompt({
      kind: 'selection',
      selection: { hint: 'section.card', located: null, pageUrl: PAGE, component: RUNTIME },
    });
    expect(text).toContain('- 위치: 위치 미확인');
    expect(text).toContain(
      '- 컴포넌트: Card (정의: `src/components/Card.tsx:12:5 (라인 미확인)` / 호출부: `src/App.tsx:20:7 (라인 미확인)`)',
    );
    expect(text).toContain('- 계층: App › Layout › Card');
  });

  it('내역 모드: 컴포넌트가 있는 항목에만 줄을 넣고 위치·요소 줄은 그대로 둔다', () => {
    const text = buildPrompt(changes(change({ component: RUNTIME }), change({ id: 'id-2', property: 'color' })));
    expect(count(text, '- 컴포넌트: Card')).toBe(1);
    expect(count(text, '- 계층: App › Layout › Card')).toBe(1);
    expect(text).toContain('- 위치: `src/App.tsx:12:5`\n- 컴포넌트: Card');
    expect(text).toContain('### 2. `color`\n- 위치: `src/App.tsx:12:5`\n- 요소:');
  });

  it('컴포넌트 정보가 없으면 기존 문자열과 같다', () => {
    const withNull = buildPrompt({ kind: 'selection', selection: { hint: 'div.card', located: null, pageUrl: PAGE, component: null } });
    const withoutField = buildPrompt({ kind: 'selection', selection: { hint: 'div.card', located: null, pageUrl: PAGE } });
    expect(withNull).toBe(withoutField);
    expect(withNull).not.toContain('- 컴포넌트:');
  });

  it('라인을 신뢰할 수 있으면(exact) 라인 미확인을 붙이지 않는다', () => {
    const text = buildPrompt({
      kind: 'selection',
      selection: {
        hint: 'div.card',
        located: null,
        pageUrl: PAGE,
        component: {
          name: 'Card',
          definition: { file: 'src/components/Card.tsx', line: 12, column: 5, precision: 'exact' },
          via: 'devtools',
        },
      },
    });
    expect(text).toContain('- 컴포넌트: Card (정의: `src/components/Card.tsx:12:5`)');
    expect(text).not.toContain('- 계층:');
  });
});

describe('buildPrompt — props·인스턴스 줄과 props 자가 점검 (INT-012 AC-6·AC-11)', () => {
  // prompt.ts 수정 전(HEAD fa6d631) buildPrompt 출력을 그대로 캡처한 골든이다(NFR-1 바이트 동일 비교).
  const GOLDEN_SELECTION = "# 화면 요소 위치\n\n아래 요소에 대한 수정 요청을 이어서 적겠습니다. 소스에서 이 요소를 찾아 요청을 반영해 주세요.\n\n- 위치: `src/App.tsx:12:5` (Vite 루트 기준 상대 경로, 여는 태그 `<` 위치)\n- 컴포넌트: Card (정의: `src/components/Card.tsx:12:5 (라인 미확인)`)\n- 계층: App › Card\n- 요소: `div.card`\n- 페이지: http://127.0.0.1:5173/\n\n## 자가 점검\n- [ ] 선택한 요소에 해당하는 코드만 수정했다(다른 요소·속성 변경 0건).\n- [ ] 바꾼 값이 요청한 변경과 같다(값 표기·단위 차이는 요청 기준으로 맞췄다).\n- [ ] 요청과 무관한 파일·포맷·네이밍 변경이 0건이다(`git diff`로 확인).\n\n## 반영 확인\n- 브라우저 확인 도구가 있으면(예: chrome-devtools-mcp): 이 익스텐션이 설치되지 않은 별도 브라우저에서 위에 적힌 페이지 URL을 새로 열어, 화면이 요청대로 바뀌었는지 확인해 주세요.\n- 편집한 탭에는 보낸 값이 인라인 `!important`로 남아 있어, 같은 탭에서 비교하면 반영에 실패해도 일치로 보입니다.\n- 브라우저 확인 도구가 없으면: 페이지를 새로고침한 뒤 요청한 변경이 화면에 반영되었는지 사용자가 직접 확인하도록 안내해 주세요.";
  const GOLDEN_CHANGES = "# 화면 스타일 변경 반영 요청\n\n아래 CSS 변경을 소스 코드에 반영해 주세요.\n\n- 위치는 Vite 루트 기준 상대 경로(`파일:줄:열`)이며 요소 여는 태그 `<`를 가리킵니다.\n- 편집 후 소스가 바뀌어 줄이 어긋났을 수 있습니다. `요소`와 `이전 값`으로 대조한 뒤 반영하세요.\n- 페이지: http://127.0.0.1:5173/\n\n### 1. `padding-top`\n- 위치: `src/App.tsx:12:5`\n- 컴포넌트: Card (정의: `src/components/Card.tsx:12:5 (라인 미확인)`)\n- 계층: App › Card\n- 요소: `h1.title`\n- 이전 값: `8px`\n- 새 값: `12px`\n\n## 자가 점검\n- [ ] 위 1개 항목이 가리키는 선언에서 바꾼 것은 해당 속성뿐이다(다른 속성·요소 변경 0건).\n- [ ] 각 항목의 새 값이 화면에 적용된 값(`after`)과 같다(`#fff`와 `rgb()`처럼 표기가 다른 값은 정규화해 비교).\n- [ ] 요청과 무관한 파일·포맷·네이밍 변경이 0건이다(`git diff`로 확인).\n\n## 반영 확인\n- 브라우저 확인 도구가 있으면(예: chrome-devtools-mcp): 이 익스텐션이 설치되지 않은 별도 브라우저에서 위에 적힌 페이지 URL을 새로 열고, 각 항목 요소의 계산값을 `after`와 비교해 어긋난 항목을 보고해 주세요.\n- 편집한 탭에는 보낸 값이 인라인 `!important`로 남아 있어, 같은 탭에서 비교하면 반영에 실패해도 일치로 보입니다.\n- 브라우저 확인 도구가 없으면: 페이지를 새로고침한 뒤 각 항목이 요청대로 바뀌었는지 사용자가 직접 확인하도록 안내해 주세요.";
  const PROPS_CHECK = '- [ ] 변경 스타일이 props(variant·size·className 등) 조건부인지 확인하고 해당 분기만 수정할지 판단했다.';
  const LAST_CHECK = '- [ ] 요청과 무관한 파일·포맷·네이밍 변경이 0건이다(`git diff`로 확인).';
  const PROPS = '{ title: "카드", apiToken: ••• }';
  const RUNTIME = {
    name: 'Card',
    definition: { file: 'src/components/Card.tsx', line: 12, column: 5, precision: 'line-unverified' as const },
    owners: ['Card', 'App'],
    via: 'fiber' as const,
  };
  const SELECTION: PromptSelection = {
    hint: 'div.card',
    located: { location: { file: 'src/App.tsx', line: 12, column: 5 }, inherited: false, protected: false },
    pageUrl: PAGE,
    component: RUNTIME,
  };
  const CHANGE: PromptChange = change({ component: RUNTIME });

  function promptChanges(...list: PromptChange[]): PromptInput {
    return { kind: 'changes', changes: list };
  }

  function selection(extra: Partial<PromptSelection> = {}): string {
    return buildPrompt({ kind: 'selection', selection: { ...SELECTION, ...extra } });
  }

  /** FR-12 항목이 `## 자가 점검` 안, 마지막 기존 항목 바로 다음, `## 반영 확인` 앞에 정확히 1번 있는지. */
  function expectPropsCheck(text: string): void {
    expect(count(text, PROPS_CHECK)).toBe(1);
    expect(text).toContain(`${LAST_CHECK}\n${PROPS_CHECK}\n\n## 반영 확인\n`);
    expect(text.indexOf(PROPS_CHECK)).toBeGreaterThan(text.indexOf('## 자가 점검'));
    expect(text.indexOf(PROPS_CHECK)).toBeLessThan(text.indexOf('## 반영 확인'));
  }

  it('값이 없으면 수정 전 출력과 바이트 단위로 같다', () => {
    expect(selection()).toBe(GOLDEN_SELECTION);
    expect(buildPrompt(promptChanges(CHANGE))).toBe(GOLDEN_CHANGES);
  });

  it('선택 모드: 컴포넌트·계층 → props → 인스턴스 → 요소 순으로 줄을 넣는다', () => {
    const text = selection({ props: PROPS, instanceCount: { count: 4, capped: false } });
    expect(text).toContain(
      `- 계층: App › Card\n- props: ${PROPS}\n- 인스턴스: 4개(같은 컴포넌트, 수정 시 함께 바뀜)\n- 요소: \`div.card\``,
    );
    expectPropsCheck(text);
  });

  it('상한에 닿은 인스턴스 수는 N+개로 적는다', () => {
    const text = selection({ instanceCount: { count: 20000, capped: true } });
    expect(text).toContain('- 인스턴스: 20000+개(같은 컴포넌트, 수정 시 함께 바뀜)');
  });

  it('내역 모드: props·인스턴스가 있는 항목에만 줄을 넣는다', () => {
    const text = buildPrompt(
      promptChanges(
        { ...CHANGE, props: PROPS, instanceCount: { count: 4, capped: false } },
        change({ id: 'id-2', property: 'color' }),
      ),
    );
    expect(count(text, '- props: ')).toBe(1);
    expect(count(text, '- 인스턴스: ')).toBe(1);
    expect(text).toContain(`- 계층: App › Card\n- props: ${PROPS}\n- 인스턴스: 4개(같은 컴포넌트, 수정 시 함께 바뀜)\n- 요소:`);
    expect(text).toContain('### 2. `color`\n- 위치: `src/App.tsx:12:5`\n- 요소:');
    expectPropsCheck(text);
  });

  it('내역 모드: 여러 항목에 props가 있어도 자가 점검 항목은 1번만 붙는다 (E-16)', () => {
    const text = buildPrompt(
      promptChanges(
        { ...CHANGE, props: PROPS },
        { ...change({ id: 'id-2', property: 'color' }), props: '{}' },
        change({ id: 'id-3', property: 'margin-top' }),
      ),
    );
    expect(count(text, '- props: ')).toBe(2);
    expectPropsCheck(text);
  });

  it('instanceCount만 있으면 인스턴스 줄은 나오지만 자가 점검 항목은 없다 (E-17)', () => {
    const selectionText = selection({ instanceCount: { count: 4, capped: false } });
    expect(selectionText).toContain('- 인스턴스: 4개');
    expect(selectionText).not.toContain(PROPS_CHECK);
    expect(selectionText.slice(selectionText.indexOf('\n\n## 자가 점검'))).toBe(
      GOLDEN_SELECTION.slice(GOLDEN_SELECTION.indexOf('\n\n## 자가 점검')),
    );

    const changesText = buildPrompt(promptChanges({ ...CHANGE, instanceCount: { count: 4, capped: false } }));
    expect(changesText).toContain('- 인스턴스: 4개');
    expect(changesText).not.toContain(PROPS_CHECK);
    expect(changesText.slice(changesText.indexOf('\n\n## 자가 점검'))).toBe(
      GOLDEN_CHANGES.slice(GOLDEN_CHANGES.indexOf('\n\n## 자가 점검')),
    );
  });
});

describe('buildPrompt — 라이브러리 위치 폴백 줄 (INT-013 AC-2)', () => {
  const COMPONENT = {
    name: 'MuiTypographyRoot',
    definition: { file: 'src/MainMenuView.jsx', line: 42, column: 7, precision: 'exact' as const },
    owners: ['MuiTypographyRoot', 'Typography', 'MainMenuView'],
    via: 'fiber' as const,
  };
  const FALLBACK_LINE = '- 위치 폴백: 라이브러리 컴포넌트 `MuiTypographyRoot` → 사용처 위치(가장 가까운 프로젝트 컴포넌트)';

  it('선택 모드: 컴포넌트 줄 뒤·계층 줄 앞에 1번 넣는다', () => {
    const text = buildPrompt({
      kind: 'selection',
      selection: { hint: 'span.MuiTypography-root', located: null, pageUrl: PAGE, component: COMPONENT, fallbackFrom: 'MuiTypographyRoot' },
    });
    expect(count(text, FALLBACK_LINE)).toBe(1);
    expect(text).toContain(`)\n${FALLBACK_LINE}\n- 계층: `);
  });

  it('내역 모드: fallbackFrom이 있는 항목에만 1번 넣는다', () => {
    const text = buildPrompt(
      changes(change({ component: COMPONENT, fallbackFrom: 'MuiTypographyRoot' }), change({ id: 'id-2', property: 'color', component: COMPONENT })),
    );
    expect(count(text, FALLBACK_LINE)).toBe(1);
    expect(text.indexOf(FALLBACK_LINE)).toBeLessThan(text.indexOf('- 계층: '));
  });

  it('fallbackFrom이 없으면 기존 출력과 같다', () => {
    const selection: PromptSelection = { hint: 'span', located: null, pageUrl: PAGE, component: COMPONENT };
    const text = buildPrompt({ kind: 'selection', selection });
    expect(text).not.toContain('위치 폴백');
    expect(buildPrompt(changes(change({ component: COMPONENT })))).not.toContain('위치 폴백');
  });
});

describe('buildPrompt — 런타임 위치 정확도 표기 (INT-013 AC-5)', () => {
  const unverified = change({
    source: { file: 'src/X.tsx', line: 1, column: 1, inherited: false, precision: 'line-unverified' },
  });
  const exact = change({
    id: 'id-2',
    property: 'color',
    source: { file: 'src/Y.tsx', line: 5, column: 3, inherited: false, precision: 'exact' },
  });
  const NOTE = '- `(React 런타임 위치)`·`(라인 미확인)` 항목은 빌드 플러그인 없이 React 런타임에서 얻은 위치입니다.';

  it('line-unverified·exact 위치에 정확도를 백틱 밖에 덧붙인다', () => {
    const text = buildPrompt(changes(unverified, exact));
    expect(text).toContain('- 위치: `src/X.tsx:1:1` (라인 미확인)');
    expect(text).toContain('- 위치: `src/Y.tsx:5:3` (React 런타임 위치)');
  });

  it('조상 표기 뒤에 정확도를 붙인다', () => {
    const inherited = change({ source: { file: 'src/X.tsx', line: 2, column: 1, inherited: true, precision: 'exact' } });
    expect(buildPrompt(changes(inherited))).toContain('- 위치: `src/X.tsx:2:1` (조상 위치) (React 런타임 위치)');
  });

  it('precision이 있는 항목이 있을 때만 안내 줄을 1번 넣는다', () => {
    expect(count(buildPrompt(changes(unverified, exact)), NOTE)).toBe(1);
    const plain = buildPrompt(changes(change(), change({ id: 'id-2', source: null })));
    expect(plain).not.toContain(NOTE);
    expect(plain).not.toContain('React 런타임 위치');
  });
});

describe('changesPromptInput·copyStatusText — 복사 버튼 2개 (INT-013 Step 7)', () => {
  it('내역이 0건이면 null', () => {
    expect(changesPromptInput([], new Map())).toBeNull();
  });

  it('props를 changeKey로 붙이고 없는 항목은 그대로 둔다', () => {
    const first = change();
    const second = change({ id: 'id-2', property: 'color' });
    const input = changesPromptInput([first, second], new Map([[changeKey(first), '{ variant: "h1" }']]));
    expect(input?.kind).toBe('changes');
    const list = input?.kind === 'changes' ? input.changes : [];
    expect(list[0]).toEqual({ ...first, props: '{ variant: "h1" }' });
    expect(list[1]).toBe(second);
  });

  it('선택 모드 문구에는 위치 미확인 건수가 없다', () => {
    const text = copyStatusText({ kind: 'selection', selection: { hint: 'div', located: null, pageUrl: PAGE } });
    expect(text).toBe('프롬프트를 복사했습니다: 선택 요소 위치');
    expect(text).not.toContain('위치 미확인');
  });

  it('내역 모드 문구는 전체·위치 미확인 건수를 정확히 적는다', () => {
    const input = changesPromptInput([change(), change({ id: 'id-2', source: null, selectorHint: 'em' })], new Map());
    expect(input && copyStatusText(input)).toBe('프롬프트를 복사했습니다: 변경 2건(위치 미확인 1건)');
  });
});
