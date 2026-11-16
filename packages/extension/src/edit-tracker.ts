import type { StyleChangeInput } from '@domirror/shared';
import { AppliedStyles, type PrevInline, type StyledElement } from './applier.js';
import {
  changeKey,
  markStale,
  originalValue,
  recordChange,
  removeChange,
  sendable,
  settleSent,
  type LocalChange,
  type RebaseOptions,
} from './change-log.js';

// 편집 상태 조정 로직(적용 이력 + 변경 내역 + 전송 중 스냅숏). DOM에 의존하지 않아 가짜 요소로 테스트한다.

/** 편집 적용(FR-6)·기록(FR-7·E-2)·되돌리기(FR-8)·전송 정산(FR-9·D-1)을 함께 관리한다. 로그는 받아서 새 배열을 돌려준다. */
export class EditTracker {
  readonly #applied = new AppliedStyles();
  /** 전송 중인 항목 id별 요소 인라인 스냅숏. */
  #inflight = new Map<string, Map<StyledElement, PrevInline>>();

  /** `change.before`는 적용 전 readBefore 결과다(이 요소의 원래 값 판정에 쓴다, D-2). */
  edit(log: readonly LocalChange[], el: StyledElement, change: LocalChange): LocalChange[] {
    const key = changeKey(change);
    return recordChange(log, change, this.#applied.apply(key, el, change.property, change.after, originalValue(change)));
  }

  /** 항목 1건을 되돌린다. 대상이 없으면 입력 배열을 그대로 돌려준다(호출 측이 저장·렌더를 건너뛴다). */
  revert(log: readonly LocalChange[], id: string): LocalChange[] {
    const target = log.find((c) => c.id === id);
    if (!target) return log as LocalChange[];
    this.#applied.revert(changeKey(target));
    return removeChange(log, id);
  }

  revertAll(log: readonly LocalChange[]): LocalChange[] {
    for (const c of log) this.#applied.revert(changeKey(c));
    return [];
  }

  /** 전송 대상을 고르고 항목별 요소 인라인 값을 기록한다. */
  beginSend(log: readonly LocalChange[]): StyleChangeInput[] {
    const changes = sendable(log);
    this.#inflight = new Map(changes.map((c) => [c.id, this.#applied.snapshot(changeKey(c))]));
    return changes;
  }

  /** 전송 성공 정산. 같은 key를 여러 건 보냈으면 첫 항목 기준으로 1회만 정산한다. */
  endSend(
    log: readonly LocalChange[],
    sent: readonly StyleChangeInput[],
    rebase: RebaseOptions,
  ): { log: LocalChange[]; compensated: number } {
    const active = new Set<string>();
    const settled = new Set<string>();
    for (const s of sent) {
      const key = changeKey(s);
      if (settled.has(key)) continue;
      settled.add(key);
      if (this.#applied.settle(key, s.property, this.#inflight.get(s.id) ?? new Map(), s.after)) active.add(key);
    }
    this.#inflight = new Map();
    return settleSent(log, sent, (key) => active.has(key), rebase);
  }

  /** 분리된 요소의 항목을 stale로 표시한다(E-6·HMR). 바뀐 게 없으면 같은 배열을 돌려준다. */
  pruneDetached(log: LocalChange[]): LocalChange[] {
    return markStale(log, this.#applied.pruneDetached());
  }

  restoreAll(): void {
    this.#applied.restoreAll();
  }
}
