import { formatSourceLocation, type StyleChangeInput } from '@domirror/shared';

// 변경 내역 순수 로직(FR-7·FR-8·E-1·E-4·E-6). 모든 함수는 새 배열을 돌려주고 입력을 바꾸지 않는다.

export interface LocalChange extends Omit<StyleChangeInput, 'source'> {
  /** null = 위치 없음 → 전송 제외(E-1). */
  source: StyleChangeInput['source'] | null;
  /** 새로고침·재활성화 뒤 저장소에서 복원된 항목(E-6). 페이지 표시가 사라졌을 수 있다. */
  stale: boolean;
}

/** 같은 요소·같은 속성 판정 키: 소스 위치 + 선택자 요약 + 속성. */
export function changeKey(c: Pick<LocalChange, 'source' | 'selectorHint' | 'property'>): string {
  const where = c.source ? formatSourceLocation(c.source) : '(위치 없음)';
  return `${where}|${c.selectorHint}|${c.property}`;
}

/** 원래 값: 작성 원문이 있으면 그것, 없으면 계산값. 새 값이 이와 같으면 변경이 없는 것으로 본다. */
export function originalValue(c: Pick<LocalChange, 'before'>): string {
  return (c.before.authored ?? c.before.computed).trim();
}

/**
 * 편집 1건을 기록한다. 같은 key가 있으면 최초 before·id·createdAt을 유지하고 after만 바꾼다(FR-7).
 * 결과 after가 원래 값과 같으면 항목을 제거한다.
 */
export function recordChange(log: readonly LocalChange[], next: LocalChange): LocalChange[] {
  const key = changeKey(next);
  const index = log.findIndex((c) => changeKey(c) === key);
  if (index === -1) {
    return next.after.trim() === originalValue(next) ? [...log] : [...log, next];
  }
  const existing = log[index];
  if (next.after.trim() === originalValue(existing)) return log.filter((_, i) => i !== index);
  const merged: LocalChange = { ...existing, after: next.after, stale: false };
  return log.map((c, i) => (i === index ? merged : c));
}

export function removeChange(log: readonly LocalChange[], id: string): LocalChange[] {
  return log.filter((c) => c.id !== id);
}

/** 전송 대상: 위치가 있는 항목만, 로컬 전용 필드(stale)를 뺀 형태로. */
export function sendable(log: readonly LocalChange[]): StyleChangeInput[] {
  const out: StyleChangeInput[] = [];
  for (const c of log) {
    if (c.source === null) continue;
    const { stale: _stale, source, ...rest } = c;
    out.push({ ...rest, source });
  }
  return out;
}

/**
 * 전송 성공분을 목록에서 뺀다(서버가 보관). 전송 중에 다시 편집되어 after가 달라진 항목은
 * 아직 보내지 않은 값이므로 남긴다.
 */
export function removeSent(log: readonly LocalChange[], sent: readonly StyleChangeInput[]): LocalChange[] {
  const sentAfter = new Map(sent.map((c) => [c.id, c.after]));
  return log.filter((c) => sentAfter.get(c.id) !== c.after);
}

/** 저장소에서 읽은 항목을 복원 상태로 표시한다(E-6). 형태가 맞지 않는 값은 버린다. */
export function restoreStale(entries: readonly unknown[]): LocalChange[] {
  return entries.filter(isLocalChange).map((c) => ({ ...c, stale: true }));
}

function isLocalChange(value: unknown): value is LocalChange {
  if (!value || typeof value !== 'object') return false;
  const c = value as Partial<LocalChange>;
  return (
    typeof c.id === 'string' &&
    typeof c.property === 'string' &&
    typeof c.after === 'string' &&
    typeof c.selectorHint === 'string' &&
    typeof c.pageUrl === 'string' &&
    typeof c.createdAt === 'string' &&
    !!c.before &&
    typeof c.before.computed === 'string' &&
    (c.before.authored === null || typeof c.before.authored === 'string') &&
    (c.source === null || (!!c.source && typeof c.source.file === 'string'))
  );
}
