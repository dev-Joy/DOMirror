import { Card } from './components/Card';
import { Button } from './ds/Button';

// 한글 주석: 이 뒤에 오는 JSX의 라인·컬럼이 어긋나지 않는지(오프셋 단위) 확인하는 용도다.
const items = ['색', '간격', '크기', '글꼴'];

export function App() {
  return (
    <main className="page">
      {/* 한글 주석 뒤의 요소 위치 검증 */}
      <h1 className="title">DOMirror React 예제</h1>
      <p className="lead">요소를 클릭하면 소스 위치를 찾을 수 있습니다.</p>
      <ul className="list">
        {items.map((item) => (
          <li key={item} className="list-item">
            {item}
          </li>
        ))}
      </ul>
      <Card title="카드" className="무시되는-속성">
        <p>카드 본문입니다.</p>
      </Card>
      {['반복 카드 1', '반복 카드 2', '반복 카드 3'].map((title) => (
        <Card key={title} title={title} apiToken="demo-secret-token">
          <p>반복 렌더 카드입니다.</p>
        </Card>
      ))}
      <Button>디자인 시스템 버튼</Button>
    </main>
  );
}
