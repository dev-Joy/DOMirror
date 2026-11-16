import { formatSourceLocation } from '@domirror/shared';
import { originalValue, type LocalChange } from './change-log.js';
import type { BlockedReason } from './picker.js';
import { EDITABLE_PROPERTIES, PROPERTY_GROUP_LABELS, type PropertyGroup } from './properties.js';
import type { Located } from './source-locator.js';

// 패널의 위치 표시(FR-5)·편집 필드(FR-6)·변경 목록(FR-7·8) 영역과 선택 요소 강조.
// 패널 셸(포트·전송·상태)은 content.ts에 있다.

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

export const EDITOR_CSS = `
.editor { margin: 8px 0 0; }
.editor .group { margin: 6px 0 2px; color: #59636e; font-size: 12px; font-weight: 600; }
.editor .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 8px; }
.editor label { display: flex; flex-direction: column; min-width: 0; font-size: 11px; color: #59636e; }
.editor input { box-sizing: border-box; width: 100%; font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
.changes { margin: 10px 0 0; padding-top: 8px; border-top: 1px solid #d0d4da; }
.changes .head { display: flex; justify-content: space-between; align-items: center; margin: 0 0 6px; font-weight: 600; }
.changes ul { list-style: none; margin: 0; padding: 0; }
.changes li { display: flex; gap: 6px; align-items: flex-start; padding: 4px 0; border-bottom: 1px solid #eaeef2; }
.changes li .body { flex: 1; min-width: 0; }
.changes li p { margin: 0; word-break: break-all; }
.changes .path { font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; color: #59636e; }
.changes .diff { font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
.changes .warn { color: #9a6700; font-size: 11px; }
.changes .muted { color: #59636e; }
.changes button { font: inherit; font-size: 12px; cursor: pointer; }
.selected-outline {
  position: fixed;
  box-sizing: border-box;
  border: 2px solid #bf3989;
  pointer-events: none;
  z-index: 2147483645;
}
.selected-outline[hidden] { display: none; }
`;

export interface EditorHandlers {
  /** 입력 확정(Enter·포커스 이동) 시 호출된다. */
  onEdit(property: string, value: string): void;
}

/** 선택 요소의 편집 필드를 그린다. `values`는 속성별 현재 값(계산값). null이면 선택 없음. */
export function renderEditor(container: HTMLElement, values: Readonly<Record<string, string>> | null, handlers: EditorHandlers): void {
  if (!values) {
    container.replaceChildren();
    return;
  }
  const box = document.createElement('div');
  box.className = 'editor';
  let grid: HTMLDivElement | null = null;
  let group: PropertyGroup | null = null;
  for (const { name, group: g } of EDITABLE_PROPERTIES) {
    if (g !== group || !grid) {
      group = g;
      box.append(line('group', PROPERTY_GROUP_LABELS[g]));
      grid = document.createElement('div');
      grid.className = 'grid';
      box.append(grid);
    }
    const label = document.createElement('label');
    label.textContent = name;
    const input = document.createElement('input');
    input.type = 'text';
    input.dataset.property = name;
    input.value = values[name] ?? '';
    input.spellcheck = false;
    input.addEventListener('change', () => handlers.onEdit(name, input.value));
    label.append(input);
    grid.append(label);
  }
  container.replaceChildren(box);
}

export interface ChangesHandlers {
  onRevert(id: string): void;
  onRevertAll(): void;
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

/** 변경 목록(개별·전체 되돌리기). 비어 있으면 영역을 비운다. */
export function renderChanges(container: HTMLElement, log: readonly LocalChange[], handlers: ChangesHandlers): void {
  if (log.length === 0) {
    container.replaceChildren();
    return;
  }
  const box = document.createElement('div');
  box.className = 'changes';

  const head = document.createElement('p');
  head.className = 'head';
  head.append(`변경 내역 ${log.length}건`, button('전체 되돌리기', () => handlers.onRevertAll()));

  const list = document.createElement('ul');
  for (const c of log) {
    const item = document.createElement('li');
    item.dataset.id = c.id;
    const body = document.createElement('div');
    body.className = 'body';
    const where = c.source
      ? `${formatSourceLocation(c.source)}${c.source.inherited ? ' (조상 위치)' : ''}`
      : '소스 위치 없음 — 전송 제외';
    body.append(line(c.source ? 'path' : 'path warn', where));
    body.append(line('diff', `${c.property}: ${originalValue(c)} → ${c.after}`));
    body.append(line('muted', c.selectorHint));
    if (c.stale) body.append(line('warn', '페이지 표시가 사라졌을 수 있음(새로고침·재활성화 전 편집)'));
    item.append(body, button('되돌리기', () => handlers.onRevert(c.id)));
    list.append(item);
  }
  box.append(head, list);
  container.replaceChildren(box);
}

export interface SelectionHighlight {
  set(el: Element | null): void;
  dispose(): void;
}

/**
 * 선택 요소의 지속 강조. hover 윤곽선(picker)과 다른 색·채움 없음으로 구분하며, 패널 Shadow root 안에만 그린다.
 * 편집·스크롤·레이아웃 변화에 따라가도록 선택 중에는 매 프레임 위치를 맞춘다.
 */
export function createSelectionHighlight(root: ShadowRoot): SelectionHighlight {
  const box = document.createElement('div');
  box.className = 'selected-outline';
  box.hidden = true;
  root.append(box);
  let target: Element | null = null;
  let frame = 0;
  let last = '';

  const draw = (): void => {
    frame = 0;
    if (!target) return;
    if (!target.isConnected) {
      box.hidden = true;
      last = '';
    } else {
      const r = target.getBoundingClientRect();
      const next = `${r.left},${r.top},${r.width},${r.height}`;
      if (next !== last) {
        last = next;
        box.style.left = `${r.left}px`;
        box.style.top = `${r.top}px`;
        box.style.width = `${r.width}px`;
        box.style.height = `${r.height}px`;
      }
      box.hidden = false;
    }
    frame = requestAnimationFrame(draw);
  };

  return {
    set(el) {
      target = el;
      last = '';
      cancelAnimationFrame(frame);
      frame = 0;
      if (el) draw();
      else box.hidden = true;
    },
    dispose() {
      target = null;
      cancelAnimationFrame(frame);
      frame = 0;
      box.remove();
    },
  };
}
