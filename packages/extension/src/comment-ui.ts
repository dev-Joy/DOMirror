import { formatSourceLocation, type ScreenCommentInput } from '@domirror/shared';
import { commentWhere, type CommentSendState, type LocalComment } from './comment-log.js';
import { button, line } from './panel.js';
import { sameSourceSelector } from './source-locator.js';

// 패널의 코멘트 입력·목록(FR-1·FR-7)과 화면 위 핀(FR-6·E-2·E-4). 렌더링만 하고 상태는 content.ts가 갖는다.
// 모든 텍스트는 textContent로만 넣는다(NFR-6). 핀·툴팁은 패널 Shadow root 안에 그린다(NFR-3).

export const COMMENTS_CSS = `
.comment-box { margin: 10px 0 0; padding-top: 8px; border-top: 1px solid #d0d4da; }
.comment-form { display: flex; flex-direction: column; gap: 4px; margin: 0 0 8px; }
.comment-form textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 54px;
  resize: vertical;
  font: 12px/1.4 system-ui, -apple-system, sans-serif;
}
.comment-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.comment-counter { color: #59636e; font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
.comment-form button { font: inherit; font-size: 12px; cursor: pointer; }
.comment-form button:disabled { cursor: not-allowed; }
.comment-hint { margin: 0; color: #59636e; font-size: 11px; word-break: break-word; }
.comment-count { margin: 0 0 6px; color: #59636e; font-size: 12px; font-weight: 600; }
.comment-list { list-style: none; margin: 0; padding: 0; }
.comment-item { display: flex; gap: 6px; align-items: flex-start; padding: 4px 0; border-bottom: 1px solid #eaeef2; }
.comment-body { flex: 1; min-width: 0; }
.comment-item p { margin: 0; word-break: break-all; }
.comment-number {
  flex: none;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  background: #bf3989;
  color: #ffffff;
  font: 11px/18px system-ui, -apple-system, sans-serif;
  text-align: center;
}
.comment-where { font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; color: #59636e; }
.comment-preview { font-size: 12px; }
.comment-state { color: #59636e; font-size: 11px; }
.comment-state[data-kind='error'] { color: #cf222e; }
.comment-state[data-kind='ok'] { color: #1a7f37; }
.comment-badge {
  display: inline-block;
  margin: 2px 4px 0 0;
  padding: 0 6px;
  border-radius: 10px;
  background: #eaeef2;
  color: #59636e;
  font: 11px/1.6 system-ui, -apple-system, sans-serif;
}
.comment-item button { flex: none; font: inherit; font-size: 12px; cursor: pointer; }
.comment-pin {
  position: fixed;
  box-sizing: border-box;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border: 1px solid #ffffff;
  border-radius: 9px;
  background: #bf3989;
  color: #ffffff;
  font: 11px/16px system-ui, -apple-system, sans-serif;
  text-align: center;
  cursor: pointer;
  pointer-events: auto;
  z-index: 2147483644;
  box-shadow: 0 1px 4px rgb(0 0 0 / 0.3);
}
.comment-tip {
  position: fixed;
  box-sizing: border-box;
  max-width: 240px;
  padding: 6px 8px;
  border-radius: 6px;
  background: #1f2328;
  color: #ffffff;
  font: 12px/1.4 system-ui, -apple-system, sans-serif;
  pointer-events: auto;
  z-index: 2147483644;
}
.comment-tip-body { margin: 0 0 2px; word-break: break-word; }
.comment-tip-where {
  margin: 0;
  color: #d0d7de;
  font: 10px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  word-break: break-all;
}
[hidden] { display: none; }
`;

export const COMMENT_BODY_MAX = 2000;

export interface CommentFormState {
  /** 요소 선택·소스 위치가 있어 제출할 수 있는 상태인지(FR-1·E-1). */
  canSubmit: boolean;
  /** 버튼 아래 안내 문구. 없으면 숨긴다. */
  hint?: string;
  /** 전송 중 잠금. */
  disabled?: boolean;
}

export interface CommentFormControl {
  /** 힌트·비활성만 갱신한다. 초안·커서는 유지한다. */
  setState(state: CommentFormState): void;
  /** 제출 뒤 본문·카운터·안내를 초기화한다. */
  clear(): void;
}

/**
 * 코멘트 입력 폼을 한 번만 마운트하고, 이후에는 상태만 갱신한다(재렌더로 초안·커서를 잃지 않게).
 * 버튼은 빈 본문·상한 초과·선택 없음·전송 중이면 비활성이다(E-7).
 */
export function createCommentForm(
  container: HTMLElement,
  handlers: { onSubmit(body: string): void },
): CommentFormControl {
  const form = document.createElement('div');
  form.className = 'comment-form';

  const input = document.createElement('textarea');
  input.placeholder = '이 요소에 남길 코멘트';
  input.maxLength = COMMENT_BODY_MAX;
  input.rows = 3;
  input.spellcheck = false;

  const row = document.createElement('div');
  row.className = 'comment-row';
  const counter = document.createElement('span');
  counter.className = 'comment-counter';

  let state: CommentFormState = { canSubmit: false };

  const canSubmit = (): boolean =>
    input.value.trim().length > 0 && input.value.length <= COMMENT_BODY_MAX && state.canSubmit && !state.disabled;

  const submit = button('코멘트 남기기', () => {
    if (!canSubmit()) return;
    handlers.onSubmit(input.value);
  });

  const hint = document.createElement('p');
  hint.className = 'comment-hint';
  hint.hidden = true;

  const refresh = (): void => {
    submit.disabled = !canSubmit();
  };
  const updateCounter = (): void => {
    counter.textContent = `${input.value.length}/${COMMENT_BODY_MAX}`;
  };

  input.addEventListener('input', () => {
    updateCounter();
    refresh();
  });

  row.append(counter, submit);
  form.append(input, row, hint);
  container.replaceChildren(form);
  updateCounter();
  refresh();

  return {
    setState(next) {
      state = next;
      hint.textContent = next.hint ?? '';
      hint.hidden = !next.hint;
      refresh();
    },
    clear() {
      input.value = '';
      updateCounter();
      hint.textContent = '';
      hint.hidden = true;
      refresh();
    },
  };
}

const STATE_TEXT: Record<CommentSendState, string> = {
  pending: '전송 대기',
  sending: '전송 중…',
  sent: '전송 완료',
  failed: '전송 실패',
};

export interface CommentListItem {
  id: string;
  /** 목록 순서(1부터)와 같은 핀 번호. */
  number: number;
  /** 소스 위치(`file:line:column`). */
  where: string;
  inherited: boolean;
  preview: string;
  /** 대상 요소를 지금 페이지에서 찾지 못함(E-4). */
  missing: boolean;
  /** 같은 소스 위치에서 렌더링된 요소 수(E-2). */
  sameSource: number;
  send: CommentSendState;
  error?: string;
}

function badge(text: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'comment-badge';
  span.textContent = text;
  return span;
}

/** 현재 페이지 코멘트 목록(FR-7). 비어 있으면 영역을 비운다. */
export function renderCommentList(
  container: HTMLElement,
  items: readonly CommentListItem[],
  handlers: { onResend(id: string): void },
): void {
  if (items.length === 0) {
    container.replaceChildren();
    return;
  }

  const head = document.createElement('p');
  head.className = 'comment-count';
  head.textContent = `코멘트 ${items.length}건`;

  const list = document.createElement('ul');
  list.className = 'comment-list';
  for (const item of items) {
    const row = document.createElement('li');
    row.className = 'comment-item';
    row.dataset.id = item.id;

    const number = document.createElement('span');
    number.className = 'comment-number';
    number.textContent = String(item.number);

    const body = document.createElement('div');
    body.className = 'comment-body';
    const text = item.send === 'failed' && item.error ? `전송 실패: ${item.error}` : STATE_TEXT[item.send];
    const stateLine = line('comment-state', text);
    stateLine.dataset.kind = item.send === 'failed' ? 'error' : item.send === 'sent' ? 'ok' : 'info';
    body.append(line('comment-where', item.where), line('comment-preview', item.preview), stateLine);
    if (item.inherited) body.append(badge('상속'));
    if (item.sameSource >= 2) body.append(badge(`같은 위치 요소 ${item.sameSource}개`));
    if (item.missing) body.append(badge('요소 없음'));

    row.append(number, body);
    if (item.send !== 'sending' && item.send !== 'sent') row.append(button('재전송', () => handlers.onResend(item.id)));
    list.append(row);
  }

  container.replaceChildren(head, list);
}

/** 코멘트가 가리키는 요소. 재연결은 소스 위치만 쓰고 `selectorHint`는 쓰지 않는다(A-2). */
export function resolveCommentElement(c: Pick<ScreenCommentInput, 'source'>): Element | null {
  return document.querySelector(sameSourceSelector(formatSourceLocation(c.source)));
}

export interface CommentPinsOptions {
  /** 핀의 대상 요소 유무가 바뀐 프레임에 1회 호출된다(목록의 "요소 없음" 갱신). */
  onElementChange?(): void;
  /** SPA 경로 이동으로 `location.href`가 바뀌면 1회 호출된다(E-9). */
  onPageChange?(): void;
}

export interface CommentPins {
  /** 핀 집합을 목록과 맞춘다(추가·삭제). 번호는 전달한 목록 순서(1부터)다. */
  update(comments: readonly LocalComment[]): void;
  dispose(): void;
}

interface Pin {
  comment: LocalComment;
  el: Element | null;
  present: boolean;
  number: number;
  open: boolean;
  pin: HTMLButtonElement;
  tip: HTMLDivElement;
  /** 마지막으로 쓴 좌표(불필요한 style 쓰기 방지). */
  last: string;
  tipLast: string;
}

/**
 * 화면 위 코멘트 핀(FR-6). 모든 핀을 하나의 rAF 루프에서 갱신하며(R-4),
 * 요소가 사라지면 숨기고 다시 찾으면 되살린다(E-2·E-4).
 */
export function createCommentPins(root: ShadowRoot, opts: CommentPinsOptions = {}): CommentPins {
  const pins = new Map<string, Pin>();
  let frame = 0;
  let href = location.href;
  let disposed = false;

  const closeAll = (): void => {
    for (const p of pins.values()) {
      p.open = false;
      p.tip.hidden = true;
    }
  };

  const place = (p: Pin): void => {
    if (!p.el) {
      p.pin.hidden = true;
      p.tip.hidden = true;
      return;
    }
    const r = p.el.getBoundingClientRect();
    const left = r.right - 10;
    const top = r.top - 10;
    const key = `${left},${top}`;
    p.pin.hidden = false;
    if (p.last !== key) {
      p.last = key;
      p.pin.style.left = `${left}px`;
      p.pin.style.top = `${top}px`;
    }
    if (!p.open) {
      p.tip.hidden = true;
      return;
    }
    const tipLeft = Math.max(0, left - 4);
    const tipTop = Math.max(0, top + 18);
    const tipKey = `${tipLeft},${tipTop}`;
    if (p.tipLast !== tipKey) {
      p.tipLast = tipKey;
      p.tip.style.left = `${tipLeft}px`;
      p.tip.style.top = `${tipTop}px`;
    }
    p.tip.hidden = false;
  };

  const renderTip = (p: Pin): void => {
    p.tip.replaceChildren(line('comment-tip-body', p.comment.body), line('comment-tip-where', commentWhere(p.comment)));
  };

  const create = (comment: LocalComment): Pin => {
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'comment-pin';
    const tip = document.createElement('div');
    tip.className = 'comment-tip';
    tip.hidden = true;
    const entry: Pin = { comment, el: null, present: false, number: 0, open: false, pin, tip, last: '', tipLast: '' };
    // 클릭은 패널 Shadow 내부라 picker가 `isOwn`으로 걸러 가로채지 않는다.
    pin.addEventListener('click', () => {
      const open = !entry.open;
      closeAll();
      entry.open = open;
      place(entry);
    });
    root.append(pin, tip);
    renderTip(entry);
    return entry;
  };

  const tick = (): void => {
    frame = requestAnimationFrame(tick);
    if (disposed) return;
    const currentHref = location.href;
    if (currentHref !== href) {
      href = currentHref;
      opts.onPageChange?.();
    }
    let changed = false;
    for (const p of pins.values()) {
      if (p.el && !p.el.isConnected) p.el = null;
      if (!p.el) p.el = resolveCommentElement(p.comment);
      const present = p.el !== null;
      if (present !== p.present) {
        p.present = present;
        changed = true;
      }
      place(p);
    }
    if (changed) opts.onElementChange?.();
  };
  frame = requestAnimationFrame(tick);

  return {
    update(comments) {
      if (disposed) return;
      const ids = new Set<string>();
      comments.forEach((comment, index) => {
        ids.add(comment.id);
        let p = pins.get(comment.id);
        if (!p) {
          p = create(comment);
          pins.set(comment.id, p);
        }
        const number = index + 1;
        if (p.comment !== comment) {
          p.comment = comment;
          renderTip(p);
        }
        if (p.number !== number) {
          p.number = number;
          p.pin.textContent = String(number);
        }
      });
      for (const [id, p] of pins) {
        if (ids.has(id)) continue;
        p.pin.remove();
        p.tip.remove();
        pins.delete(id);
      }
      for (const p of pins.values()) place(p);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      frame = 0;
      closeAll();
      for (const p of pins.values()) {
        p.pin.remove();
        p.tip.remove();
      }
      pins.clear();
    },
  };
}
