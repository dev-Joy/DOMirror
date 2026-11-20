export const DOMIRROR_ATTR = 'data-domirror';
export const DOMIRROR_COMPONENT_ATTR = 'data-domirror-component';
export const DOMIRROR_DS_ATTR = 'data-domirror-ds';
export const DOMIRROR_PROTECTED_ATTR = 'data-domirror-protected';
export const DEFAULT_PORT = 47321;
export const CHANGES_PATH = '/changes';
export const MCP_PATH = '/mcp';
export const HEALTH_PATH = '/health';
export const COMMENTS_PATH = '/comments';
/** main world 브리지 ↔ content script 메시지 채널 태그(FR-1). */
export const BRIDGE_CHANNEL = 'domirror:bridge';
/** 브리지가 대상 요소를 찾는 일회용 마커 속성. 값은 요청 id다(FR-1·D-S2). */
export const BRIDGE_MARKER_ATTR = 'data-domirror-probe';
/** 브리지 응답 대기 시간. 넘기면 런타임 정보 없음으로 처리한다(FR-1·E-3). */
export const BRIDGE_TIMEOUT_MS = 300;
/** owner chain 상한(FR-4). */
export const BRIDGE_OWNER_MAX = 8;
