import type { ContentToWorkerMessage, SendResult, WorkerToContentMessage } from '@domirror/shared';
import { postChanges } from './relay.js';

const TOP_FRAME = 0;

function isSendMessage(message: unknown): message is ContentToWorkerMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'domirror:send' &&
    typeof (message as { port?: unknown }).port === 'number' &&
    Array.isArray((message as { changes?: unknown }).changes)
  );
}

// 아이콘 클릭: 이미 주입된 content script가 있으면 토글, 없으면 최상위 프레임에만 주입한다.
// 주입 직후 content script는 스스로 활성화된다.
chrome.action.onClicked.addListener((tab) => {
  const tabId = tab.id;
  if (tabId === undefined) return;

  const toggle: WorkerToContentMessage = { type: 'domirror:toggle' };
  chrome.tabs
    .sendMessage(tabId, toggle, { frameId: TOP_FRAME })
    .catch(() => chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }))
    .catch((error: unknown) => {
      // chrome:// 등 주입 불가 페이지.
      console.warn('[domirror] content script를 주입할 수 없습니다:', error);
    });
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse: (result: SendResult) => void) => {
  if (sender.id !== chrome.runtime.id || !isSendMessage(message)) return false;

  postChanges(message.port, message.changes)
    .then(sendResponse)
    .catch((error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true; // 비동기 응답
});
