import { describe, expect, it } from 'vitest';
import { elementBlockedReason, frameBlockedReason } from '../src/picker.js';

describe('frameBlockedReason', () => {
  it('iframe·frame 태그는 iframe 사유로 차단한다', () => {
    expect(frameBlockedReason('IFRAME')).toBe('iframe');
    expect(frameBlockedReason('FRAME')).toBe('iframe');
    expect(frameBlockedReason('iframe')).toBe('iframe');
  });

  it('그 밖의 태그나 포커스 없음은 차단하지 않는다', () => {
    expect(frameBlockedReason('BODY')).toBeNull();
    expect(frameBlockedReason('BUTTON')).toBeNull();
    expect(frameBlockedReason('FRAMESET')).toBeNull();
    expect(frameBlockedReason(null)).toBeNull();
    expect(frameBlockedReason(undefined)).toBeNull();
  });
});

describe('elementBlockedReason (INT-013 AC-6)', () => {
  const html = { tagName: 'HTML' };
  const body = { tagName: 'BODY' };
  const doc = { documentElement: html, body };

  it('문서의 <html>·<body>는 root-element로 차단한다', () => {
    expect(elementBlockedReason(html, doc)).toBe('root-element');
    expect(elementBlockedReason(body, doc)).toBe('root-element');
  });

  it('일반 요소는 차단하지 않고 프레임은 iframe 사유다', () => {
    expect(elementBlockedReason({ tagName: 'DIV' }, doc)).toBeNull();
    expect(elementBlockedReason({ tagName: 'IFRAME' }, doc)).toBe('iframe');
  });

  it('이 문서의 body가 아닌 BODY 태그는 차단하지 않는다 (동일성 비교)', () => {
    expect(elementBlockedReason({ tagName: 'BODY' }, doc)).toBeNull();
    expect(elementBlockedReason({ tagName: 'HTML' }, { documentElement: undefined, body: null })).toBeNull();
  });
});
