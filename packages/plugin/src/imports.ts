/**
 * 정적 import 매핑에 필요한 필드만 구조적으로 정의한다.
 * `oxc-parser`의 `EcmaScriptModule.staticImports`와 호환되는 최소 구조다.
 */
export interface StaticImportLike {
  moduleRequest: { value: string };
  entries: readonly {
    localName: { value: string };
    isType: boolean;
  }[];
}

/**
 * `localName` → import specifier 매핑을 만든다 (FR-5, React·Vue 공용).
 * 타입 전용 import(`isType === true`)는 런타임 값이 아니므로 제외한다.
 */
export function mapStaticImports(imports: readonly StaticImportLike[] | undefined): Map<string, string> {
  const map = new Map<string, string>();

  for (const entry of imports ?? []) {
    for (const specifier of entry.entries) {
      if (specifier.isType) continue;
      map.set(specifier.localName.value, entry.moduleRequest.value);
    }
  }

  return map;
}
