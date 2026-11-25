import { createElement, type ReactNode } from 'react';

interface CardProps {
  title: string;
  children: ReactNode;
  // 받기만 하고 루트 요소에 넘기지 않는 속성 (조상 위치로 대체되는 경우 재현)
  className?: string;
  apiToken?: string; // 민감 키 마스킹 확인용(INT-012 FR-10). 렌더에 쓰지 않는다
}

// JSX가 아닌 런타임 호출로 만든 요소는 소스 위치 속성을 갖지 않는다.
function RuntimeLabel({ text }: { text: string }) {
  return createElement('span', { className: 'card-label' }, text);
}

export function Card({ title, children }: CardProps) {
  return (
    <section className="card">
      <h2 className="card-title">{title}</h2>
      <RuntimeLabel text="런타임 생성 요소" />
      <div className="card-body">{children}</div>
    </section>
  );
}
