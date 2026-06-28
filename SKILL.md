# Tauri 2.0 + Ant Design 跨端应用开发技能

## 概述

使用 Tauri 2.0 (Rust 后端) + React + TypeScript + Ant Design 5.x 构建跨平台桌面应用的完整开发模式。

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | Tauri 2.0 | Rust 驱动，比 Electron 体积小 |
| 前端 | React 18 + TypeScript | Vite 5 构建 |
| UI 库 | Ant Design 5.x + @ant-design/icons | 自带 tree shaking |
| 包管理 | pnpm | 前端依赖 |
| 后端 | Rust edition 2021 | Tauri 底层 |

## 项目初始化

### 1. 开发环境（Ubuntu/WSL2）

```bash
# 系统依赖
sudo apt install -y libwebkit2gtk-4.1-dev build-essential libxdo-dev \
  libssl-dev libayatana-appindicator3-dev librsvg2-dev

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# pnpm
npm install -g pnpm@9
```

### 2. 创建项目

```bash
mkdir my-app && cd my-app
git init
pnpm init  # 或手动写 package.json
```

### 3. 前端依赖

```json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "antd": "^5.22.0",
    "@ant-design/icons": "^5.5.0",
    "@tauri-apps/api": "^2.0.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0"
  }
}
```

### 4. 项目结构

```
my-app/
├── index.html
├── package.json
├── vite.config.ts          # Vite 配置，监听 src-tauri 排除
├── tsconfig.json
├── tsconfig.node.json
├── src/
│   ├── main.tsx            # React 入口
│   ├── App.tsx             # 主布局
│   ├── App.css
│   ├── components/         # 业务组件
│   └── vite-env.d.ts
├── src-tauri/
│   ├── Cargo.toml
│   ├── build.rs
│   ├── tauri.conf.json     # 核心配置
│   ├── capabilities/
│   │   └── default.json    # 权限配置（关键！）
│   ├── icons/              # 需要 ico (Windows) + png (Linux)
│   └── src/
│       ├── main.rs
│       └── lib.rs
└── public/
```

## 关键配置

### tauri.conf.json

```json
{
  "build": {
    "beforeDevCommand": "pnpm dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "pnpm build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [{
      "title": "App",
      "width": 1024,
      "height": 680,
      "decorations": false,   // 无边框
      "resizable": true
    }],
    "security": { "csp": null }
  }
}
```

### capabilities/default.json（必须配置！）

```json
{
  "identifier": "default",
  "windows": ["*"],
  "permissions": [
    "core:window:default",
    "core:window:allow-minimize",
    "core:window:allow-close",
    "core:window:allow-start-dragging",
    "core:window:allow-toggle-maximize"
  ]
}
```

> Tauri 2.0 采用显式权限模型，**缺少 capabilities 会导致所有窗口操作（拖拽、最小化、关闭）静默失败**。

### Vite 配置

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] }
  }
}));
```

## 无边框窗口模式

### TitleBar 组件模板

```tsx
import { Button } from "antd";
import { LineOutlined, CloseOutlined } from "@ant-design/icons";
import { getCurrentWindow } from "@tauri-apps/api/window";

function TitleBar() {
  return (
    <div className="titlebar" data-tauri-drag-region>
      <span className="titlebar-title">App Name</span>
      <div className="titlebar-controls" data-tauri-drag-region="false">
        <Button type="text" size="small"
          icon={<LineOutlined />}
          onClick={() => getCurrentWindow().minimize()} />
        <Button type="text" size="small"
          icon={<CloseOutlined />}
          onClick={() => getCurrentWindow().close()} />
      </div>
    </div>
  );
}
```

### 关键 CSS

```css
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #root { height: 100%; overflow: hidden; }

.titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 12px;
  user-select: none;
  flex-shrink: 0;
}
.titlebar-controls {
  display: flex;
  gap: 4px;
}
```

### 拖拽原理

- 标题栏设置 `data-tauri-drag-region` → 可拖拽
- 按钮区域设置 `data-tauri-drag-region="false"` → 排除拖拽
- 需要 `core:window:allow-start-dragging` 权限

## antd 按需加载

Ant Design 5.x 原生支持 ES Module tree shaking，直接导入即可：

```ts
import { Button, ConfigProvider, theme } from "antd";
import { CloseOutlined } from "@ant-design/icons";
```

Vite 生产构建自动移除未使用代码，无需额外插件。

## 图标配置

```bash
# 必须的图标文件
src-tauri/icons/
├── icon.png          # 128x128 RGBA (Linux 打包)
├── icon.ico          # 必须 (Windows 构建，需含 32x32 + 128x128)
├── 32x32.png
├── 128x128.png
└── 128x128@2x.png   # 256x256
```

**注意**：
- `icon.png` 必须 RGBA 格式
- `icon.ico` Windows 构建必须

## 构建命令

```bash
# 开发模式
pnpm tauri dev

# 仅前端开发（浏览器预览，无 Tauri API）
pnpm dev

# 类型检查
pnpm tsc --noEmit

# 生产构建
# Linux 原生
pnpm tauri build

# Windows 交叉编译
pnpm tauri build --target x86_64-pc-windows-gnu
```

## Windows 交叉编译（Ubuntu → Windows）

```bash
# 安装 MinGW
sudo apt install -y mingw-w64

# 添加 Rust 目标
rustup target add x86_64-pc-windows-gnu

# 构建（产物：hello-tauri.exe）
pnpm tauri build --target x86_64-pc-windows-gnu
```

> NSIS 安装包生成需要 `makensis`（`sudo apt install nsis`），可选。exe 可直接运行。

## 常见坑

| 问题 | 原因 | 解决 |
|------|------|------|
| 标题栏无法拖拽 | 缺少 capabilities 权限 | 添加 `core:window:allow-start-dragging` |
| 最小化/关闭无反应 | 缺少 capabilities 权限 | 添加 `core:window:allow-minimize/close` |
| `icon/icon.png not found` | 缺少图标文件 | 生成 RGBA 格式 PNG |
| `icon.png is not RGBA` | PNG 格式不对 | 确保 4 通道 RGBA |
| `icon.ico not found` | Windows 构建缺少 ico | 生成含多尺寸的 ico |
| `node:util styleText` 错误 | Node.js < 20 | 使用 Node 18 + pnpm@9 手动搭建 |

## .gitignore

```
node_modules/
target/
dist/
*.log
.env
```
