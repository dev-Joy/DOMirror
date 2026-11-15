import type { StyleChange, StyleChangeInput } from '@domirror/shared';

/** 프로세스 메모리 저장소. 영속 저장 없음(재시작 시 소실). */
export class ChangeStore {
  readonly #changes = new Map<string, StyleChange>();

  /** 같은 `id`는 덮어쓰고 `pending`으로 되돌린다. 저장한 id 목록을 입력 순서대로 반환한다. */
  upsert(changes: StyleChangeInput[]): string[] {
    return changes.map((change) => {
      this.#changes.set(change.id, { ...change, status: 'pending' });
      return change.id;
    });
  }

  listPending(): StyleChange[] {
    return [...this.#changes.values()].filter((change) => change.status === 'pending');
  }

  /** 이미 `applied`인 id도 `applied`로 보고한다(멱등). */
  markApplied(ids: string[]): { applied: string[]; notFound: string[] } {
    const applied: string[] = [];
    const notFound: string[] = [];
    for (const id of new Set(ids)) {
      const change = this.#changes.get(id);
      if (change) {
        change.status = 'applied';
        applied.push(id);
      } else {
        notFound.push(id);
      }
    }
    return { applied, notFound };
  }

  pendingCount(): number {
    return this.listPending().length;
  }
}
