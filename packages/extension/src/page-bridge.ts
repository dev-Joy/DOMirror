import { BRIDGE_CHANNEL, BRIDGE_MARKER_ATTR } from '@domirror/shared';
import { fiberFromDevtools, type DevtoolsHook } from './devtools-hook.js';
import { collectFiberLayers } from './layer-collect.js';
import { MAX_LAYERS } from './layer-model.js';
import { fiberFromNode } from './react-runtime.js';
import type { RuntimeBridgeResult } from './runtime-bridge.js';
import { inspectFiber } from './runtime-inspect.js';

interface BridgeRequest {
  channel: string;
  type: 'inspect';
  id: string;
  marker: string;
}

interface BridgeLayersRequest {
  channel: string;
  type: 'inspect-layers';
  id: string;
  maxLayers: number;
}

interface BridgeScope {
  __domirrorBridgeInstalled?: boolean;
  __REACT_DEVTOOLS_GLOBAL_HOOK__?: DevtoolsHook;
}

const scope = globalThis as typeof globalThis & BridgeScope;

function isBridgeRequest(value: unknown): value is BridgeRequest {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as { channel?: unknown; type?: unknown; id?: unknown; marker?: unknown };
  return (
    data.channel === BRIDGE_CHANNEL &&
    data.type === 'inspect' &&
    typeof data.id === 'string' &&
    data.id !== '' &&
    typeof data.marker === 'string' &&
    data.marker !== ''
  );
}

/** 마커 값은 우리가 만든 id지만, 속성 선택자 문자열로 쓸 때를 대비해 이스케이프한다. */
function markerSelector(value: string): string {
  return `[${BRIDGE_MARKER_ATTR}="${value.replace(/["\\]/g, '\\$&')}"]`;
}

function respond(request: BridgeRequest): void {
  const element = document.querySelector(markerSelector(request.marker));

  let result: RuntimeBridgeResult = { info: null };

  if (element) {
    const devtools = fiberFromDevtools(scope.__REACT_DEVTOOLS_GLOBAL_HOOK__, element);
    const fiber = devtools ?? fiberFromNode(element);
    if (fiber) result = inspectFiber(fiber, devtools ? 'devtools' : 'fiber');
  }

  // 응답에는 DOM 노드·함수를 담지 않는다(NFR-3).
  window.postMessage({ channel: BRIDGE_CHANNEL, type: 'inspect:result', id: request.id, ...result }, '*');
}

function isBridgeLayersRequest(value: unknown): value is BridgeLayersRequest {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as { channel?: unknown; type?: unknown; id?: unknown; maxLayers?: unknown };
  return (
    data.channel === BRIDGE_CHANNEL &&
    data.type === 'inspect-layers' &&
    typeof data.id === 'string' &&
    data.id !== '' &&
    typeof data.maxLayers === 'number' &&
    Number.isInteger(data.maxLayers) &&
    data.maxLayers > 0
  );
}

function respondLayers(request: BridgeLayersRequest): void {
  const snapshot = collectFiberLayers(document, {
    hook: scope.__REACT_DEVTOOLS_GLOBAL_HOOK__,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    maxLayers: Math.min(request.maxLayers, MAX_LAYERS),
  });
  window.postMessage({ channel: BRIDGE_CHANNEL, type: 'inspect-layers:result', id: request.id, snapshot }, '*');
}

function install(): void {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (isBridgeRequest(event.data)) {
      try {
        respond(event.data);
      } catch {
        // 페이지 스크립트를 깨뜨리지 않는다. 응답이 없으면 content 측은 타임아웃으로 처리한다(E-3).
      }
    } else if (isBridgeLayersRequest(event.data)) {
      try {
        respondLayers(event.data);
      } catch {
        // 페이지 스크립트를 깨뜨리지 않는다. 응답이 없으면 content 측은 타임아웃으로 처리한다.
      }
    }
  });
}

// 같은 문서에 중복 주입되면 리스너를 두 번 달지 않도록 비열거 전역 마커로 한 번만 설치한다.
if (!scope.__domirrorBridgeInstalled) {
  Object.defineProperty(scope, '__domirrorBridgeInstalled', {
    value: true,
    enumerable: false,
    configurable: true,
  });
  install();
}
