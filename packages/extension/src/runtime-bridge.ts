import {
  BRIDGE_CHANNEL,
  BRIDGE_MARKER_ATTR,
  BRIDGE_TIMEOUT_MS,
  type ComponentRuntimeInfo,
  type InstanceCount,
  type RuntimeSourceRef,
} from '@domirror/shared';
import { isLayerSnapshot, MAX_LAYERS, type LayerSnapshot } from './layer-model.js';
import { PROPS_SUMMARY_MAX } from './props-summary.js';
import { isComponentRuntimeInfo, isInstanceCount, isRuntimeSourceRef } from './runtime-format.js';

/** 브리지 응답 본문 중 표시·전송에 쓰는 값만 담는다(NFR-3). */
export interface RuntimeBridgeResult {
  info: ComponentRuntimeInfo | null;
  hostSource?: RuntimeSourceRef;
  /** MAIN world에서 요약·마스킹한 props(최대 PROPS_SUMMARY_MAX자). 로컬 전용 — 저장·전송 금지(NFR-4). */
  props?: string;
  /** 같은 컴포넌트 화면 렌더 수(FR-5). */
  instanceCount?: InstanceCount;
}

export type RuntimeExtras = Pick<RuntimeBridgeResult, 'props' | 'instanceCount'>;

export interface BridgeResultMessage extends RuntimeBridgeResult {
  channel: typeof BRIDGE_CHANNEL;
  type: 'inspect:result';
  id: string;
}

export interface BridgeRequestMessage {
  channel: typeof BRIDGE_CHANNEL;
  type: 'inspect';
  id: string;
  marker: string;
}

/** 단일 in-flight. 새 요청이 오면 이전 요청을 런타임 정보 없음으로 정산한다(NFR-4). */
let inflight: { id: string; cancel: () => void } | null = null;
let sequence = 0;

/**
 * 브리지 응답 화이트리스트 검증(AC-9·E-11). 채널·id가 다르거나 형식이 틀린 메시지는 버린다.
 * 페이지 스크립트가 같은 채널로 위조 응답을 보내도 요청 id를 맞히지 못하면 통과하지 못한다.
 */
export function isBridgeResult(message: unknown, id: string): message is BridgeResultMessage {
  if (typeof message !== 'object' || message === null) return false;
  const data = message as { channel?: unknown; type?: unknown; id?: unknown; hostSource?: unknown; info?: unknown };
  if (data.channel !== BRIDGE_CHANNEL || data.type !== 'inspect:result' || data.id !== id) return false;
  if (data.hostSource !== undefined && !isRuntimeSourceRef(data.hostSource)) return false;
  return data.info === null || isComponentRuntimeInfo(data.info);
}

/** 검증 통과 메시지에서 표시용 값만 고른다. 형식이 틀린 props·instanceCount는 그 필드만 버린다(spec §6, AC-4). */
export function toRuntimeBridgeResult(message: BridgeResultMessage): RuntimeBridgeResult {
  const result: RuntimeBridgeResult = { info: message.info };
  if (message.hostSource !== undefined) result.hostSource = message.hostSource;
  const props: unknown = message.props;
  if (typeof props === 'string' && props.length > 0 && props.length <= PROPS_SUMMARY_MAX) result.props = props;
  const instanceCount: unknown = message.instanceCount;
  if (isInstanceCount(instanceCount)) result.instanceCount = { count: instanceCount.count, capped: instanceCount.capped };
  return result;
}

function nextRequestId(): string {
  sequence += 1;
  return `dm-${Date.now().toString(36)}-${sequence}`;
}

/**
 * 선택 요소의 런타임 컴포넌트 정보를 main world 브리지에 요청한다(FR-1).
 * 응답이 없거나 `timeoutMs`를 넘기면 `null`(E-3). 예외를 던지지 않는다.
 */
export async function requestRuntimeInfo(el: Element, timeoutMs: number = BRIDGE_TIMEOUT_MS): Promise<RuntimeBridgeResult | null> {
  // 이전 요청이 있으면 먼저 정산해야 마커·타이머가 겹치지 않는다.
  const previous = inflight;
  inflight = null;
  previous?.cancel();

  const id = nextRequestId();
  let resolveResult: (result: RuntimeBridgeResult | null) => void = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;

  const onMessage = (event: MessageEvent): void => {
    if (event.source !== window) return;
    if (!isBridgeResult(event.data, id)) return;
    settle(toRuntimeBridgeResult(event.data));
  };

  const cleanup = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    window.removeEventListener('message', onMessage);
    if (el.getAttribute(BRIDGE_MARKER_ATTR) === id) el.removeAttribute(BRIDGE_MARKER_ATTR);
    if (inflight?.id === id) inflight = null;
  };

  function settle(result: RuntimeBridgeResult | null): void {
    if (settled) return;
    settled = true;
    cleanup();
    resolveResult(result);
  }

  return new Promise<RuntimeBridgeResult | null>((resolve) => {
    resolveResult = resolve;
    inflight = { id, cancel: () => settle(null) };

    el.setAttribute(BRIDGE_MARKER_ATTR, id);
    window.addEventListener('message', onMessage);
    timer = setTimeout(() => settle(null), timeoutMs);

    const request: BridgeRequestMessage = { channel: BRIDGE_CHANNEL, type: 'inspect', id, marker: id };
    window.postMessage(request, '*');
  });
}

export const BRIDGE_LAYERS_TIMEOUT_MS = 500;

export interface BridgeLayersRequestMessage {
  channel: typeof BRIDGE_CHANNEL;
  type: 'inspect-layers';
  id: string;
  maxLayers: number;
}

export interface BridgeLayersResultMessage {
  channel: typeof BRIDGE_CHANNEL;
  type: 'inspect-layers:result';
  id: string;
  snapshot: LayerSnapshot | null;
}

/** 3D 레이어 스냅샷 전용 in-flight. 기존 `inflight`와 완전히 분리해 동시 호출 간섭을 막는다(NFR-4). */
let layersInflight: { id: string; cancel: () => void } | null = null;

/** 3D 레이어 스냅샷 브리지 응답 화이트리스트 검증. */
export function isBridgeLayersResult(message: unknown, id: string): message is BridgeLayersResultMessage {
  if (typeof message !== 'object' || message === null) return false;
  const data = message as { channel?: unknown; type?: unknown; id?: unknown; snapshot?: unknown };
  if (data.channel !== BRIDGE_CHANNEL || data.type !== 'inspect-layers:result' || data.id !== id) return false;
  return data.snapshot === null || isLayerSnapshot(data.snapshot);
}

/** 진행 중인 3D 레이어 스냅샷 요청이 있으면 즉시 취소(null 정산)한다. */
export function cancelLayerSnapshotRequest(): void {
  const previous = layersInflight;
  layersInflight = null;
  previous?.cancel();
}

/**
 * MAIN world 브리지에 React Fiber 3D 레이어 스냅샷을 요청한다(FR-2·NFR-4).
 * 타임아웃·취소·미응답 시 `null`을 반환하며 예외를 던지지 않는다.
 */
export async function requestLayerSnapshot(
  maxLayers: number = MAX_LAYERS,
  timeoutMs: number = BRIDGE_LAYERS_TIMEOUT_MS,
): Promise<LayerSnapshot | null> {
  cancelLayerSnapshotRequest();

  const id = nextRequestId();
  let resolveResult: (result: LayerSnapshot | null) => void = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;

  const onMessage = (event: MessageEvent): void => {
    if (event.source !== window) return;
    if (!isBridgeLayersResult(event.data, id)) return;
    settle(event.data.snapshot);
  };

  const cleanup = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    window.removeEventListener('message', onMessage);
    if (layersInflight?.id === id) layersInflight = null;
  };

  function settle(result: LayerSnapshot | null): void {
    if (settled) return;
    settled = true;
    cleanup();
    resolveResult(result);
  }

  return new Promise<LayerSnapshot | null>((resolve) => {
    resolveResult = resolve;
    layersInflight = { id, cancel: () => settle(null) };

    window.addEventListener('message', onMessage);
    timer = setTimeout(() => settle(null), timeoutMs);

    const request: BridgeLayersRequestMessage = {
      channel: BRIDGE_CHANNEL,
      type: 'inspect-layers',
      id,
      maxLayers,
    };
    window.postMessage(request, '*');
  });
}
