import { describe, expect, it } from 'vitest';
import { isOriginAllowed } from '../src/origin.js';

const ID = 'abcdefghijklmnopabcdefghijklmnop';

describe('isOriginAllowed', () => {
  it('Origin 헤더가 없으면 허용한다', () => {
    expect(isOriginAllowed(undefined, {})).toBe(true);
    expect(isOriginAllowed(undefined, { extensionId: ID })).toBe(true);
  });

  it('extensionId 미지정이면 모든 확장 출처를 허용한다', () => {
    expect(isOriginAllowed(`chrome-extension://${ID}`, {})).toBe(true);
  });

  it('extensionId 지정 시 그 id만 허용한다', () => {
    expect(isOriginAllowed(`chrome-extension://${ID}`, { extensionId: ID })).toBe(true);
    expect(isOriginAllowed('chrome-extension://otherextensionidotherextensionid', { extensionId: ID })).toBe(false);
  });

  it.each([
    'http://localhost:5173',
    'http://127.0.0.1:47321',
    'https://evil.example',
    'null',
    '',
    'chrome-extension://',
    `chrome-extension://${ID}/path`,
    `moz-extension://${ID}`,
  ])('그 외 출처 %j 는 거부한다', (origin) => {
    expect(isOriginAllowed(origin, {})).toBe(false);
  });
});
