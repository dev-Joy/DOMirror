export interface InjectResult {
  code: string;
  map: unknown;
}

export interface InjectorContext {
  root: string;
  /** core가 판정 함수를 넘긴다. 없으면 DS 판정을 하지 않는다. */
  isDesignSystem?: (target: { file?: string; specifier?: string }) => boolean;
}

/** 프레임워크별 주입기 공통 인터페이스 (FR-4). */
export interface Injector {
  name: string;
  test(id: string): boolean;
  transform(code: string, id: string, ctx: InjectorContext): InjectResult | null;
}

export interface StyleChange {
  id: string;
  source: { file: string; line: number; column: number; inherited: boolean };
  selectorHint: string;
  property: string;
  before: { authored: string | null; computed: string };
  after: string;
  pageUrl: string;
  createdAt: string;
  status: 'pending' | 'applied';
}

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
