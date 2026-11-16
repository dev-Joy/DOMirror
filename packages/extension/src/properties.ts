// 패널에서 편집할 수 있는 CSS 속성 목록(FR-6). 간격은 롱핸드로만 다룬다(소스 반영 시 속성 단위로 대조하기 위함).

export type PropertyGroup = 'color' | 'spacing' | 'size' | 'font';

export interface EditableProperty {
  readonly name: string;
  readonly group: PropertyGroup;
}

export const PROPERTY_GROUP_LABELS: Readonly<Record<PropertyGroup, string>> = {
  color: '색',
  spacing: '간격',
  size: '크기',
  font: '글꼴',
};

const SIDES = ['top', 'right', 'bottom', 'left'] as const;

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
];
