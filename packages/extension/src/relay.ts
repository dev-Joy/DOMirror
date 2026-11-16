import { CHANGES_PATH, type PostChangesRequest, type SendResult, type StyleChangeInput } from '@domirror/shared';

/** 서버가 응답하지 않을 때 패널이 무한 대기하지 않도록 끊는 시간. */
export const RELAY_TIMEOUT_MS = 10_000;

export function isValidPort(port: unknown): port is number {
  return typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 서버 오류 본문 `{ error }`가 있으면 그 문구를, 없으면 빈 문자열을 돌려준다. */
async function readServerError(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error;
  } catch {
    // JSON이 아니면 상태 코드만 보고한다.
  }
  return '';
}

/**
 * `POST http://127.0.0.1:<port>/changes`. 예외를 던지지 않고 네트워크 오류·비 2xx·잘못된 응답을
 * 모두 `{ ok: false, error }`로 돌려준다(E-4: 호출 측은 실패 시 내역을 유지한다).
 */
export async function postChanges(
  port: number,
  changes: StyleChangeInput[],
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  if (!isValidPort(port)) return { ok: false, error: `잘못된 포트: ${String(port)}` };

  const endpoint = `http://127.0.0.1:${port}${CHANGES_PATH}`;
  let res: Response;
  try {
    res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes } satisfies PostChangesRequest),
      signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
    });
  } catch (error) {
    return { ok: false, error: `서버에 연결할 수 없습니다(${endpoint}): ${errorMessage(error)}` };
  }

  if (!res.ok) {
    const detail = await readServerError(res);
    return { ok: false, error: `서버 오류 HTTP ${res.status}${detail ? `: ${detail}` : ''}` };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: '서버 응답을 해석할 수 없습니다' };
  }
  if (!body || typeof body !== 'object' || !('accepted' in body) || typeof body.accepted !== 'number') {
    return { ok: false, error: '서버 응답 형식이 올바르지 않습니다' };
  }
  return { ok: true, accepted: body.accepted };
}
