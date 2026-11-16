import { describe, expect, it } from 'vitest';
import { frameBlockedReason } from '../src/picker.js';

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
