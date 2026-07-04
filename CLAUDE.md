# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

**focus** — 基于 Tauri 2.0 + React 18 + TypeScript + Ant Design 5.x 的跨端桌面应用，用于任务管理、每日时间线追踪和报告生成。当前处于项目早期阶段，已完成基础脚手架搭建。

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri 2.0 (Rust edition 2021) |
| 前端 | React 18 + TypeScript + Vite 5 |
| UI 库 | Ant Design 5.x + @ant-design/icons |
| 包管理 | pnpm |
| 构建 | Vite (前端), Cargo (后端) |

## 常用命令

```bash
cd focus

# 开发模式（启动 Tauri 桌面窗口 + Vite 热更新）
pnpm tauri dev

# 仅前端开发（浏览器预览，无 Tauri API）
pnpm dev

# TypeScript 类型检查
pnpm tsc --noEmit

# 生产构建（Linux 原生）
pnpm tauri build

# Windows 交叉编译（需先安装 mingw-w64 和 Rust target）
pnpm tauri build --target x86_64-pc-windows-gnu
```

## 项目结构

```
focus/
├── src/                    # React 前端源码
│   ├── main.tsx            # React 入口
│   ├── App.tsx             # 根组件（ConfigProvider dark theme + 布局）
│   ├── App.css             # 全局样式
│   └── components/         # 业务组件
│       └── TitleBar.tsx    # 无边框窗口自定义标题栏
├── src-tauri/              # Tauri Rust 后端
│   ├── src/
│   │   ├── main.rs         # Rust 入口
│   │   └── lib.rs          # Tauri Builder，当前为空壳
│   ├── Cargo.toml          # Rust 依赖 (tauri 2, serde, serde_json)
│   ├── tauri.conf.json     # Tauri 核心配置
│   └── capabilities/
│       └── default.json    # 窗口操作权限（关键配置）
├── public/                 # 静态资源
├── index.html              # HTML 入口
├── vite.config.ts          # Vite 配置（端口 1420，排除 src-tauri 监听）
├── SKILL.md                # Tauri 2.0 + Ant Design 详细开发指南
└── package.json
```

## 架构关键点

### 窗口模式
应用使用**无边框窗口**（`decorations: false`），通过自定义 TitleBar 组件处理拖拽、最小化和关闭。**Tauri 2.0 显式权限模型**：所有窗口操作（拖拽、最小化、关闭）必须在 `capabilities/default.json` 中声明对应权限，否则静默失败。TitleBar 使用 `data-tauri-drag-region` 属性标记可拖拽区域，按钮区域设置 `data-tauri-drag-region="false"` 排除拖拽。

### Rust 后端
当前 `lib.rs` 为空壳 `tauri::Builder`，尚未实现任何 Tauri Commands 或数据持久化。`Cargo.toml` 中已引入 `serde` + `serde_json` 用于后续序列化需求。

### Ant Design 暗色主题
`App.tsx` 通过 `ConfigProvider` 全局设置 `theme.darkAlgorithm`，所有 antd 组件自动适配暗色主题。不需要额外的 CSS 变量或主题配置。

### Vite 开发服务器
端口固定为 `1420`（`strictPort: true`），已配置忽略 `src-tauri/` 目录的文件监听以避免不必要的热更新。开发模式下 `pnpm tauri dev` 自动启动 Vite dev server 和 Tauri 窗口。

## 功能需求（待实现）

详细功能需求见仓库根目录 `REQUIREMENTS.md`，核心三大模块：

1. **任务管理** — CRUD 操作、标签管理、多维度排序、进展追踪
2. **每日时间线** — 任务/会议/休息三种模式的时间流水日志，实时统计
3. **报告生成** — 按日期或标签输出 Markdown 格式进度报告

任务和时间线数据需持久化存储。

## 参考

- `SKILL.md` — Tauri 2.0 + Ant Design 完整开发模式，包括图标配置、Windows 交叉编译、常见坑解决
- `REQUIREMENTS.md`（上级目录）— 详细的功能需求和项目计划

## 代理配置

如果依赖下载失败，可使用代理：`192.168.3.165:7892`
