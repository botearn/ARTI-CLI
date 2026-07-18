# RFC-2026-0002: 新用户上手 — 一行安装 + REPL 登录态 Onboarding

## 元数据

- **RFC 编号**: RFC-2026-0002
- **标题**: 新用户上手 — 一行安装 + REPL 登录态 Onboarding
- **作者**: YuqingNicole
- **状态**: Draft
- **创建日期**: 2026-06-01
- **最后更新**: 2026-06-01
- **关联 Issue**: N/A
- **关联 PR**: N/A
- **取代**: N/A
- **被取代**: N/A

## 摘要

对标 [x.ai/cli (Grok Build)](https://x.ai/cli) 的上手体验，把 ARTI 的"安装 → 登录 → 能用"串成一条顺畅的链路。包含三部分：(1) 一行安装脚本 `curl -fsSL https://artifin.ai/cli/install.sh | bash`；(2) `arti` REPL 启动时检测登录状态并引导；(3) 官网（artifin.ai）配合托管 install.sh 并提供 `/cli` 落地页。

## 动机

### 问题陈述

ARTI CLI 的登录底座已经很完整（浏览器登录 + 验证码核对 + token/CI 兜底，见 `src/commands/auth.ts`、`src/browser-login.ts`），但"第一次接触到第一次成功查询"这条路没有串起来：

1. **没有一行安装入口**：文档只给 `npm install`，新手门槛高。Grok 用 `curl | bash` 一步到位。
2. **REPL 不感知登录态**：无参数运行 `arti` 进入 REPL，banner 只说"输入 help"，不提示登录。未登录用户直到调用需要鉴权的命令才会撞墙。
3. **官网缺 CLI 落地页**：artifin.ai 已承载 `/auth?cli=1` 登录桥接（`AuthPage.tsx` 已实现），但没有对标 x.ai/cli 的下载/安装页，也没托管安装脚本。

### 用户故事

- 作为新用户，我希望复制一行命令就能装好 `arti`，以便快速试用。
- 作为已安装但未登录的用户，我希望打开 `arti` 就被告知"先登录"，以便少走弯路。
- 作为已登录用户，我希望 REPL 顶部显示我的账户，以便确认身份无误。

### 现状分析

- `src/core/repl.ts`：`printBanner()` 固定文案，写死 `v0.2.0`（与 `package.json` 的 `0.3.0`、npm 已发布的 `0.3.3` 漂移）。
- `arti-cli` 已发布到 npm（`0.3.3`），`bin.arti` → `dist/index.js`，`engines.node >=18`。安装脚本无需编译二进制，`npm i -g arti-cli` 即可。
- 官网 `vercel.json` 有 SPA 全包重写 `"/((?!api/).*)" → /index.html`，静态 `public/install.sh` 会被改写成 HTML，需走 `/api` 路由绕过。

## 详细设计

### 方案概述

三处改动，互相独立、均为加法（非破坏性）：CLI 仓库加 `install.sh` 与登录态 banner；官网仓库加 `/api/install` + rewrite + `/cli` 落地页。安装脚本与官网保持**单一数据源**：脚本本体放 CLI 仓库，官网 `/api/install` 在请求时从 GitHub raw 拉取并以 `text/plain` 返回，避免两处脚本漂移。

### 技术方案

#### 链路

```
artifin.ai/cli (落地页)
  └─ curl -fsSL https://artifin.ai/cli/install.sh | bash
        └─ /api/install → 拉 raw.githubusercontent.com/botearn/ARTI-CLI/master/install.sh
              └─ 脚本: 检测 node>=18 → npm i -g arti-cli → 提示 arti login
                    └─ arti (REPL) → banner 检测未登录 → 提示 login
                          └─ arti login → artifin.ai/auth?cli=1 (已就绪)
```

#### install.sh 行为

1. 检测 `node` 是否存在且 `>=18`；缺失则打印 Node 安装指引并退出非零。
2. 检测 `npm`；执行 `npm install -g artifin-cli`（失败给出 sudo/权限提示）。
3. 成功后打印下一步：`arti login` 与示例命令。
4. 纯 POSIX sh，set -e，对 `curl | bash` 友好（不依赖交互输入）。

#### REPL banner（`src/core/repl.ts`）

```typescript
// printBanner() 末尾追加登录态：
import { getAuthState, isLoggedIn } from "../auth.js";   // 仅本地读 token，无网络
const auth = getAuthState();
if (isLoggedIn(auth)) {
  // 显示 "已登录 <email>"
} else {
  // 显示 "未登录 — 输入 login 开始"
}
```

版本号从写死改为引用统一常量（对齐 `0.3.x`）。

#### 官网（arti 仓库）

- `api/install.ts`：Vercel 函数，`fetch` GitHub raw install.sh，返回 `Content-Type: text/plain`，带短缓存。
- `vercel.json`：新增 rewrite `{ "source": "/cli/install.sh", "destination": "/api/install" }`（置于 SPA 全包规则之前）。
- `/cli` 落地页：复用现有 landing 组件风格，展示一行安装命令 + 核心能力 + 指向 `arti login`。路由加 `<Route path="/cli" .../>`。

### 实现计划

1. **CLI 仓库**
   - [ ] `install.sh`
   - [ ] `src/core/repl.ts` 登录态 banner + 版本对齐
   - [ ] README 安装段
2. **官网仓库**
   - [ ] `api/install.ts`
   - [ ] `vercel.json` rewrite
   - [ ] `/cli` 落地页 + 路由

### 测试策略

- **单元/冒烟**：`install.sh` 在有/无 node 两种情况下的分支（本地 `bash install.sh` dry-run）。
- **手动**：`curl -fsSL https://artifin.ai/cli/install.sh | bash` 端到端；`arti`（登录/未登录）banner 两态。

## 权衡与替代方案

### 方案 A（选中）：官网 /api/install 反代 GitHub raw

**优点**：单一数据源（脚本只在 CLI 仓库维护）；URL 干净对标 x.ai/cli；不受 SPA 重写影响。
**缺点**：安装时依赖 GitHub 可达（可加缓存兜底）。

### 方案 B（未选中）：GitHub raw 直链

**优点**：官网零改动。**缺点**：URL 难看、暴露仓库路径、不像产品。

### 方案 C（未选中）：仅 npm 安装

**优点**：最快上线。**缺点**：没有"一行安装"的惊艳感，仍作为脚本内部实现保留。

## 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|
| `npm i -g` 权限失败 | 中 | 中 | 脚本捕获并提示 sudo / nvm 方案 |
| GitHub raw 不可达 | 低 | 中 | `/api/install` 加缓存；README 保留 npm 备选 |
| banner 读取 auth 抛错 | 低 | 低 | try/catch 包裹，失败退回原 banner |

## 安全性考虑

- `curl | bash` 模式本身有信任假设：脚本仅做 `npm i -g arti-cli`，不写敏感文件、不要求 root。
- `/api/install` 只读返回固定仓库的脚本，无用户输入注入面。

## 文档影响

- [ ] README.md（安装段）
- [ ] CLAUDE.md（快速开始）
- [ ] 官网 /cli 落地页

## 参考资料

- [x.ai/cli — Grok Build Beta](https://x.ai/cli)
- [Introducing Grok Build](https://x.ai/news/grok-build-cli)
- 现有实现：`src/commands/auth.ts`、`src/browser-login.ts`、`arti/src/pages/AuthPage.tsx`

---

## 变更历史

| 日期 | 作者 | 变更内容 |
|---|---|---|
| 2026-06-01 | YuqingNicole | 创建 RFC |
