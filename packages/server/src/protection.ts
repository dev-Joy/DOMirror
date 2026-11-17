import type { PendingChange, StyleChange } from '@domirror/shared';

export const PROTECTED_AREA_MESSAGE =
  'Protected area (shared component / design system source): editing this file changes every screen that uses it. Prefer overriding the style at the usage site, or ask the user before editing the original.';

/** 저장하지 않고 응답 시 계산한다(D-S2). 경고가 없으면 저장된 객체를 그대로 돌려준다. */
export function withProtectionWarning(change: StyleChange): PendingChange {
  const reason: 'pattern' | 'node_modules' | null = change.source.file.split('/').includes('node_modules')
    ? 'node_modules'
    : change.source.protected === true
      ? 'pattern'
      : null;
  if (reason === null) return change;
  return { ...change, warning: { code: 'protected-area', reason, message: PROTECTED_AREA_MESSAGE } };
}
