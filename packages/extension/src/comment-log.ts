import { formatSourceLocation, type ScreenCommentInput, type SendResult } from '@domirror/shared';

// 화면 코멘트 순수 로직(FR-2·FR-7·E-2·E-3·E-5·E-6·E-9). 모든 함수는 새 배열을 돌려주고 입력을 바꾸지 않는다.
// 코멘트는 작성 즉시 개별 전송하고(D-S2), 실패해도 목록에 남겨 같은 id로 재전송한다(FR-4 멱등).

export type CommentSendState = 'pending' | 'sending' | 'sent' | 'failed';

/** 로컬 보관 항목: 서버로 보내는 필드 + 이 브라우저에서만 쓰는 전송 상태. */
export interface LocalComment extends ScreenCommentInput {
  send: CommentSendState;
  /** 실패 사유(`send === 'failed'`일 때). */
  error?: string;
}

export function addComment(list: readonly LocalComment[], comment: LocalComment): LocalComment[] {
  return [...list, comment];
}

/** 서버 전송용: 로컬 필드(send·error)를 뺀다. */
export function toSendable(comment: LocalComment): ScreenCommentInput {
  const { send: _send, error: _error, ...rest } = comment;
  return rest;
}

/**
 * 전송 시작: `pending`·`failed` 항목만 `sending`으로 바꾸고 보낼 본문을 모은다.
 * `sending`(이미 전송 중)·`sent`·목록에 없는 id는 제외한다(E-5 재전송).
 */
export function beginCommentSend(
  list: readonly LocalComment[],
  ids: readonly string[],
): { list: LocalComment[]; payload: ScreenCommentInput[] } {
  const targets = new Set(ids);
  const payload: ScreenCommentInput[] = [];
  const next = list.map((c) => {
    if (!targets.has(c.id) || (c.send !== 'pending' && c.send !== 'failed')) return c;
    payload.push(toSendable(c));
    const { error: _error, ...rest } = c;
    return { ...rest, send: 'sending' as const };
  });
  return { list: next, payload };
}

/** 전송 결과 반영: 성공은 `sent`(오류 삭제), 실패는 `failed`(사유 보관). */
export function finishCommentSend(
  list: readonly LocalComment[],
  ids: readonly string[],
  result: SendResult,
): LocalComment[] {
  const targets = new Set(ids);
  return list.map((c) => {
    if (!targets.has(c.id)) return c;
    if (result.ok) {
      const { error: _error, ...rest } = c;
      return { ...rest, send: 'sent' as const };
    }
    return { ...c, send: 'failed' as const, error: result.error };
  });
}

const SEND_STATES: readonly string[] = ['pending', 'sending', 'sent', 'failed'];

/** 저장소에서 읽은 값을 복원한다. 형식이 맞지 않는 값은 버리고, 끝나지 않은 전송은 실패로 표시한다(E-5·E-6). */
export function normalizeLoaded(entries: readonly unknown[]): LocalComment[] {
  return entries.filter(isLocalComment).map((c) => {
    const { error: _error, ...rest } = c;
    if (c.send === 'pending' || c.send === 'sending') return { ...rest, send: 'failed' as const };
    if (c.send === 'failed') {
      return c.error === undefined ? { ...rest, send: 'failed' as const } : { ...rest, send: 'failed' as const, error: c.error };
    }
    return { ...rest, send: 'sent' as const };
  });
}

/** 현재 페이지(`pageUrl` 일치) 코멘트만(E-9). */
export function commentsForPage(list: readonly LocalComment[], pageUrl: string): LocalComment[] {
  return list.filter((c) => c.pageUrl === pageUrl);
}

/** 목록·툴팁의 소스 위치. 상속 위치면 `(상속)`을 덧붙인다(E-3). */
export function commentWhere(c: Pick<LocalComment, 'source'>): string {
  const where = formatSourceLocation(c.source);
  return c.source.inherited ? `${where} (상속)` : where;
}

/** 목록에 보여 줄 본문 앞부분. `max`자를 넘으면 말줄임표를 붙인다. */
export function preview(body: string, max = 60): string {
  const text = body.trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function isLocalComment(value: unknown): value is LocalComment {
  if (!value || typeof value !== 'object') return false;
  const c = value as Partial<LocalComment>;
  const source = c.source as Partial<ScreenCommentInput['source']> | undefined;
  return (
    typeof c.id === 'string' &&
    typeof c.selectorHint === 'string' &&
    typeof c.pageUrl === 'string' &&
    typeof c.body === 'string' &&
    typeof c.createdAt === 'string' &&
    typeof c.send === 'string' &&
    SEND_STATES.includes(c.send) &&
    (c.error === undefined || typeof c.error === 'string') &&
    !!source &&
    typeof source.file === 'string' &&
    typeof source.line === 'number' &&
    typeof source.column === 'number' &&
    typeof source.inherited === 'boolean'
  );
}
