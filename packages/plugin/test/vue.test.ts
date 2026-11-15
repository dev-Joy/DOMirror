import { describe, expect, it } from 'vitest';
import { vueInjector } from '../src/injectors/vue.js';

const root = '/proj';
const id = '/proj/src/App.vue';

function run(code: string): string | null {
  return vueInjector.transform(code, id, { root })?.code ?? null;
}

function locationOf(code: string, needle: string): string {
  const offset = code.indexOf(needle);
  const before = code.slice(0, offset).split('\n');
  return `${before.length}:${(before.at(-1) ?? '').length + 1}`;
}

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
    expect(out).toContain(`<main data-domirror="src/App.vue:${locationOf(code, '<main')}" class="page">`);
    expect(out).toContain(`<h1 data-domirror="src/App.vue:${locationOf(code, '<h1')}" class="title">`);
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
    expect(out).toContain('<Card><p data-domirror="src/App.vue:3:11">x</p></Card>');
    expect(out).toContain('<template v-if="ok"><span data-domirror="src/App.vue:4:25" /></template>');
    expect(out).toContain('<slot />');
    expect(out).toContain('<component :is="x" />');
    expect(out.match(/data-domirror/g)).toHaveLength(3);
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
});
