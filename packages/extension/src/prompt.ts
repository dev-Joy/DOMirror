import { formatSourceLocation } from '@domirror/shared';
import { originalValue, type LocalChange } from './change-log.js';
import type { Located } from './source-locator.js';

// 패널의 "AI 프롬프트 복사"가 클립보드에 넣을 한국어 마크다운을 만든다(FR-2~FR-7).
// DOM·chrome·location에 의존하지 않는 순수 함수다. 선택 요소 정보는 호출 측이 계산해 넘긴다(NFR-4).

/** 변경 내역이 없을 때 복사할 선택 요소 정보(호출 측이 #selected에서 계산). */
export interface PromptSelection {
  hint: string;
  /** `locate(el)` 결과. null이면 위치 미확인(E-6). */
  located: Located | null;
  pageUrl: string;
}

export type PromptInput =
  | { kind: 'changes'; changes: readonly LocalChange[] }
  | { kind: 'selection'; selection: PromptSelection };

/** 프롬프트에 적는 위치 값. `LocalChange.source`와 같은 모양이다. */
type PromptSource = NonNullable<LocalChange['source']>;

/** 마크다운 인라인 코드. 값에 든 가장 긴 연속 백틱보다 1개 긴 펜스를 쓴다(E-2). */
function inlineCode(value: string): string {
  // 여러 줄 값은 목록 항목을 깨뜨리므로 한 줄로 눌러 적는다.
  const flat = value.replace(/\r?\n/g, ' ');
  let longest = 0;
  for (const run of flat.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  // 백틱이 없으면 1개, 있으면 그 연속 길이+1개라 값 안의 백틱과 겹치지 않는다(spec §6 초안 형식 유지).
  const fence = '`'.repeat(longest + 1);
  // 값이 백틱으로 시작·끝나면 펜스와 붙어 마크다운이 깨지므로 양쪽에 공백을 둔다(E-2).
  const pad = flat.startsWith('`') || flat.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${flat}${pad}${fence}`;
}

// 경로는 `source.file`을 그대로 쓴다(절대 경로·홈 경로 조합 금지, NFR-2).
function where(source: PromptSource | null): string {
  if (!source) return '위치 미확인';
  const path = inlineCode(formatSourceLocation(source));
  return source.inherited ? `${path} (조상 위치)` : path;
}

/** 새 값: 값 삭제(빈 문자열)는 `(빈 값)`으로 표기한다(E-3). */
function valueText(after: string): string {
  return after.trim() === '' ? '(빈 값)' : inlineCode(after);
}

/** 이전 값: 작성 원문이 없으면 계산값에서 가져왔다는 표시를 덧붙인다(FR-5). */
function beforeText(c: LocalChange): string {
  const value = inlineCode(originalValue(c));
  return c.before.authored === null ? `${value} (계산값)` : value;
}

/** 프롬프트 말미의 자가 점검·반영 확인 섹션. 항목이 있을 때만 붙인다(FR-1·FR-3, D-S1). */
function changesFooter(count: number): string[] {
  return [
    '',
    '## 자가 점검',
    `- [ ] 위 ${count}개 항목이 가리키는 선언에서 바꾼 것은 해당 속성뿐이다(다른 속성·요소 변경 0건).`,
    '- [ ] 각 항목의 새 값이 화면에 적용된 값(`after`)과 같다(`#fff`와 `rgb()`처럼 표기가 다른 값은 정규화해 비교).',
    '- [ ] 요청과 무관한 파일·포맷·네이밍 변경이 0건이다(`git diff`로 확인).',
    '',
    '## 반영 확인',
    '- 브라우저 확인 도구가 있으면(예: chrome-devtools-mcp): 이 익스텐션이 설치되지 않은 별도 브라우저에서 위에 적힌 페이지 URL을 새로 열고, 각 항목 요소의 계산값을 `after`와 비교해 어긋난 항목을 보고해 주세요.',
    '- 편집한 탭에는 보낸 값이 인라인 `!important`로 남아 있어, 같은 탭에서 비교하면 반영에 실패해도 일치로 보입니다.',
    '- 브라우저 확인 도구가 없으면: 페이지를 새로고침한 뒤 각 항목이 요청대로 바뀌었는지 사용자가 직접 확인하도록 안내해 주세요.',
  ];
}

/** 선택 모드 말미 섹션. 선택 모드에는 `after`가 없어 값 비교 문구를 쓰지 않는다(FR-2·FR-4, D-S4). */
function selectionFooter(): string[] {
  return [
    '',
    '## 자가 점검',
    '- [ ] 선택한 요소에 해당하는 코드만 수정했다(다른 요소·속성 변경 0건).',
    '- [ ] 바꾼 값이 요청한 변경과 같다(값 표기·단위 차이는 요청 기준으로 맞췄다).',
    '- [ ] 요청과 무관한 파일·포맷·네이밍 변경이 0건이다(`git diff`로 확인).',
    '',
    '## 반영 확인',
    '- 브라우저 확인 도구가 있으면(예: chrome-devtools-mcp): 이 익스텐션이 설치되지 않은 별도 브라우저에서 위에 적힌 페이지 URL을 새로 열어, 화면이 요청대로 바뀌었는지 확인해 주세요.',
    '- 편집한 탭에는 보낸 값이 인라인 `!important`로 남아 있어, 같은 탭에서 비교하면 반영에 실패해도 일치로 보입니다.',
    '- 브라우저 확인 도구가 없으면: 페이지를 새로고침한 뒤 요청한 변경이 화면에 반영되었는지 사용자가 직접 확인하도록 안내해 주세요.',
  ];
}

function changesPrompt(changes: readonly LocalChange[]): string {
  const lines = [
    '# 화면 스타일 변경 반영 요청',
    '',
    '아래 CSS 변경을 소스 코드에 반영해 주세요.',
    '',
    '- 위치는 Vite 루트 기준 상대 경로(`파일:줄:열`)이며 요소 여는 태그 `<`를 가리킵니다.',
    '- 편집 후 소스가 바뀌어 줄이 어긋났을 수 있습니다. `요소`와 `이전 값`으로 대조한 뒤 반영하세요.',
  ];
  // 조건부 안내는 해당 항목이 있을 때만 넣는다(FR-6·AC-2).
  if (changes.some((c) => c.source?.inherited === true)) {
    lines.push('- `(조상 위치)`는 해당 요소에 위치 표시가 없어 가장 가까운 조상 요소의 위치를 적은 것입니다.');
  }
  if (changes.some((c) => c.source === null)) {
    lines.push('- `위치 미확인` 항목은 `요소` 요약과 값으로 소스를 직접 찾아 주세요.');
  }
  const urls = new Set(changes.map((c) => c.pageUrl));
  // 모두 같은 페이지면 머리에 1번만, 다르면 항목마다 적는다(FR-7).
  const commonUrl = urls.size === 1 ? changes[0].pageUrl : null;
  if (commonUrl !== null) lines.push(`- 페이지: ${commonUrl}`);

  // 순서는 내역 순서를 따르고 병합·중복 제거를 하지 않는다(FR-2·E-8).
  for (const [index, c] of changes.entries()) {
    lines.push(
      '',
      `### ${index + 1}. \`${c.property}\``,
      `- 위치: ${where(c.source)}`,
      `- 요소: ${inlineCode(c.selectorHint)}`,
      `- 이전 값: ${beforeText(c)}`,
      `- 새 값: ${valueText(c.after)}`,
    );
    if (c.stale) lines.push('- 주의: 페이지 표시가 바뀌었을 수 있음. 새로고침·HMR로 요소가 교체되었을 수 있습니다.');
    if (commonUrl === null) lines.push(`- 페이지: ${c.pageUrl}`);
  }
  // 자가 점검·반영 확인은 항목이 있을 때만 붙인다(FR-5·E-1).
  if (changes.length > 0) lines.push(...changesFooter(changes.length));
  return lines.join('\n');
}

function selectionPrompt(selection: PromptSelection): string {
  const { located, hint, pageUrl } = selection;
  const source: PromptSource | null = located ? { ...located.location, inherited: located.inherited } : null;
  // 위치가 없으면 경로 안내를 붙이지 않는다(E-6).
  const location = source ? `${where(source)} (Vite 루트 기준 상대 경로, 여는 태그 \`<\` 위치)` : where(null);
  return [
    '# 화면 요소 위치',
    '',
    '아래 요소에 대한 수정 요청을 이어서 적겠습니다. 소스에서 이 요소를 찾아 요청을 반영해 주세요.',
    '',
    `- 위치: ${location}`,
    `- 요소: ${inlineCode(hint)}`,
    `- 페이지: ${pageUrl}`,
    ...selectionFooter(),
  ].join('\n');
}

/** 한국어 마크다운 구현 프롬프트(FR-2~FR-7). 빈 내역이어도 머리만 돌려준다. */
export function buildPrompt(input: PromptInput): string {
  if (input.kind === 'selection') return selectionPrompt(input.selection);
  return changesPrompt(input.changes);
}
