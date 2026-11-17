import type { ScreenComment, ScreenCommentInput } from '@domirror/shared';

export const MAX_COMMENTS = 500;

/** 프로세스 메모리 저장소. 영속 저장 없음(재시작 시 소실). */
export class CommentStore {
  readonly #comments = new Map<string, ScreenComment>();

  /** 같은 id는 내용을 덮어쓰고 기존 status를 유지한다(멱등 재전송). 입력 순서대로 id를 돌려준다. */
  upsert(comments: readonly ScreenCommentInput[]): string[] {
    const ids = comments.map((comment) => {
      const prev = this.#comments.get(comment.id);
      this.#comments.set(comment.id, { ...comment, status: prev?.status ?? 'open' });
      return comment.id;
    });
    while (this.#comments.size > MAX_COMMENTS) {
      const oldest = this.#comments.keys().next().value;
      if (oldest === undefined) break;
      this.#comments.delete(oldest);
    }
    return ids;
  }

  /** `open` 상태만, 생성 순서대로. */
  listOpen(): ScreenComment[] {
    return [...this.#comments.values()].filter((comment) => comment.status === 'open');
  }

  /** 이미 `resolved`인 id도 `resolved`로 보고한다(멱등). */
  markResolved(ids: string[]): { resolved: string[]; notFound: string[] } {
    const resolved: string[] = [];
    const notFound: string[] = [];
    for (const id of new Set(ids)) {
      const comment = this.#comments.get(id);
      if (comment) {
        comment.status = 'resolved';
        resolved.push(id);
      } else {
        notFound.push(id);
      }
    }
    return { resolved, notFound };
  }

  /** 저장 총 건수. */
  count(): number {
    return this.#comments.size;
  }
}
