import { BRIDGE_CHANNEL } from '@domirror/shared';
import { describe, expect, it } from 'vitest';
import { isBridgeResult, toRuntimeBridgeResult, type BridgeResultMessage } from '../src/runtime-bridge.js';

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

describe('toRuntimeBridgeResult — props·instanceCount 필드 정제 (INT-012 AC-4)', () => {
  const extras = { props: '{ title: "카드", apiToken: ••• }', instanceCount: { count: 4, capped: false } };

  function pick(message: unknown) {
    expect(isBridgeResult(message, ID)).toBe(true);
    return toRuntimeBridgeResult(message as BridgeResultMessage);
  }

  it('유효한 props·instanceCount를 유지하고 info·hostSource를 보존한다', () => {
    const result = pick({ ...validResult, ...extras });
    expect(result).toEqual({ info: validResult.info, hostSource: validResult.hostSource, ...extras });
  });

  it('extras가 없으면 키는 info(+hostSource)뿐이다', () => {
    expect(Object.keys(pick(validResult))).toEqual(['info', 'hostSource']);
    const { hostSource: _hostSource, ...withoutHost } = validResult;
    expect(Object.keys(pick(withoutHost))).toEqual(['info']);
  });

  it('형식이 틀린 props는 그 필드만 버린다', () => {
    for (const props of [42, '', 'x'.repeat(1025)]) {
      const result = pick({ ...validResult, ...extras, props });
      expect(result).not.toHaveProperty('props');
      expect(result.instanceCount).toEqual(extras.instanceCount);
      expect(result.info).toEqual(validResult.info);
    }
    expect(pick({ ...validResult, props: 'x'.repeat(1024) }).props).toHaveLength(1024);
  });

  it('형식이 틀린 instanceCount는 그 필드만 버린다', () => {
    const broken = [{ count: 0, capped: false }, { count: 1.5, capped: false }, { count: '3', capped: false }, { count: 3 }, { count: 3, capped: 'yes' }];
    for (const instanceCount of broken) {
      const result = pick({ ...validResult, ...extras, instanceCount });
      expect(result).not.toHaveProperty('instanceCount');
      expect(result.props).toBe(extras.props);
      expect(result.hostSource).toEqual(validResult.hostSource);
    }
  });

  it('형식 위반 extras가 있어도 isBridgeResult는 통과시킨다', () => {
    expect(isBridgeResult({ ...validResult, props: 42, instanceCount: { count: 0 } }, ID)).toBe(true);
  });
});
