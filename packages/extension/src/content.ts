import { DEFAULT_PORT, formatSourceLocation, type ContentToWorkerMessage, type SendResult, type StyleChangeInput } from '@domirror/shared';
import { LOCATION_CSS, renderLocation } from './panel.js';
import { createPicker, PICKER_CSS, type Picker } from './picker.js';
import { isValidPort } from './relay.js';
import { countSameSource, locate, selectorHint } from './source-locator.js';
import { loadPort, savePort } from './storage.js';

// 진입점: 아이콘 클릭으로 주입되면 즉시 활성화되고, 이후 'domirror:toggle' 메시지로 켜고 끈다.
// 비활성화 시 이 스크립트가 만든 DOM(Shadow 호스트 1개)을 모두 제거한다(NFR-3).

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
  dispose(): void;
}

/**
 * 전송 대상 변경 목록. 변경 기록(change-log)은 배치 F에서 연결되며, 그 전까지는 빈 목록을 보낸다
 * (서버 연결·실패 표시 경로 확인용).
 */
function collectSendable(): StyleChangeInput[] {
  return [];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createPanel(): Panel {
  const host = document.createElement(HOST_TAG);
  const shadow = host.attachShadow({ mode: 'open' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(PANEL_CSS + LOCATION_CSS + PICKER_CSS);
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

  const locationSlot = slots[0];
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
    const message: ContentToWorkerMessage = { type: 'domirror:send', port, changes: collectSendable() };
    sendButton.disabled = true;
    setStatus('info', `전송 중… (127.0.0.1:${port})`);
    try {
      const result = (await chrome.runtime.sendMessage(message)) as SendResult | undefined;
      if (!result) {
        setStatus('error', '전송 실패: 익스텐션 응답이 없습니다');
      } else if (result.ok) {
        setStatus('ok', `전송 완료: ${result.accepted}건`);
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
    dispose() {
      disposed = true;
      portInput.removeEventListener('change', onPortChange);
      sendButton.removeEventListener('click', onSendClick);
      host.remove();
    },
  };
}

let panel: Panel | null = null;
let picker: Picker | null = null;

function onPick(el: Element): void {
  if (!panel) return;
  const located = locate(el);
  const sameSource = located ? countSameSource(formatSourceLocation(located.location)) : 0;
  renderLocation(panel.locationSlot, { kind: 'selected', hint: selectorHint(el), located, sameSource });
}

function activate(): void {
  if (panel) return;
  // 이전 인스턴스가 정리되지 못하고 남긴 호스트가 있으면 제거한다.
  for (const stale of document.querySelectorAll(HOST_TAG)) stale.remove();
  const current = createPanel();
  panel = current;
  document.documentElement.append(current.host);
  picker = createPicker(onPick, {
    overlayRoot: current.shadow,
    isOwn: (target) => target instanceof Node && current.host.contains(target),
    onBlocked: (reason) => renderLocation(current.locationSlot, { kind: 'blocked', reason }),
  });
  picker.start();
}

function deactivate(): void {
  picker?.stop();
  picker = null;
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
