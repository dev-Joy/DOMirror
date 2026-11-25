import { describe, expect, it } from 'vitest';
import {
  formatInstanceCount,
  formatRuntimeRef,
  isComponentRuntimeInfo,
  isInstanceCount,
  isRuntimeSourceRef,
  ownerChainText,
  runtimeSourceLocation,
  runtimeSourceRefOf,
} from '../src/runtime-format.js';

describe('formatRuntimeRef — 정확도 표시 (FR-5·AC-4)', () => {
  it('라인·컬럼이 있으면 파일:라인:컬럼', () => {
    expect(formatRuntimeRef({ file: 'src/App.tsx', line: 12, column: 5, precision: 'exact' })).toBe('src/App.tsx:12:5');
  });

  it('라인 미검증이면 `라인 미확인`을 덧붙인다', () => {
    expect(formatRuntimeRef({ file: 'src/App.tsx', line: 12, column: 5, precision: 'line-unverified' })).toBe(
      'src/App.tsx:12:5 (라인 미확인)',
    );
  });

  it('라인이 없으면 파일만 적고 컬럼만 있으면 쓰지 않는다', () => {
    expect(formatRuntimeRef({ file: 'src/App.tsx', precision: 'line-unverified' })).toBe('src/App.tsx (라인 미확인)');
    expect(formatRuntimeRef({ file: 'src/App.tsx', column: 5, precision: 'exact' })).toBe('src/App.tsx');
    expect(formatRuntimeRef({ file: 'src/App.tsx', line: 3, precision: 'exact' })).toBe('src/App.tsx:3');
  });
});

describe('runtimeSourceLocation — source 채움 규칙 (Q2(a))', () => {
  it('라인이 없으면 1로 채우고 원본 정확도는 유지한다', () => {
    const ref = { file: 'src/App.tsx', precision: 'line-unverified' as const };
    expect(runtimeSourceLocation(ref)).toEqual({ file: 'src/App.tsx', line: 1, column: 1 });
    expect(ref.precision).toBe('line-unverified');
  });
});

describe('runtimeSourceRefOf', () => {
  const definition = { file: 'src/components/Card.tsx', line: 12, column: 5, precision: 'line-unverified' as const };
  const hostSource = { file: 'src/components/Card.tsx', line: 17, column: 3, precision: 'line-unverified' as const };

  it('정보가 없으면 null', () => {
    expect(runtimeSourceRefOf(null)).toBeNull();
    expect(runtimeSourceRefOf({ info: null, hostSource })).toBeNull();
  });

  it('요소(호스트) 위치를 먼저 쓰고 없으면 정의 위치를 쓴다', () => {
    expect(runtimeSourceRefOf({ info: { name: 'Card', definition, via: 'fiber' }, hostSource })).toBe(hostSource);
    expect(runtimeSourceRefOf({ info: { name: 'Card', definition, via: 'fiber' } })).toBe(definition);
    expect(runtimeSourceRefOf({ info: { name: 'Card', via: 'fiber' } })).toBeNull();
  });
});

describe('ownerChainText', () => {
  it('가까운 순 데이터를 바깥 → 안쪽으로 뒤집어 표시한다', () => {
    expect(ownerChainText(['Card', 'Layout', 'App'])).toBe('App › Layout › Card');
    expect(ownerChainText([])).toBeNull();
    expect(ownerChainText(undefined)).toBeNull();
  });
});

describe('브리지·저장소 형식 검증 (E-10)', () => {
  it('RuntimeSourceRef는 파일·정확도·양의 정수 라인을 요구한다', () => {
    expect(isRuntimeSourceRef({ file: 'src/App.tsx', precision: 'exact' })).toBe(true);
    expect(isRuntimeSourceRef({ file: '', precision: 'exact' })).toBe(false);
    expect(isRuntimeSourceRef({ file: 'src/App.tsx', precision: 'none' })).toBe(false);
    expect(isRuntimeSourceRef({ file: 'src/App.tsx', line: 0, precision: 'exact' })).toBe(false);
  });

  it('ComponentRuntimeInfo는 이름·via·선택 필드 형식을 검사한다', () => {
    const valid = {
      name: 'Card',
      definition: { file: 'src/components/Card.tsx', line: 12, column: 5, precision: 'line-unverified' },
      owners: ['Card', 'App'],
      via: 'fiber',
    };
    expect(isComponentRuntimeInfo(valid)).toBe(true);
    expect(isComponentRuntimeInfo({ ...valid, name: '' })).toBe(false);
    expect(isComponentRuntimeInfo({ ...valid, via: 'unknown' })).toBe(false);
    expect(isComponentRuntimeInfo({ ...valid, definition: { file: '', precision: 'exact' } })).toBe(false);
    expect(isComponentRuntimeInfo({ ...valid, owners: ['Card', 2] })).toBe(false);
    expect(isComponentRuntimeInfo(null)).toBe(false);
  });
});

describe('인스턴스 수 표시·검증 (INT-012 FR-6)', () => {
  it('formatInstanceCount — 상한 도달 시 N+개', () => {
    expect(formatInstanceCount({ count: 4, capped: false })).toBe('4개');
    expect(formatInstanceCount({ count: 20000, capped: true })).toBe('20000+개');
  });

  it('isInstanceCount — count는 양의 정수, capped는 불리언', () => {
    expect(isInstanceCount({ count: 1, capped: false })).toBe(true);
    expect(isInstanceCount({ count: 20000, capped: true })).toBe(true);
    expect(isInstanceCount({ count: 0, capped: false })).toBe(false);
    expect(isInstanceCount({ count: 1.5, capped: false })).toBe(false);
    expect(isInstanceCount({ count: '3', capped: false })).toBe(false);
    expect(isInstanceCount({ count: 3 })).toBe(false);
    expect(isInstanceCount({ count: 3, capped: 'yes' })).toBe(false);
    expect(isInstanceCount(null)).toBe(false);
    expect(isInstanceCount(3)).toBe(false);
  });
});
