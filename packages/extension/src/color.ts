/** 피커용 색 정보(FR-1). hex는 소문자 #rrggbb, alpha 0~1. */
export interface PickerColor {
  hex: string;
  alpha: number;
}

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/;
const RGB_RE =
  /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)\s*(?:[,/]\s*(\d*\.?\d+%?))?\s*\)$/;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** 채널 값을 반올림·0~255 clamp 후 2자리 hex로 바꾼다(FR-1). */
function channelHex(raw: string): string {
  return clamp(Math.round(Number(raw)), 0, 255).toString(16).padStart(2, '0');
}

/** alpha 문자열(숫자 또는 %)을 0~1로 바꾼다. 없으면 1(FR-1). */
function parseAlpha(raw: string | undefined): number {
  if (raw === undefined) return 1;
  const n = raw.endsWith('%') ? Number(raw.slice(0, -1)) / 100 : Number(raw);
  return Number.isFinite(n) ? clamp(n, 0, 1) : 1;
}

/** `rgb(r, g, b)`·`rgba(r, g, b, a)`·`rgb(r g b / a)`·`#rgb`·`#rrggbb` 지원. 그 외(var(), 키워드, 빈 문자열 등) null(FR-1). */
export function parsePickerColor(value: string): PickerColor | null {
  const v = value.trim().toLowerCase();

  const hex = HEX_RE.exec(v);
  if (hex) {
    const digits = hex[1] ?? '';
    const full =
      digits.length === 3
        ? digits
            .split('')
            .map((c) => c + c)
            .join('')
        : digits;
    return { hex: `#${full}`, alpha: 1 };
  }

  const rgb = RGB_RE.exec(v);
  if (rgb) {
    const [, r = '0', g = '0', b = '0', a] = rgb;
    return { hex: `#${channelHex(r)}${channelHex(g)}${channelHex(b)}`, alpha: parseAlpha(a) };
  }

  return null;
}
