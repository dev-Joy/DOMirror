import { describe, expect, it } from 'vitest';
import { parsePickerColor } from '../src/color.js';

describe('parsePickerColor', () => {
  it('rgb·rgba 쉼표 표기를 hex와 alpha로 변환한다', () => {
    expect(parsePickerColor('rgb(255, 0, 128)')).toEqual({ hex: '#ff0080', alpha: 1 });
    expect(parsePickerColor('rgba(0, 0, 0, 0)')).toEqual({ hex: '#000000', alpha: 0 });
  });

  it('공백·슬래시 표기의 alpha를 읽는다', () => {
    expect(parsePickerColor('rgb(10 20 30 / 0.5)')).toEqual({ hex: '#0a141e', alpha: 0.5 });
  });

  it('#rgb는 6자리로 확장하고 대문자 hex는 소문자로 바꾼다', () => {
    expect(parsePickerColor('#abc')).toEqual({ hex: '#aabbcc', alpha: 1 });
    expect(parsePickerColor('#AABBCC')).toEqual({ hex: '#aabbcc', alpha: 1 });
  });

  it('var()·키워드·빈 문자열은 null을 돌려준다', () => {
    expect(parsePickerColor('var(--x)')).toBeNull();
    expect(parsePickerColor('currentcolor')).toBeNull();
    expect(parsePickerColor('')).toBeNull();
  });
});
