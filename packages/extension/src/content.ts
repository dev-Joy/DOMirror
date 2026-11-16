import { DEFAULT_PORT, formatSourceLocation, type ContentToWorkerMessage, type SendResult, type StyleChangeInput } from '@domirror/shared';
import { AppliedStyles } from './applier.js';
import { changeKey, recordChange, removeChange, removeSent, restoreStale, sendable, type LocalChange } from './change-log.js';
import { readBefore } from './css-read.js';
import {
  createSelectionHighlight,
  EDITOR_CSS,
  LOCATION_CSS,
  renderChanges,
  renderEditor,
  renderLocation,
  type SelectionHighlight,
} from './panel.js';
import { createPicker, PICKER_CSS, type BlockedReason, type Picker } from './picker.js';
import { EDITABLE_PROPERTIES } from './properties.js';
import { isValidPort } from './relay.js';
import { countSameSource, locate, selectorHint } from './source-locator.js';
import { loadEntries, loadPort, saveEntries, savePort } from './storage.js';

// 진입점: 아이콘 클릭으로 주입되면 즉시 활성화되고, 이후 'domirror:toggle' 메시지로 켜고 끈다.
// 비활성화 시 이 스크립트가 만든 DOM(Shadow 호스트 1개)을 모두 제거하고 편집한 인라인 스타일을 원복한다(NFR-3).
// 변경 내역은 chrome.storage.local에 남아 다음 활성화 때 복원된다(E-6).

const HOST_TAG = 'domirror-panel';
/** 같은 문서에 다시 주입될 때(연속 클릭·익스텐션 재로드) 이전 인스턴스를 정리하기 위한 전역 키. */
const INSTANCE_KEY = '__domirrorDispose';

const PANEL_CSS = `
:host {
  all: initial;
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 2147483647;
}
.panel {
  box-sizing: border-box;
  width: 300px;
  padding: 12px;
  border: 1px solid #d0d4da;
  border-radius: 8px;
  background: #ffffff;
  color: #1f2328;
  font: 13px/1.4 system-ui, -apple-system, sans-serif;
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.15);
  max-height: calc(100vh - 32px);
  overflow: auto;
}
.title { margin: 0 0 8px; font-size: 14px; font-weight: 600; }
.slot:empty { display: none; }
.send { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
.send label { display: flex; gap: 4px; align-items: center; }
.send input { width: 72px; font: inherit; }
.send button { font: inherit; cursor: pointer; }
.send button:disabled { cursor: progress; }
.status { min-height: 1.4em; margin: 8px 0 0; word-break: break-word; }
.status[data-kind='error'] { color: #cf222e; }
.status[data-kind='ok'] { color: #1a7f37; }
`;

type StatusKind = 'info' | 'ok' | 'error';

interface Panel {
  host: HTMLElement;
  shadow: ShadowRoot;
  /** 위치 표시 자리(배치 E). */
  locationSlot: HTMLElement;
  editorSlot: HTMLElement;
  changesSlot: HTMLElement;
  setStatus(kind: StatusKind, text: string): void;
  dispose(): void;
}

interface SendHandlers {
  /** 전송할 변경 목록 스냅샷과 위치가 없어 제외된 건수. */
  collect(): { changes: StyleChangeInput[]; excluded: number };
  /** 전송 성공 시 보낸 항목을 받는다(로컬 목록에서 제거, E-4). */
  onSent(changes: StyleChangeInput[]): void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createPanel(handlers: SendHandlers): Panel {
  const host = document.createElement(HOST_TAG);
  const shadow = host.attachShadow({ mode: 'open' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(PANEL_CSS + LOCATION_CSS + EDITOR_CSS + PICKER_CSS);
  shadow.adoptedStyleSheets = [sheet];

  const panel = document.createElement('div');
  panel.className = 'panel';

  const title = document.createElement('p');
  title.className = 'title';
  title.textContent = 'DOMirror';

  // 이후 배치가 채울 빈 자리: 위치 표시(E), 편집 필드(F), 변경 목록(F), 간격 보기(G).
  const slots = ['location', 'editor', 'changes', 'measure'].map((name) => {
    const section = document.createElement('section');
    section.className = 'slot';
    section.dataset.slot = name;
    return section;
  });

  const sendRow = document.createElement('div');
  sendRow.className = 'send';
  const portLabel = document.createElement('label');
  portLabel.textContent = '포트';
  const portInput = document.createElement('input');
  portInput.type = 'number';
  portInput.min = '1';
  portInput.max = '65535';
  portInput.value = String(DEFAULT_PORT);
  portLabel.append(portInput);
  const sendButton = document.createElement('button');
  sendButton.type = 'button';
  sendButton.textContent = '에이전트에 보내기';
  sendRow.append(portLabel, sendButton);

  const status = document.createElement('p');
  status.className = 'status';
  status.setAttribute('role', 'status');

  const [locationSlot, editorSlot, changesSlot] = slots;
  renderLocation(locationSlot, { kind: 'idle' });

  panel.append(title, ...slots, sendRow, status);
  shadow.append(panel);

  let disposed = false;
  const setStatus = (kind: StatusKind, text: string): void => {
    if (disposed) return;
    status.dataset.kind = kind;
    status.textContent = text;
  };
  const readPort = (): number | null => {
    const port = Number(portInput.value);
    return isValidPort(port) ? port : null;
  };

  // 저장된 포트 복원. 사용자가 이미 입력을 바꿨다면 덮어쓰지 않는다.
  const initialValue = portInput.value;
  loadPort()
    .then((port) => {
      if (!disposed && portInput.value === initialValue) portInput.value = String(port);
    })
    .catch((error: unknown) => setStatus('error', `포트 설정을 불러오지 못했습니다: ${errorMessage(error)}`));

  const onPortChange = (): void => {
    const port = readPort();
    if (port === null) {
      setStatus('error', '포트는 1~65535 사이의 정수여야 합니다');
      return;
    }
    savePort(port).catch((error: unknown) => setStatus('error', `포트를 저장하지 못했습니다: ${errorMessage(error)}`));
  };

  const onSend = async (): Promise<void> => {
    const port = readPort();
    if (port === null) {
      setStatus('error', '포트는 1~65535 사이의 정수여야 합니다');
      return;
    }
    const { changes, excluded } = handlers.collect();
    const excludedNote = excluded > 0 ? ` (소스 위치 없는 ${excluded}건 제외)` : '';
    if (changes.length === 0) {
      setStatus('info', `보낼 변경 내역이 없습니다${excludedNote}`);
      return;
    }
    const message: ContentToWorkerMessage = { type: 'domirror:send', port, changes };
    sendButton.disabled = true;
    setStatus('info', `전송 중… (127.0.0.1:${port})`);
    try {
      const result = (await chrome.runtime.sendMessage(message)) as SendResult | undefined;
      if (!result) {
        setStatus('error', '전송 실패: 익스텐션 응답이 없습니다');
      } else if (result.ok) {
        if (!disposed) handlers.onSent(changes);
        setStatus('ok', `전송 완료: ${result.accepted}건${excludedNote}`);
      } else {
        // 실패 시 변경 내역은 그대로 둔다(E-4).
        setStatus('error', `전송 실패 (포트 ${port}): ${result.error}`);
      }
    } catch (error) {
      // 익스텐션 재로드 후 남은 스크립트 등(Extension context invalidated).
      setStatus('error', `전송 실패: ${errorMessage(error)}`);
    } finally {
      if (!disposed) sendButton.disabled = false;
    }
  };
  const onSendClick = (): void => void onSend();

  portInput.addEventListener('change', onPortChange);
  sendButton.addEventListener('click', onSendClick);

  return {
    host,
    shadow,
    locationSlot,
    editorSlot,
    changesSlot,
    setStatus,
    dispose() {
      disposed = true;
      portInput.removeEventListener('change', onPortChange);
      sendButton.removeEventListener('click', onSendClick);
      host.remove();
    },
  };
}

/** 비보안 출처(http 스테이징 등)에서는 `crypto.randomUUID`가 없으므로 난수 바이트로 대체한다. */
function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

function isStyled(el: Element): el is HTMLElement | SVGElement {
  return el instanceof HTMLElement || el instanceof SVGElement;
}

/** 활성화 1회분의 편집 상태: 선택 요소, 변경 내역, 적용 이력. */
class EditSession {
  readonly #panel: Panel;
  readonly #highlight: SelectionHighlight;
  readonly #applied = new AppliedStyles();
  readonly #origin = location.origin;
  #selected: Element | null = null;
  #log: LocalChange[] = [];
  #disposed = false;

  constructor(panel: Panel) {
    this.#panel = panel;
    this.#highlight = createSelectionHighlight(panel.shadow);
    this.#renderChanges();
    loadEntries<unknown>(this.#origin)
      .then((entries) => {
        if (this.#disposed) return;
        // 불러오기 전에 이미 편집한 항목이 우선한다.
        const current = new Set(this.#log.map(changeKey));
        this.#log = [...restoreStale(entries).filter((c) => !current.has(changeKey(c))), ...this.#log];
        this.#renderChanges();
      })
      .catch((error: unknown) => this.#panel.setStatus('error', `변경 내역을 불러오지 못했습니다: ${errorMessage(error)}`));
  }

  select(el: Element): void {
    this.#selected = el;
    this.#highlight.set(el);
    const located = locate(el);
    const sameSource = located ? countSameSource(formatSourceLocation(located.location)) : 0;
    renderLocation(this.#panel.locationSlot, { kind: 'selected', hint: selectorHint(el), located, sameSource });
    this.#renderEditor();
  }

  blocked(reason: BlockedReason): void {
    this.#selected = null;
    this.#highlight.set(null);
    renderLocation(this.#panel.locationSlot, { kind: 'blocked', reason });
    this.#renderEditor();
  }

  collect(): { changes: StyleChangeInput[]; excluded: number } {
    const changes = sendable(this.#log);
    return { changes, excluded: this.#log.length - changes.length };
  }

  onSent(sent: StyleChangeInput[]): void {
    const next = removeSent(this.#log, sent);
    const kept = new Set(next.map((c) => c.id));
    // 전송된 항목의 페이지 표시는 유지하되, 이후 되돌리기 대상에서는 뺀다.
    for (const c of this.#log) if (!kept.has(c.id)) this.#applied.forget(changeKey(c));
    this.#setLog(next);
  }

  dispose(): void {
    this.#disposed = true;
    this.#highlight.dispose();
    // 페이지 표시는 원복하고 내역은 저장소에 남긴다(NFR-3·E-6).
    this.#applied.restoreAll();
  }

  #edit(property: string, raw: string): void {
    const el = this.#selected;
    const value = raw.trim();
    if (!el) return;
    if (!el.isConnected) {
      this.#panel.setStatus('error', '선택한 요소가 페이지에서 사라졌습니다. 다시 선택하세요.');
      return;
    }
    if (!isStyled(el)) {
      this.#panel.setStatus('error', '이 요소는 스타일을 편집할 수 없습니다.');
      return;
    }
    if (!value || !CSS.supports(property, value)) {
      this.#panel.setStatus('error', `올바르지 않은 값: ${property}: ${value || '(빈 값)'}`);
      this.#renderEditor();
      return;
    }
    const located = locate(el);
    const change: LocalChange = {
      id: newId(),
      source: located ? { ...located.location, inherited: located.inherited } : null,
      selectorHint: selectorHint(el),
      property,
      // 적용 전에 읽는다. 같은 key의 연속 편집이면 recordChange가 최초 값을 유지한다.
      before: readBefore(el, property),
      after: value,
      pageUrl: location.href,
      createdAt: new Date().toISOString(),
      stale: false,
    };
    const key = changeKey(change);
    this.#applied.apply(key, el, property, value);
    const next = recordChange(this.#log, change);
    // 원래 값으로 돌아와 항목이 없어졌으면 인라인 스타일도 원복한다.
    if (!next.some((c) => changeKey(c) === key)) this.#applied.revert(key);
    this.#panel.setStatus('info', `${property}: ${value} 적용`);
    this.#setLog(next);
  }

  #revert(id: string): void {
    const target = this.#log.find((c) => c.id === id);
    if (!target) return;
    this.#applied.revert(changeKey(target));
    this.#setLog(removeChange(this.#log, id));
    this.#renderEditor();
  }

  #revertAll(): void {
    for (const c of this.#log) this.#applied.revert(changeKey(c));
    this.#setLog([]);
    this.#renderEditor();
  }

  #setLog(next: LocalChange[]): void {
    this.#log = next;
    this.#renderChanges();
    saveEntries(this.#origin, next).catch((error: unknown) =>
      this.#panel.setStatus('error', `변경 내역을 저장하지 못했습니다: ${errorMessage(error)}`),
    );
  }

  #renderEditor(): void {
    const el = this.#selected;
    let values: Record<string, string> | null = null;
    if (el?.isConnected && isStyled(el)) {
      const cs = getComputedStyle(el);
      values = Object.fromEntries(EDITABLE_PROPERTIES.map(({ name }) => [name, cs.getPropertyValue(name)]));
    }
    renderEditor(this.#panel.editorSlot, values, { onEdit: (property, value) => this.#edit(property, value) });
  }

  #renderChanges(): void {
    renderChanges(this.#panel.changesSlot, this.#log, {
      onRevert: (id) => this.#revert(id),
      onRevertAll: () => this.#revertAll(),
    });
  }
}

let panel: Panel | null = null;
let picker: Picker | null = null;
let session: EditSession | null = null;

function activate(): void {
  if (panel) return;
  // 이전 인스턴스가 정리되지 못하고 남긴 호스트가 있으면 제거한다.
  for (const stale of document.querySelectorAll(HOST_TAG)) stale.remove();
  // 패널의 전송 버튼은 세션이 만들어진 뒤에만 눌릴 수 있다(같은 동기 구간에서 생성).
  const currentPanel = createPanel({
    collect: () => current.collect(),
    onSent: (changes) => current.onSent(changes),
  });
  const current = new EditSession(currentPanel);
  panel = currentPanel;
  session = current;
  document.documentElement.append(currentPanel.host);
  picker = createPicker((el) => current.select(el), {
    overlayRoot: currentPanel.shadow,
    isOwn: (target) => target instanceof Node && currentPanel.host.contains(target),
    onBlocked: (reason) => current.blocked(reason),
  });
  picker.start();
}

function deactivate(): void {
  picker?.stop();
  picker = null;
  session?.dispose();
  session = null;
  panel?.dispose();
  panel = null;
}

function onMessage(message: unknown, sender: chrome.runtime.MessageSender, sendResponse: () => void): void {
  if (sender.id !== chrome.runtime.id) return;
  if ((message as { type?: unknown } | null)?.type !== 'domirror:toggle') return;
  if (panel) deactivate();
  else activate();
  sendResponse();
}

const globals = globalThis as typeof globalThis & { [INSTANCE_KEY]?: () => void };
try {
  globals[INSTANCE_KEY]?.();
} catch {
  // 무효화된 이전 컨텍스트의 정리 실패는 무시하고 새 인스턴스로 대체한다.
}
globals[INSTANCE_KEY] = () => {
  deactivate();
  chrome.runtime.onMessage.removeListener(onMessage);
};

chrome.runtime.onMessage.addListener(onMessage);
activate();
