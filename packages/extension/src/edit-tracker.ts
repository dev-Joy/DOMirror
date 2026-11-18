import type { StyleChangeInput } from '@domirror/shared';
import { AppliedStyles, type StyledElement } from './applier.js';
import { changeKey, markStale, originalValue, recordChange, removeChange, sendable, settleSent, type LocalChange } from './change-log.js';
import type { ReadComputed, VerifyItem } from './verify.js';

// 편집 상태 조정 로직(적용 이력 + 변경 내역 + 전송 중 잠금). DOM에 의존하지 않아 가짜 요소로 테스트한다.

/**
 * 편집 적용(FR-6)·기록(FR-7·E-2)·되돌리기(FR-8)·전송 정산(FR-9)을 함께 관리한다. 로그는 받아서 새 배열을 돌려준다.
 * 전송 응답을 기다리는 동안(`sending`)은 편집·되돌리기를 거부해(입력 배열을 그대로 돌려준다) 보낸 내용과 페이지·내역이 어긋나지 않게 한다.
 */
export class EditTracker {
  readonly #applied = new AppliedStyles();
  #sending = false;

  /** 전송 응답 대기 중(편집·되돌리기 잠금). */
  get sending(): boolean {
    return this.#sending;
  }

  /** `change.before`는 적용 전 readBefore 결과다(이 요소의 원래 값 판정에 쓴다, D-2). 잠금 중이면 적용하지 않는다. */
  edit(log: readonly LocalChange[], el: StyledElement, change: LocalChange): LocalChange[] {
    if (this.#sending) return log as LocalChange[];
    const key = changeKey(change);
    return recordChange(log, change, this.#applied.apply(key, el, change.property, change.after, originalValue(change)));
  }

  /** 항목 1건을 되돌린다. 대상이 없거나 잠금 중이면 입력 배열을 그대로 돌려준다(호출 측이 저장·렌더를 건너뛴다). */
  revert(log: readonly LocalChange[], id: string): LocalChange[] {
    if (this.#sending) return log as LocalChange[];
    const target = log.find((c) => c.id === id);
    if (!target) return log as LocalChange[];
    this.#applied.revert(changeKey(target));
    return removeChange(log, id);
  }

  /** 잠금 중이면 입력 배열을 그대로 돌려준다. */
  revertAll(log: readonly LocalChange[]): LocalChange[] {
    if (this.#sending) return log as LocalChange[];
    for (const c of log) this.#applied.revert(changeKey(c));
    return [];
  }

  /** 전송 대상(위치 있는 항목)을 고른다. 1건 이상이면 응답 처리(finishSend)까지 편집·되돌리기를 잠근다. */
  beginSend(log: readonly LocalChange[]): StyleChangeInput[] {
    const changes = sendable(log);
    if (changes.length > 0) this.#sending = true;
    return changes;
  }

  /** 전송 성공 정산: 보낸 key의 요소 추적을 전송 기록으로 옮기고(페이지 표시는 보낸 값 그대로) 보낸 항목을 내역에서 뺀다. 잠금은 finishSend가 푼다. */
  endSend(log: readonly LocalChange[], sent: readonly StyleChangeInput[]): LocalChange[] {
    for (const s of sent) {
      this.#applied.markSent(changeKey(s), s.after, { selectorHint: s.selectorHint, source: s.source });
    }
    return settleSent(log, sent);
  }

  /** 반영 확인할 전송 항목 수(FR-2 활성 조건). */
  get sentCount(): number {
    return this.#applied.sentCount;
  }

  /** 반영 확인(FR-3·FR-4): 전송 기록을 해제·비교한 결과. 전송 중이면 null(잠금, E-1)이고 상태를 바꾸지 않는다. */
  verifySent(read: ReadComputed): VerifyItem[] | null {
    if (this.#sending) return null;
    return this.#applied.releaseSent(read);
  }

  /** 응답 처리 끝(성공·실패·예외 공통): 잠금을 푼다. */
  finishSend(): void {
    this.#sending = false;
  }

  /** 분리된 요소의 항목을 stale로 표시한다(E-6·HMR). 잠금 중에도 동작한다. 바뀐 게 없으면 같은 배열을 돌려준다. */
  pruneDetached(log: LocalChange[]): LocalChange[] {
    return markStale(log, this.#applied.pruneDetached());
  }

  restoreAll(): void {
    this.#applied.restoreAll();
  }
}
