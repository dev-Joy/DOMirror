import { formatSourceLocation, type StyleChangeInput } from '@domirror/shared';

// 변경 내역 순수 로직(FR-7·FR-8·FR-9·E-1·E-4·E-6). 모든 함수는 새 배열을 돌려주고 입력을 바꾸지 않는다.
// 원래 값 판정(요소 단위, D-2)은 applier가 하고, 여기서는 그 결과(active)로 항목을 남기거나 지운다.

export interface LocalChange extends Omit<StyleChangeInput, 'source'> {
  /** null = 위치 없음 → 전송 제외(E-1). */
  source: StyleChangeInput['source'] | null;
  /** 새로고침·재활성화 뒤 저장소에서 복원된 항목(E-6). 페이지 표시가 사라졌을 수 있다. */
  stale: boolean;
}

/**
 * 같은 요소·같은 속성 판정 키.
 * - 요소 자신의 소스 위치(`inherited === false`): 위치 + 속성. class 변화·반복 렌더링(E-2)과 무관하게 위치당 1건.
 * - 조상 위치·위치 없음: 서로 다른 요소가 합쳐지지 않도록 선택자 요약을 함께 쓴다.
 */
export function changeKey(c: Pick<LocalChange, 'source' | 'selectorHint' | 'property'>): string {
  if (c.source && !c.source.inherited) return `${formatSourceLocation(c.source)}|${c.property}`;
  const where = c.source ? `${formatSourceLocation(c.source)} (조상)` : '(위치 없음)';
  return `${where}|${c.selectorHint}|${c.property}`;
}

/** 원래 값: 작성 원문이 있으면 그것, 없으면 계산값. 요소의 새 값이 이와 같으면 그 요소는 변경이 없는 것으로 본다. */
export function originalValue(c: Pick<LocalChange, 'before'>): string {
  return (c.before.authored ?? c.before.computed).trim();
}

/**
 * 편집 1건을 기록한다. `active`는 그 key에 원래 값과 다른 요소가 남아 있는지다(요소 단위 판정은 applier, D-2).
 * - `active=false`: 그 key 항목을 제거한다(편집한 모든 요소가 각자 원래 값으로 돌아옴).
 * - `active=true`: 같은 key가 있으면 최초 before·id·createdAt·selectorHint를 유지하고 after만 바꾸며(stale 해제), 없으면 추가한다(FR-7·E-2).
 *   after가 최초 before와 같아도 유지한다(같은 소스의 다른 요소가 원래 값과 다름).
 */
export function recordChange(log: readonly LocalChange[], next: LocalChange, active: boolean): LocalChange[] {
  const key = changeKey(next);
  if (!active) return log.filter((c) => changeKey(c) !== key);
  const index = log.findIndex((c) => changeKey(c) === key);
  if (index === -1) return [...log, next];
  const existing = log[index];
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

export interface RebaseOptions {
  /** 남긴 항목의 새 id(서버의 보낸 항목과 구분). */
  newId(): string;
  /** 남긴 항목의 새 createdAt. */
  now: string;
}

/**
 * 전송 성공 처리(FR-9·E-4·D-1). 보낸 값은 서버가 보관하므로, 페이지가 보낸 상태와 같은 key는 목록에서 빼고
 * 다른 key는 전송 후 같은 조작을 한 경우와 같도록 보낸 값을 before로 하는 항목으로 남긴다.
 * `isActive(key)`: 그 key에 보낸 값과 다른(원복 대상) 요소가 남아 있는지(applier 판정).
 * 보낸 항목 s마다 대응 항목 c = 같은 id 항목, 없으면 전송 중 새로 생긴 같은 key 항목:
 * - 페이지가 보낸 상태이고 c의 after도 보낸 값이면: c를 뺀다.
 *   (페이지와 무관하게 c.after가 보낸 값과 다르면 아직 보내지 않은 값이므로 남긴다, E-4.)
 * - c가 없으면(전송 중 되돌리기·전체 되돌리기·원래 값 재편집으로 로그에서 지워짐): 페이지 추적 여부(isActive)와 무관하게
 *   "보낸 값 → 원래 값" 보정 항목을 새 id로 추가한다(`compensated` 건수). 복원·분리된 stale 항목도 같다(D-A).
 * - c가 보낸 항목 자신이면: 새 id·createdAt, before = 보낸 값(R-2).
 * - c가 전송 중 새로 생긴 항목이면: id·createdAt은 유지하고 before만 보낸 값으로 바꾼다.
 */
export function settleSent(
  log: readonly LocalChange[],
  sent: readonly StyleChangeInput[],
  isActive: (key: string) => boolean,
  rebase: RebaseOptions,
): { log: LocalChange[]; compensated: number } {
  const sentIds = new Set(sent.map((s) => s.id));
  const out = [...log];
  let compensated = 0;
  for (const s of sent) {
    const key = changeKey(s);
    let index = out.findIndex((c) => c.id === s.id);
    if (index === -1) index = out.findIndex((c) => !sentIds.has(c.id) && changeKey(c) === key);
    const c = index === -1 ? undefined : out[index];
    const sentBefore = { authored: s.after, computed: s.after };
    if (!c) {
      out.push({ ...s, id: rebase.newId(), before: sentBefore, after: originalValue(s), createdAt: rebase.now, stale: false });
      compensated++;
      continue;
    }
    if (!isActive(key) && c.after.trim() === s.after.trim()) {
      out.splice(index, 1);
      continue;
    }
    out[index] =
      c.id === s.id
        ? { ...c, id: rebase.newId(), before: sentBefore, createdAt: rebase.now, stale: false }
        : { ...c, before: sentBefore, stale: false };
  }
  return { log: out, compensated };
}

/** 페이지에서 분리된 요소의 항목(key)을 stale로 표시한다(E-6·HMR). 바뀐 것이 없으면 입력 배열을 그대로 돌려준다. */
export function markStale(log: LocalChange[], keys: ReadonlySet<string>): LocalChange[] {
  if (keys.size === 0 || !log.some((c) => !c.stale && keys.has(changeKey(c)))) return log;
  return log.map((c) => (!c.stale && keys.has(changeKey(c)) ? { ...c, stale: true } : c));
}

/**
 * 불러온(복원) 항목과 불러오기 전에 이미 편집한 항목을 합친다.
 * 같은 id는 현재 항목이 우선하고, 같은 key면 복원 항목의 id·before·createdAt(최초 이전값, FR-7)에 현재 after를 얹는다.
 * `dirty`는 저장할 id, `removed`는 저장소에서 지울 id(복원 항목에 흡수된 현재 항목의 id)다.
 */
export function mergeLoaded(
  restored: readonly LocalChange[],
  current: readonly LocalChange[],
): { log: LocalChange[]; dirty: Set<string>; removed: Set<string> } {
  const currentIds = new Set(current.map((c) => c.id));
  const log = restored.filter((r) => !currentIds.has(r.id));
  const dirty = new Set<string>();
  const removed = new Set<string>();
  for (const c of current) {
    const key = changeKey(c);
    const index = log.findIndex((r) => changeKey(r) === key);
    if (index === -1) {
      log.push(c);
      dirty.add(c.id);
      continue;
    }
    const r = log[index];
    log[index] = { ...c, id: r.id, before: r.before, createdAt: r.createdAt, stale: false };
    dirty.add(r.id);
    removed.add(c.id);
  }
  return { log, dirty, removed };
}

/** 이전·다음 목록 차이: 새로 생기거나 바뀐(객체가 다른) id와 사라진 id. */
export function diffLog(prev: readonly LocalChange[], next: readonly LocalChange[]): { dirty: Set<string>; removed: Set<string> } {
  const prevById = new Map(prev.map((c) => [c.id, c]));
  const nextIds = new Set(next.map((c) => c.id));
  const dirty = new Set(next.filter((c) => prevById.get(c.id) !== c).map((c) => c.id));
  const removed = new Set(prev.filter((c) => !nextIds.has(c.id)).map((c) => c.id));
  return { dirty, removed };
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
