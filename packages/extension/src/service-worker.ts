import type { SendResult, WorkerToContentMessage } from '@domirror/shared';
import { isSendCommentsMessage, isSendMessage } from './message-guard.js';
import { postChanges, postComments } from './relay.js';

const TOP_FRAME = 0;

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
  if (sender.id !== chrome.runtime.id) return false;

  if (isSendMessage(message)) {
    postChanges(message.port, message.changes)
      .then(sendResponse)
      .catch((error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true; // 비동기 응답
  }

  if (isSendCommentsMessage(message)) {
    postComments(message.port, message.comments)
      .then(sendResponse)
      .catch((error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true; // 비동기 응답
  }

  return false;
});
