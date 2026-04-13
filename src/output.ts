/**
 * 统一输出层 — 根据 --json flag 自动切换输出模式
 */

let jsonMode = false;

export function setJsonMode(enabled: boolean): void {
  jsonMode = enabled;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

/** JSON 模式下输出结构化数据，终端模式下执行 render 回调 */
export function output(data: unknown, render: () => void): void {
  if (jsonMode) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    render();
  }
}
