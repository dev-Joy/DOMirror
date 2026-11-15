import path from 'node:path';

function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

/** 모듈 id에서 쿼리·해시를 제거한다. */
export function stripQuery(id: string): string {
  const index = id.search(/[?#]/);
  return index === -1 ? id : id.slice(0, index);
}

/**
 * 프로젝트 루트 기준 posix 상대 경로를 돌려준다 (NFR-2: 절대 경로를 노출하지 않음).
 * 가상 모듈, 루트 밖 파일, `node_modules` 하위 파일은 `null`.
 */
export function toRelativeFile(root: string, id: string): string | null {
  const file = toPosix(stripQuery(id));
  if (file === '' || file.startsWith('\0')) return null;

  const rel = path.posix.relative(toPosix(root), file);
  if (rel === '' || rel === '..' || rel.startsWith('../') || path.posix.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) {
    return null;
  }
  if (rel.split('/').includes('node_modules')) return null;
  return rel;
}
