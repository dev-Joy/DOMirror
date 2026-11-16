import { formatSourceLocation } from '@domirror/shared';
import type { BlockedReason } from './picker.js';
import type { Located } from './source-locator.js';

// 패널의 위치 표시 영역(FR-5). 패널 셸(포트·전송·상태)은 content.ts에 있다.

export type LocationView =
  | { kind: 'idle' }
  | { kind: 'blocked'; reason: BlockedReason }
  | { kind: 'selected'; hint: string; located: Located | null; sameSource: number };

export const LOCATION_CSS = `
.loc { margin: 0 0 8px; }
.loc p { margin: 0 0 4px; word-break: break-all; }
.loc .path { font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
.loc .badge {
  display: inline-block;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 10px;
  background: #fff8c5;
  color: #6f4e00;
  font: 11px/1.6 system-ui, -apple-system, sans-serif;
}
.loc .muted { color: #59636e; }
.loc .warn { color: #9a6700; }
`;

const BLOCKED_TEXT: Record<BlockedReason, string> = {
  'shadow-dom': 'Shadow DOM 내부 요소는 선택할 수 없습니다.',
  iframe: 'iframe 내부 요소는 선택할 수 없습니다.',
};

function line(className: string, text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.className = className;
  p.textContent = text;
  return p;
}

/** 위치 표시 영역을 `view` 상태로 다시 그린다. */
export function renderLocation(container: HTMLElement, view: LocationView): void {
  const box = document.createElement('div');
  box.className = 'loc';

  if (view.kind === 'idle') {
    box.append(line('muted', '페이지에서 요소를 클릭해 선택하세요.'));
  } else if (view.kind === 'blocked') {
    box.append(line('warn', BLOCKED_TEXT[view.reason]));
  } else if (view.located) {
    const path = line('path', formatSourceLocation(view.located.location));
    if (view.located.inherited) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = '조상 위치';
      path.append(badge);
    }
    box.append(path);
    if (view.sameSource >= 2) box.append(line('muted', `같은 소스에서 나온 요소 ${view.sameSource}개`));
    box.append(line('muted', view.hint));
  } else {
    box.append(line('warn', '소스 위치 없음: 이 요소와 조상에 위치 속성이 없어 전송 대상에서 제외됩니다.'));
    box.append(line('muted', view.hint));
  }

  container.replaceChildren(box);
}
