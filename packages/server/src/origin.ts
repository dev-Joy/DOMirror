const EXTENSION_ORIGIN = /^chrome-extension:\/\/([a-z0-9]+)$/;

/**
 * NFR-1 Origin 규칙.
 * ① 헤더 없음 → 허용(비브라우저 MCP 클라이언트)
 * ② `chrome-extension://<id>` → 허용(`extensionId` 지정 시 그 id만)
 * ③ 그 외(웹 페이지의 `http://localhost:*` 포함) → 거부
 */
export function isOriginAllowed(origin: string | undefined, cfg: { extensionId?: string }): boolean {
  if (origin === undefined) return true;
  const match = EXTENSION_ORIGIN.exec(origin);
  if (!match) return false;
  return cfg.extensionId === undefined || match[1] === cfg.extensionId;
}
