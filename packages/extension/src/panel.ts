import { formatSourceLocation } from '@domirror/shared';
import { originalValue, type LocalChange } from './change-log.js';
import type { BlockedReason } from './picker.js';
import { parsePickerColor } from './color.js';
import { EDITABLE_PROPERTIES, PROPERTY_GROUP_LABELS, containerOf, type PropertyGroup } from './properties.js';
import type { Located, LocatedComponent } from './source-locator.js';

// 패널의 위치 표시(FR-5)·편집 필드(FR-6)·변경 목록(FR-7·8) 영역과 선택 요소 강조.
// 패널 셸(포트·전송·상태)은 content.ts에 있다.

export type LocationView =
  | { kind: 'idle' }
  | { kind: 'blocked'; reason: BlockedReason }
  | {
      kind: 'selected';
      hint: string;
      located: Located | null;
      sameSource: number;
      /** 컴포넌트 정보(있으면 이름·정의 위치·DS 여부를 함께 표시, FR-9·E-9). */
      component?: LocatedComponent | null;
    };

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
.loc .component { font-weight: 600; }
.loc .badge.ds { background: #1a7f37; color: #ffffff; }
`;

const BLOCKED_TEXT: Record<BlockedReason, string> = {
  'shadow-dom': 'Shadow DOM 내부 요소는 선택할 수 없습니다.',
  iframe: 'iframe 내부 요소는 선택할 수 없습니다.',
};

export function line(className: string, text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.className = className;
  p.textContent = text;
  return p;
}

/** 컴포넌트 줄(이름 + DS 배지, 정의 위치). 정보가 없으면 흐린 안내 1줄(E-9). */
function componentLines(component: LocatedComponent | null | undefined): HTMLParagraphElement[] {
  if (!component) return [line('muted', '컴포넌트 정보 없음')];

  const name = line('component', `컴포넌트: ${component.name}`);
  if (component.designSystem) {
    const badge = document.createElement('span');
    badge.className = 'badge ds';
    badge.textContent = 'DS';
    name.append(badge);
  }
  return [name, line('muted', `정의: ${component.source}`)];
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
    box.append(...componentLines(view.component));
    if (view.sameSource >= 2) box.append(line('muted', `같은 소스에서 나온 요소 ${view.sameSource}개`));
    box.append(line('muted', view.hint));
  } else {
    // 소스 위치가 없어도 컴포넌트 정보가 있으면 먼저 보여 주고 기존 경고를 이어 붙인다(FR-9).
    if (view.component) box.append(...componentLines(view.component));
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
.editor select { box-sizing: border-box; width: 100%; font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
.editor .color-row { display: flex; gap: 4px; }
.editor .color-row input[type="text"] { flex: 1; min-width: 0; }
.editor input[type="color"] { flex: none; width: 28px; padding: 0; }
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
.editor input:disabled, .editor select:disabled, .changes button:disabled { cursor: progress; }
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

/** 선택 요소의 편집 필드를 그린다. `values`는 속성별 현재 값(계산값). null이면 선택 없음. `disabled`면 전송 중 잠금으로 입력 필드를 비활성화한다. */
export function renderEditor(
  container: HTMLElement,
  values: Readonly<Record<string, string>> | null,
  handlers: EditorHandlers,
  disabled = false,
): void {
  if (!values) {
    container.replaceChildren();
    return;
  }
  const box = document.createElement('div');
  box.className = 'editor';
  let grid: HTMLDivElement | null = null;
  let group: PropertyGroup | null = null;
  // 컨테이너 조건 속성은 선택 요소 display가 해당 종류일 때만 그린다(FR-5·FR-6).
  const layoutContainer = containerOf(values.display);
  const visible = EDITABLE_PROPERTIES.filter(
    (p) => !p.containers || (layoutContainer !== null && p.containers.includes(layoutContainer)),
  );
  for (const { name, group: g, options } of visible) {
    if (g !== group || !grid) {
      group = g;
      box.append(line('group', PROPERTY_GROUP_LABELS[g]));
      grid = document.createElement('div');
      grid.className = 'grid';
      box.append(grid);
    }
    const label = document.createElement('label');
    label.textContent = name;
    const current = values[name] ?? '';
    if (options) {
      // 키워드 선택지는 select로 그리고, 선택지에 없는 현재 값은 맨 앞에 둔다(FR-7·FR-10).
      const select = document.createElement('select');
      select.dataset.property = name;
      select.disabled = disabled;
      if (!options.includes(current)) select.append(new Option(current, current));
      for (const v of options) select.append(new Option(v, v));
      select.value = current;
      select.addEventListener('change', () => handlers.onEdit(name, select.value));
      label.append(select);
      grid.append(label);
      continue;
    }
    const input = document.createElement('input');
    input.type = 'text';
    input.dataset.property = name;
    input.value = current;
    input.spellcheck = false;
    input.disabled = disabled;
    input.addEventListener('change', () => handlers.onEdit(name, input.value));
    if (g === 'color') {
      // 색 필드는 텍스트 입력 옆에 피커를 둔다. 변환 불가 값은 #000000(FR-1~FR-3·FR-10).
      const parsed = parsePickerColor(current);
      const picker = document.createElement('input');
      picker.type = 'color';
      picker.dataset.property = name;
      picker.value = parsed?.hex ?? '#000000';
      picker.disabled = disabled;
      if (parsed && parsed.alpha < 1) picker.title = '알파 값은 텍스트로 편집하세요(피커는 불투명 색만 지원)';
      // Q-1=(a): 피커 확정(change) 시에만 반영한다.
      picker.addEventListener('change', () => {
        input.value = picker.value;
        handlers.onEdit(name, picker.value);
      });
      const row = document.createElement('span');
      row.className = 'color-row';
      row.append(input, picker);
      label.append(row);
    } else {
      label.append(input);
    }
    grid.append(label);
  }
  container.replaceChildren(box);
}

export interface ChangesHandlers {
  onRevert(id: string): void;
  onRevertAll(): void;
}

export function button(text: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

/** 변경 목록(개별·전체 되돌리기). 비어 있으면 영역을 비운다. `disabled`면 전송 중 잠금으로 되돌리기 버튼을 비활성화한다. */
export function renderChanges(
  container: HTMLElement,
  log: readonly LocalChange[],
  handlers: ChangesHandlers,
  disabled = false,
): void {
  if (log.length === 0) {
    container.replaceChildren();
    return;
  }
  const box = document.createElement('div');
  box.className = 'changes';

  const head = document.createElement('p');
  head.className = 'head';
  head.append(`변경 내역 ${log.length}건`, button('전체 되돌리기', () => handlers.onRevertAll(), disabled));

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
    if (originalValue(c) === c.after.trim()) body.append(line('muted', '같은 소스의 다른 요소는 원래 값과 다르게 편집되어 있음'));
    body.append(line('muted', c.selectorHint));
    if (c.stale) body.append(line('warn', '페이지 표시가 사라졌을 수 있음(새로고침·HMR·재활성화로 요소가 바뀜)'));
    item.append(body, button('되돌리기', () => handlers.onRevert(c.id), disabled));
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
