// 패널에서 편집할 수 있는 CSS 속성 목록(FR-6). 간격은 롱핸드로만 다룬다(소스 반영 시 속성 단위로 대조하기 위함).

export type PropertyGroup = 'color' | 'spacing' | 'size' | 'font' | 'layout';

/** 레이아웃 컨테이너 종류(FR-6). */
export type LayoutContainer = 'flex' | 'grid';

export interface EditableProperty {
  readonly name: string;
  readonly group: PropertyGroup;
  /** 키워드 선택지. 있으면 <select>로 그린다(FR-7). */
  readonly options?: readonly string[];
  /** 지정 시 선택 요소 display가 이 컨테이너일 때만 표시(FR-6). */
  readonly containers?: readonly LayoutContainer[];
}

export const PROPERTY_GROUP_LABELS: Readonly<Record<PropertyGroup, string>> = {
  color: '색',
  spacing: '간격',
  size: '크기',
  font: '글꼴',
  layout: '레이아웃',
};

/** 계산된 display 값 → 컨테이너 종류. flex·inline-flex → 'flex', grid·inline-grid → 'grid', 그 외 null(FR-6). */
export function containerOf(display: string | undefined): LayoutContainer | null {
  const v = display?.trim();
  if (v === 'flex' || v === 'inline-flex') return 'flex';
  if (v === 'grid' || v === 'inline-grid') return 'grid';
  return null;
}

const SIDES = ['top', 'right', 'bottom', 'left'] as const;

// 레이아웃 속성 공통 값(FR-6·FR-7).
const BOTH: readonly LayoutContainer[] = ['flex', 'grid'];
const CONTENT: readonly string[] = [
  'normal',
  'flex-start',
  'flex-end',
  'start',
  'end',
  'center',
  'space-between',
  'space-around',
  'space-evenly',
  'stretch',
];

export const EDITABLE_PROPERTIES: readonly EditableProperty[] = [
  { name: 'color', group: 'color' },
  { name: 'background-color', group: 'color' },
  ...SIDES.map((side) => ({ name: `margin-${side}`, group: 'spacing' as const })),
  ...SIDES.map((side) => ({ name: `padding-${side}`, group: 'spacing' as const })),
  { name: 'gap', group: 'spacing' },
  { name: 'width', group: 'size' },
  { name: 'height', group: 'size' },
  { name: 'font-size', group: 'font' },
  { name: 'font-weight', group: 'font' },
  { name: 'line-height', group: 'font' },
  {
    name: 'display',
    group: 'layout',
    options: ['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'none'],
  },
  {
    name: 'flex-direction',
    group: 'layout',
    containers: ['flex'],
    options: ['row', 'row-reverse', 'column', 'column-reverse'],
  },
  { name: 'flex-wrap', group: 'layout', containers: ['flex'], options: ['nowrap', 'wrap', 'wrap-reverse'] },
  { name: 'justify-content', group: 'layout', containers: BOTH, options: CONTENT },
  {
    name: 'align-items',
    group: 'layout',
    containers: BOTH,
    options: ['normal', 'stretch', 'flex-start', 'flex-end', 'start', 'end', 'center', 'baseline'],
  },
  { name: 'align-content', group: 'layout', containers: BOTH, options: CONTENT },
  { name: 'grid-template-columns', group: 'layout', containers: ['grid'] },
  { name: 'grid-template-rows', group: 'layout', containers: ['grid'] },
  { name: 'row-gap', group: 'layout', containers: BOTH },
  { name: 'column-gap', group: 'layout', containers: BOTH },
];
