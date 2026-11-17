import type { ReactNode } from 'react';

interface ButtonProps {
  children: ReactNode;
}

// 디자인 시스템 컴포넌트 예제: src/ds/** 패턴에 일치해 data-domirror-ds가 함께 주입된다.
export function Button({ children }: ButtonProps) {
  return (
    <button type="button" className="ds-button">
      {children}
    </button>
  );
}
