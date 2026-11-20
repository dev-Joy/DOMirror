export interface InjectResult {
  code: string;
  map: unknown;
}

export interface InjectorContext {
  root: string;
  /** core가 판정 함수를 넘긴다. 없으면 DS 판정을 하지 않는다. */
  isDesignSystem?: (target: { file?: string; specifier?: string }) => boolean;
  isProtected?: (file: string) => boolean;
}

/** 프레임워크별 주입기 공통 인터페이스 (FR-4). */
export interface Injector {
  name: string;
  test(id: string): boolean;
  transform(code: string, id: string, ctx: InjectorContext): InjectResult | null;
}

export interface StyleChange {
  id: string;
  source: { file: string; line: number; column: number; inherited: boolean; protected?: boolean };
  selectorHint: string;
  property: string;
  before: { authored: string | null; computed: string };
  after: string;
  pageUrl: string;
  createdAt: string;
  status: 'pending' | 'applied';
}

export interface ProtectedAreaWarning {
  code: 'protected-area';
  reason: 'pattern' | 'node_modules';
  message: string;
}

export type PendingChange = StyleChange & { warning?: ProtectedAreaWarning };

export type StyleChangeInput = Omit<StyleChange, 'status'>;

export interface PostChangesRequest {
  changes: StyleChangeInput[];
}

export interface PostChangesResponse {
  accepted: number;
  ids: string[];
}

export interface HealthResponse {
  name: 'domirror';
  version: string;
  pending: number;
}

export type ContentToWorkerMessage = {
  type: 'domirror:send';
  port: number;
  changes: StyleChangeInput[];
};

export type WorkerToContentMessage = { type: 'domirror:toggle' };

export type SendResult = { ok: true; accepted: number } | { ok: false; error: string };

/** 화면 위 코멘트. 서버 메모리 보관 항목. */
export interface ScreenComment {
  id: string;
  source: { file: string; line: number; column: number; inherited: boolean };
  selectorHint: string;
  pageUrl: string;
  body: string;
  createdAt: string;
  status: 'open' | 'resolved';
  /** 런타임(DevTools hook·fiber)에서 얻은 컴포넌트 정보. 없으면 생략한다(FR-9). */
  component?: ComponentRuntimeInfo;
}

/** 런타임 위치의 정확도(FR-5). */
export type LocationPrecision = 'exact' | 'line-unverified';

export interface RuntimeSourceRef {
  /** 프로젝트 상대 경로 우선. 못 줄이면 URL 경로. */
  file: string;
  /** 1-based. 미확인이면 생략한다. */
  line?: number;
  column?: number;
  precision: LocationPrecision;
}

export interface ComponentRuntimeInfo {
  /** displayName > name. 없으면 `Anonymous`. */
  name: string;
  /** 컴포넌트 정의 위치(선택 요소의 호스트 태그가 쓰인 위치). */
  definition?: RuntimeSourceRef;
  /** 컴포넌트를 사용한 JSX 위치. */
  callSite?: RuntimeSourceRef;
  /** 가까운 순 owner chain, 최대 `BRIDGE_OWNER_MAX`. */
  owners?: string[];
  via: 'plugin' | 'devtools' | 'fiber';
}

export type ScreenCommentInput = Omit<ScreenComment, 'status'>;

export interface PostCommentsRequest {
  comments: ScreenCommentInput[];
}

export interface PostCommentsResponse {
  accepted: number;
  ids: string[];
}

export type ContentToWorkerCommentsMessage = {
  type: 'domirror:send-comments';
  port: number;
  comments: ScreenCommentInput[];
};
