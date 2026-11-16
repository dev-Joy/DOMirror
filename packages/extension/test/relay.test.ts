import { CHANGES_PATH, type StyleChangeInput } from '@domirror/shared';
import { describe, expect, it, vi } from 'vitest';
import { isValidPort, postChanges } from '../src/relay.js';

const change: StyleChangeInput = {
  id: 'chg-1',
  source: { file: 'src/App.tsx', line: 12, column: 5, inherited: false },
  selectorHint: 'div.card',
  property: 'padding',
  before: { authored: '8px', computed: '8px' },
  after: '16px',
  pageUrl: 'http://localhost:5173/',
  createdAt: '2026-11-16T00:00:00.000Z',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('postChanges', () => {
  it('성공 시 accepted 수를 돌려주고 127.0.0.1:<port>/changes로 JSON POST한다', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, { accepted: 1, ids: ['chg-1'] }));

    await expect(postChanges(47321, [change], fetchImpl)).resolves.toEqual({ ok: true, accepted: 1 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`http://127.0.0.1:47321${CHANGES_PATH}`);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init?.body as string)).toEqual({ changes: [change] });
  });

  it('비 2xx는 상태 코드와 서버 오류 문구를 담아 실패로 돌려준다', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(403, { error: 'Origin not allowed' }));

    const result = await postChanges(47321, [change], fetchImpl);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('403');
      expect(result.error).toContain('Origin not allowed');
    }
  });

  it('비 2xx 본문이 JSON이 아니어도 상태 코드로 실패를 돌려준다', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('oops', { status: 500 }));

    const result = await postChanges(47321, [change], fetchImpl);

    expect(result).toEqual({ ok: false, error: '서버 오류 HTTP 500' });
  });

  it('네트워크 오류(서버 꺼짐)는 예외 대신 실패로 돌려준다', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await postChanges(47321, [change], fetchImpl);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('127.0.0.1:47321');
      expect(result.error).toContain('Failed to fetch');
    }
  });

  it('2xx라도 응답 형식이 맞지 않으면 실패로 돌려준다', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, { ids: [] }));

    await expect(postChanges(47321, [change], fetchImpl)).resolves.toEqual({
      ok: false,
      error: '서버 응답 형식이 올바르지 않습니다',
    });
  });

  it('잘못된 포트는 요청하지 않고 실패로 돌려준다', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    for (const port of [0, -1, 65536, 1.5, Number.NaN]) {
      const result = await postChanges(port, [change], fetchImpl);
      expect(result.ok).toBe(false);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('isValidPort', () => {
  it('1~65535 정수만 허용한다', () => {
    expect([1, 47321, 65535].every(isValidPort)).toBe(true);
    expect([0, 65536, 1.5, '47321', null, undefined].some(isValidPort)).toBe(false);
  });
});
