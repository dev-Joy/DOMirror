import { describe, expect, it } from 'vitest';
import type { LocalChange } from '../src/change-log.js';
import { buildPrompt, type PromptInput } from '../src/prompt.js';

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
