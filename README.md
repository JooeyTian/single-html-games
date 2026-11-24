# 单 HTML 游戏 / 工具集合

一个用于存放**单文件 HTML**小游戏和小工具的工程。原则是：**一个应用 = 一个独立文件夹 = 一个 `index.html` 入口**，应用之间彼此隔离，互不引用、互不污染。

## 目录结构

```
single-html-games/
├── index.html               # 游戏平台首页：带缩略图的游戏卡片列表（手动维护）
├── README.md                # 本说明文档
├── .gitignore
├── apps/                    # 所有应用都放在这里，一个应用一个文件夹
│   ├── _template/           # 新应用模板（不要直接改这个）
│   │   └── index.html
│   ├── one-punch/           # 一拳
│   │   ├── index.html
│   │   └── thumbnail.jpg    # 首页卡片缩略图
│   ├── winxp-c-drive/       # Windows XP · C盘考古
│   │   ├── index.html
│   │   └── thumbnail.jpg    # 首页卡片缩略图
│   └── neon-survivor/       # 霓虹幸存者（弹幕割草生存）
│       ├── index.html
│       └── thumbnail.jpg    # 首页卡片缩略图（待截图）
└── scripts/
    └── new-app.ps1          # 从模板创建新应用的脚本
```

以后新增的应用类似这样：

```
apps/
├── puzzle/
│   └── index.html           # 单文件应用：HTML + CSS + JS 全在里面
├── snake/
│   ├── index.html           # 少数需要多文件的应用也可以
│   ├── game.js              # 但它自己的资源只放在自己的文件夹里
│   └── style.css
└── ...
```

## 核心约定

1. **一个应用一个文件夹**，文件夹名即应用名，使用小写英文 + 连字符（如 `memory-match`）。
2. **入口统一为 `index.html`**，直接双击用浏览器打开即可运行。
3. **单文件优先**：CSS 写在 `<style>` 里，JS 写在 `<script>` 里，尽量不依赖外部资源，保证离线可用。
4. **应用之间完全隔离**：
   - 不要跨文件夹引用另一个应用的代码或资源；
   - 每个应用只使用自己文件夹内的文件；
   - 需要复用代码时，复制到各自文件夹中，保持独立。
5. **多文件应用也允许**：如果某个应用不适合单 HTML，就把它拆成多个文件，但全部放在它自己的文件夹里，入口仍然是 `index.html`。
6. `_template` 是模板，永远不要直接改它；新增应用请复制它。
7. 首页卡片使用各应用自己的 `thumbnail.jpg` 作为缩略图（建议 16:9、游戏内截图），文件放在该应用文件夹内，不共享、不跨引用。

## 如何运行

- 单个应用：进入对应文件夹，双击 `index.html`（或拖入浏览器）。
- 游戏平台首页：双击根目录的 `index.html`，在卡片上点击「开始游戏」进入对应应用（新标签页打开，也可直接双击应用文件夹里的 `index.html`）；首页支持按名称搜索和按标签筛选。
- 需要本地服务器时（例如用到 `fetch` 或某些浏览器 API），在根目录执行：

```powershell
python -m http.server 8000
```

然后访问 `http://localhost:8000/apps/<应用名>/`。

## 如何新增应用

**方式一：脚本（推荐）**

在项目根目录执行：

```powershell
.\scripts\new-app.ps1 my-new-game
```

脚本会从 `_template` 复制出 `apps/my-new-game/index.html`。若 PowerShell 提示禁止执行脚本，可使用：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\new-app.ps1 my-new-game
```

**方式二：手动**

1. 复制 `apps/_template` 文件夹，重命名为你的应用名；
2. 编辑其中的 `index.html`，填写标题和你的代码；
3. 给应用截一张图，存为 `apps/你的应用名/thumbnail.jpg`（16:9 左右效果最好）；
4. 在根目录 `index.html` 的 `.grid` 里复制一张 `.game-card`，改 `href`、`img src`、标签（`data-title` / `data-tags` / `data-desc`）和文字；标签目前有 `action`（动作）、`idle`（放置）、`sim`（模拟）、`retro`（复古）；
5. 在本 README 的应用清单里登记一行说明。

## 应用清单

| 应用 | 文件夹 | 说明 |
| --- | --- | --- |
| 一拳 | `apps/one-punch/` | 点击打击怪物的爽快小游戏 |
| Windows XP · C盘考古 | `apps/winxp-c-drive/` | 复古 Windows XP 桌面与 C 盘探索，含多个小游戏彩蛋 |
| 霓虹幸存者 | `apps/neon-survivor/` | 弹幕割草生存：限时存活 / 20 波挑战双模式，12 种武器、21 种被动、5 大流派羁绊（弹幕/元素/召唤/暴击/血怒） |
