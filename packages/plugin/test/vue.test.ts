import { describe, expect, it } from 'vitest';
import { vueInjector } from '../src/injectors/vue.js';

const root = '/proj';
const id = '/proj/src/App.vue';

type DesignSystemMatcher = NonNullable<Parameters<typeof vueInjector.transform>[2]['isDesignSystem']>;

function run(code: string, fileId = id, isDesignSystem?: DesignSystemMatcher): string | null {
  return vueInjector.transform(code, fileId, { root, isDesignSystem })?.code ?? null;
}

function locationOf(code: string, needle: string): string {
  const offset = code.indexOf(needle);
  const before = code.slice(0, offset).split('\n');
  return `${before.length}:${(before.at(-1) ?? '').length + 1}`;
}

/** `specifier`만 디자인 시스템으로 판정하는 함수 (FR-1 (b)). */
const dsSpecifiers =
  (...specifiers: string[]): DesignSystemMatcher =>
  ({ specifier }) =>
    specifier !== undefined && specifiers.includes(specifier);

describe('vueInjector', () => {
  it('쿼리 없는 .vue만 대상으로 한다', () => {
    expect(vueInjector.test('/proj/src/App.vue')).toBe(true);
    expect(vueInjector.test('/proj/src/App.vue?vue&type=template')).toBe(false);
    expect(vueInjector.test('/proj/src/App.tsx')).toBe(false);
  });

  it('<script>가 템플릿 앞에 있어도 파일 기준 위치를 쓴다', () => {
    const code = [
      '<script setup lang="ts">',
      '// 한글 주석 😀',
      "const msg = '<div>';",
      '</script>',
      '',
      '<template>',
      '  <main class="page">',
      '    <h1 class="title">{{ msg }}</h1>',
      '  </main>',
      '</template>',
      '',
    ].join('\n');
    const out = run(code);
    expect(out).toContain(
      `<main data-domirror="src/App.vue:${locationOf(code, '<main')}" data-domirror-component="App|src/App.vue" class="page">`,
    );
    expect(out).toContain(
      `<h1 data-domirror="src/App.vue:${locationOf(code, '<h1')}" data-domirror-component="App|src/App.vue" class="title">`,
    );
    expect(out).toContain("const msg = '<div>';");
  });

  it('컴포넌트·<template>·<slot>은 제외하고 그 안의 네이티브 요소에는 주입한다', () => {
    const code = [
      '<template>',
      '  <div>',
      '    <Card><p>x</p></Card>',
      '    <template v-if="ok"><span /></template>',
      '    <slot />',
      '    <component :is="x" />',
      '  </div>',
      '</template>',
      '',
    ].join('\n');
    const out = run(code) ?? '';
    expect(out).toContain(
      '<Card><p data-domirror="src/App.vue:3:11" data-domirror-component="App|src/App.vue">x</p></Card>',
    );
    expect(out).toContain(
      '<template v-if="ok"><span data-domirror="src/App.vue:4:25" data-domirror-component="App|src/App.vue" /></template>',
    );
    expect(out).toContain('<slot />');
    expect(out).toContain('<component :is="x" />');
    expect(out.match(/data-domirror="/g)).toHaveLength(3);
  });

  it('기존 data-domirror(정적·바인딩)는 보존한다', () => {
    const code = '<template>\n  <div data-domirror="keep:1:1"><span :data-domirror="v" /></div>\n</template>\n';
    expect(run(code)).toBeNull();
  });

  it('lang="pug" 템플릿은 null', () => {
    expect(run('<template lang="pug">\ndiv hello\n</template>\n')).toBeNull();
  });

  it('<template>이 없으면 null', () => {
    expect(run('<script setup>\nconst a = 1;\n</script>\n')).toBeNull();
  });

  describe('정의 측 컴포넌트 이름 (FR-4)', () => {
    it('디자인 시스템 파일이면 이름·경로와 data-domirror-ds를 넣는다 (AC-3)', () => {
      const code = '<template>\n  <button class="b">x</button>\n</template>\n';
      const out = run(code, '/proj/src/ds/Button.vue', ({ file }) => file === 'src/ds/Button.vue');
      expect(out).toContain(
        `<button data-domirror="src/ds/Button.vue:${locationOf(code, '<button')}" data-domirror-component="Button|src/ds/Button.vue" data-domirror-ds class="b">`,
      );
    });

    it('basename을 이름으로 쓰고 DS가 아니면 data-domirror-ds를 넣지 않는다', () => {
      const code = '<template>\n  <section />\n</template>\n';
      const out = run(code, '/proj/src/components/Card.vue', () => false);
      expect(out).toContain('data-domirror-component="Card|src/components/Card.vue"');
      expect(out).not.toContain('data-domirror-ds');
    });

    it('기존 data-domirror-component 속성은 중복 삽입하지 않는다', () => {
      const code = '<template>\n  <div data-domirror-component="Keep|x" />\n</template>\n';
      const out = run(code);
      expect(out).toContain('data-domirror-component="Keep|x"');
      expect(out?.match(/data-domirror-component=/g)).toHaveLength(1);
    });
  });

  describe('사용처 측 주입 (FR-5)', () => {
    it('script setup의 정적 import가 DS면 kebab 태그에 이름·specifier를 넣는다 (AC-4)', () => {
      const code = [
        '<script setup lang="ts">',
        "import AcmeButton from '@acme/ui';",
        '</script>',
        '',
        '<template>',
        '  <acme-button />',
        '</template>',
        '',
      ].join('\n');
      const out = run(code, id, dsSpecifiers('@acme/ui'));
      expect(out).toContain('<acme-button data-domirror-component="acme-button|@acme/ui" data-domirror-ds />');
    });

    it('DS가 아닌 import 태그에는 사용처 측 속성을 넣지 않는다 (AC-4)', () => {
      const code = [
        '<script setup lang="ts">',
        "import AcmeButton from 'other-ui';",
        '</script>',
        '<template>',
        '  <acme-button />',
        '</template>',
      ].join('\n');
      expect(run(code, id, dsSpecifiers('@acme/ui'))).toBeNull();
    });

    it('import가 없는 컴포넌트 태그에는 넣지 않는다 (E-2)', () => {
      expect(run('<template>\n  <Other />\n</template>\n', id, dsSpecifiers('@acme/ui'))).toBeNull();
    });

    it('script 파싱이 실패해도 정의 측 주입은 유지하고 사용처 측만 생략한다 (E-7)', () => {
      const code = [
        '<script setup lang="ts">',
        'const broken = ;',
        '</script>',
        '',
        '<template>',
        '  <div>',
        '    <AcmeButton />',
        '  </div>',
        '</template>',
        '',
      ].join('\n');
      const out = run(code, id, dsSpecifiers('@acme/ui'));
      expect(out).toContain('data-domirror-component="App|src/App.vue"');
      expect(out).not.toContain('|@acme/ui');
      expect(out?.match(/data-domirror="/g)).toHaveLength(1);
    });

    it('<component :is>·<slot>·<template>은 사용처 측에서도 제외한다', () => {
      const code = [
        '<template>',
        '  <div>',
        '    <component :is="x" />',
        '    <slot />',
        '    <template v-if="ok"><span /></template>',
        '  </div>',
        '</template>',
        '',
      ].join('\n');
      const out = run(code, id, dsSpecifiers('@acme/ui')) ?? '';
      expect(out).toContain('<component :is="x" />');
      expect(out).toContain('<slot />');
      expect(out.match(/data-domirror-component=/g)).toHaveLength(2);
    });

    it('기존 위치 값은 사용처 측 주입 뒤에도 바뀌지 않는다 (NFR-5)', () => {
      const code = [
        '<script setup lang="ts">',
        "import AcmeButton from '@acme/ui';",
        '</script>',
        '',
        '<template>',
        '  <div>',
        '    <acme-button />',
        '    <span>x</span>',
        '  </div>',
        '</template>',
        '',
      ].join('\n');
      const out = run(code, id, dsSpecifiers('@acme/ui'));
      expect(out).toContain(`<div data-domirror="src/App.vue:${locationOf(code, '<div')}"`);
      expect(out).toContain(`<span data-domirror="src/App.vue:${locationOf(code, '<span')}"`);
      expect(out).toContain('data-domirror-component="acme-button|@acme/ui"');
    });
  });
});
