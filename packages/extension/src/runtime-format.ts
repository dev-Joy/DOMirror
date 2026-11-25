import {
  formatSourceLocation,
  type ComponentRuntimeInfo,
  type InstanceCount,
  type RuntimeSourceRef,
  type SourceLocation,
} from '@domirror/shared';

// 런타임 컴포넌트 정보의 표시 문자열·검증(FR-5·FR-7·FR-10·E-10). DOM·chrome에 의존하지 않는 순수 함수다.
// 정확도(`precision`)는 라인 신뢰 여부만 뜻하므로, 신뢰할 수 없으면 `라인 미확인`을 덧붙인다.

/** 라인을 신뢰할 수 없을 때 표시하는 문구(FR-5·Q1(a)). */
export const LINE_UNVERIFIED = '라인 미확인';

const VIA_VALUES: readonly string[] = ['plugin', 'devtools', 'fiber'];
const PRECISION_VALUES: readonly string[] = ['exact', 'line-unverified'];

/** 예: `src/components/Card.tsx:12:5 (라인 미확인)` */
export function formatRuntimeRef(ref: RuntimeSourceRef): string {
  const path =
    ref.line === undefined
      ? ref.file
      : ref.column === undefined
        ? `${ref.file}:${ref.line}`
        : formatSourceLocation({ file: ref.file, line: ref.line, column: ref.column });
  return ref.precision === 'line-unverified' ? `${path} (${LINE_UNVERIFIED})` : path;
}

/** `source`(필수 line·column)에 넣을 값으로 바꾼다. 라인이 없으면 1로 채우고 정확도는 `precision`에 남긴다(Q2(a)). */
export function runtimeSourceLocation(ref: RuntimeSourceRef): SourceLocation {
  return { file: ref.file, line: ref.line ?? 1, column: ref.column ?? 1 };
}

/** 코멘트·프롬프트에 쓸 런타임 위치: 요소(호스트) 위치 → 정의 위치 순(Q2). */
export function runtimeSourceRefOf(
  runtime: { info?: ComponentRuntimeInfo | null; hostSource?: RuntimeSourceRef } | null | undefined,
): RuntimeSourceRef | null {
  const info = runtime?.info;
  if (!info) return null;
  return runtime?.hostSource ?? info.definition ?? null;
}

/** owner chain은 가까운 순으로 저장되므로 계층 표시는 바깥 → 안쪽으로 뒤집는다(FR-4·FR-7). */
export function ownerChainText(owners: readonly string[] | undefined): string | null {
  if (!owners || owners.length === 0) return null;
  return [...owners].reverse().join(' › ');
}

function isPositiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function isRuntimeSourceRef(value: unknown): value is RuntimeSourceRef {
  if (typeof value !== 'object' || value === null) return false;
  const ref = value as { file?: unknown; line?: unknown; column?: unknown; precision?: unknown };
  if (typeof ref.file !== 'string' || ref.file === '') return false;
  if (typeof ref.precision !== 'string' || !PRECISION_VALUES.includes(ref.precision)) return false;
  if (ref.line !== undefined && !isPositiveInteger(ref.line)) return false;
  if (ref.column !== undefined && !isPositiveInteger(ref.column)) return false;
  return true;
}

/** 브리지 응답·저장소에서 읽은 컴포넌트 정보의 형식 검증(E-10·E-11). */
export function isComponentRuntimeInfo(value: unknown): value is ComponentRuntimeInfo {
  if (typeof value !== 'object' || value === null) return false;
  const info = value as {
    name?: unknown;
    definition?: unknown;
    callSite?: unknown;
    owners?: unknown;
    via?: unknown;
  };
  if (typeof info.name !== 'string' || info.name === '') return false;
  if (typeof info.via !== 'string' || !VIA_VALUES.includes(info.via)) return false;
  if (info.definition !== undefined && !isRuntimeSourceRef(info.definition)) return false;
  if (info.callSite !== undefined && !isRuntimeSourceRef(info.callSite)) return false;
  if (info.owners !== undefined) {
    if (!Array.isArray(info.owners) || info.owners.some((owner) => typeof owner !== 'string')) return false;
  }
  return true;
}

/** 브리지 응답의 인스턴스 수 형식 검증(INT-012 spec §6). count는 양의 정수, capped는 불리언. */
export function isInstanceCount(value: unknown): value is InstanceCount {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as { count?: unknown; capped?: unknown };
  return isPositiveInteger(data.count) && typeof data.capped === 'boolean';
}

/** 예: `4개`, `20000+개`(상한 도달, FR-6) */
export function formatInstanceCount(value: InstanceCount): string {
  return `${value.count}${value.capped ? '+' : ''}개`;
}
