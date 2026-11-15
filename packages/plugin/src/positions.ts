/**
 * UTF-16 오프셋을 1부터 시작하는 line·column으로 바꾸는 함수를 만든다.
 * column도 UTF-16 코드 단위 기준이다.
 */
export function createLineIndex(code: string): (offset: number) => { line: number; column: number } {
  const lineStarts = [0];
  for (let i = 0; i < code.length; i++) {
    if (code.charCodeAt(i) === 10 /* \n */) lineStarts.push(i + 1);
  }

  return (offset) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if ((lineStarts[mid] ?? 0) <= offset) low = mid;
      else high = mid - 1;
    }
    return { line: low + 1, column: offset - (lineStarts[low] ?? 0) + 1 };
  };
}
