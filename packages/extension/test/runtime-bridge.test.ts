import { BRIDGE_CHANNEL } from '@domirror/shared';
import { describe, expect, it } from 'vitest';
import { isBridgeResult } from '../src/runtime-bridge.js';

const ID = 'dm-abc-1';

const validResult = {
  channel: BRIDGE_CHANNEL,
  type: 'inspect:result',
  id: ID,
  info: {
    name: 'Card',
    definition: { file: 'src/components/Card.tsx', line: 12, column: 5, precision: 'line-unverified' },
    callSite: { file: 'src/App.tsx', line: 20, column: 7, precision: 'exact' },
    owners: ['Card', 'App'],
    via: 'fiber',
  },
  hostSource: { file: 'src/components/Card.tsx', precision: 'line-unverified' },
};

describe('isBridgeResult', () => {
  it('정상 응답을 통과시키고 타입을 좁힌다 (AC-9)', () => {
    expect(isBridgeResult(validResult, ID)).toBe(true);
    if (isBridgeResult(validResult, ID)) {
      expect(validResult.info.name).toBe('Card');
      expect(validResult.hostSource.file).toBe('src/components/Card.tsx');
    }
  });

  it('컴포넌트를 찾지 못한 null info 응답도 통과시킨다', () => {
    expect(isBridgeResult({ channel: BRIDGE_CHANNEL, type: 'inspect:result', id: ID, info: null }, ID)).toBe(true);
  });

  it('다른 채널·type 메시지는 버린다 (E-11)', () => {
    expect(isBridgeResult({ ...validResult, channel: 'domirror:other' }, ID)).toBe(false);
    expect(isBridgeResult({ ...validResult, type: 'inspect' }, ID)).toBe(false);
    expect(isBridgeResult({ ...validResult, type: 'inspect:result:extra' }, ID)).toBe(false);
  });

  it('id가 다르면 위조 응답으로 보고 버린다 (E-11)', () => {
    expect(isBridgeResult(validResult, 'dm-abc-2')).toBe(false);
    expect(isBridgeResult({ ...validResult, id: 1 }, ID)).toBe(false);
  });

  it('객체가 아닌 값은 버린다', () => {
    expect(isBridgeResult(null, ID)).toBe(false);
    expect(isBridgeResult(undefined, ID)).toBe(false);
    expect(isBridgeResult(`${BRIDGE_CHANNEL}:inspect:result`, ID)).toBe(false);
  });

  it('info 형식이 틀리면 버린다', () => {
    const broken: unknown[] = [
      { ...validResult.info, name: '' },
      { ...validResult.info, name: 3 },
      { ...validResult.info, via: 'unknown' },
      { ...validResult.info, via: undefined },
      { ...validResult.info, definition: { file: 'src/App.tsx', precision: 'maybe' } },
      { ...validResult.info, definition: { file: '', precision: 'exact' } },
      { ...validResult.info, callSite: { file: 'src/App.tsx', line: 0, precision: 'exact' } },
      { ...validResult.info, owners: 'Card' },
      { ...validResult.info, owners: ['Card', 2] },
      'Card',
    ];
    for (const info of broken) {
      expect(isBridgeResult({ ...validResult, info }, ID)).toBe(false);
    }
  });

  it('hostSource 형식이 틀리면 버린다', () => {
    expect(isBridgeResult({ ...validResult, hostSource: 'src/App.tsx' }, ID)).toBe(false);
    expect(isBridgeResult({ ...validResult, hostSource: { file: 'src/App.tsx', precision: 'none' } }, ID)).toBe(false);
  });
});
