# MySQL Sample Export

MySQL Sample Export 是一个基于 Tauri 2、Rust、React 和 TypeScript 的 Windows 桌面工具，用于连接 MySQL 数据库，浏览数据库、表和视图，并导出表结构与样例数据。

## 使用场景

这个项目主要用于开发阶段向 AI Agent 提供数据库上下文。

当你需要让 Agent 理解一个业务系统的数据结构时，通常不需要导出整库数据。全量数据不仅可能包含敏感信息，也会快速占满 Agent 的上下文窗口，影响分析和代码生成效果。

使用 MySQL Sample Export 可以只导出目标表的结构信息、建表语句，以及少量样例数据。默认样例数据为 10 条，足够让 Agent 理解字段含义、数据类型、枚举值、空值分布和真实数据形态，同时避免把大量无关数据塞进上下文。

典型流程：

1. 连接开发或测试环境 MySQL 数据库。
2. 选择需要让 Agent 理解的业务表。
3. 保持样例行数为默认 10 条，或按需调整为更小范围。
4. 导出为 Markdown、SQL、JSON 或 CSV。
5. 将导出文件内容作为上下文提供给 Agent，用于辅助分析需求、生成 SQL、编写后端接口或排查数据相关问题。

## 功能特性

- 连接 MySQL 数据库，支持 host、port、user、password 和 SSL 配置
- 自动过滤 `information_schema`、`performance_schema`、`mysql`、`sys` 等系统数据库
- 浏览数据库列表、表列表和视图列表
- 查看表结构、样例数据和建表语句
- 样例数据默认 10 行，可调整为 1-1000 行，避免大表查询压力
- 支持导出 SQL、JSON、CSV、Markdown 格式
- 支持 Windows MSI 安装包和便携包打包

## 技术栈

- Tauri 2
- Rust 2021
- React 18
- TypeScript 5.5
- Vite 5
- mysql_async

## 本地开发

安装依赖：

```bash
npm install
```

启动开发模式：

```bash
npm run dev
```

构建并打包生产产物：

```bash
npm run build
```

## Windows 打包

发布前请同步 `package.json`、`package-lock.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 和 `src-tauri/Cargo.lock` 中的版本号。`npm version patch` 只会更新 npm 侧版本，Tauri/Cargo 版本需要同步处理。

确认版本一致后生成 Windows 发布包：

```bash
npm run build
```

打包完成后，Windows 安装包和便携包会输出到 Tauri 的 bundle 目录：

```text
src-tauri/target/release/bundle/
```

通常会生成类似下面的发布文件：

```text
src-tauri/target/release/bundle/msi/MySQL Sample Export_1.0.0_x64.msi
src-tauri/target/release/bundle/portable/MySQL Sample Export_1.0.0_x64-Portable.zip
```

## 项目结构

```text
src/                         React 前端源码
src/components/              页面组件
src-tauri/                   Tauri/Rust 桌面端配置与后端逻辑
src-tauri/src/               Rust 命令、数据库连接和导出逻辑
src-tauri/capabilities/      Tauri 权限配置
src-tauri/icons/             应用图标资源
src-tauri/wix/               Windows MSI 打包模板和本地化配置
scripts/                     Windows 打包辅助脚本
dist/                        Vite 前端构建产物，上传 GitHub 时忽略
src-tauri/target/            Rust/Tauri 构建和打包产物，上传 GitHub 时忽略
```

## 安全说明

数据库连接信息保存在运行中的 `mysql-sample-export.exe` 同目录下的 `connections.json` 文件中。保存连接时，密码会以 Base64 编码写入 `passwordEncrypted` 字段；Base64 只是编码，不具备加密保护能力。请不要将包含真实数据库凭据的 `connections.json` 提交到仓库或对外共享。当前 SSL 选项用于启用加密连接，但代码会跳过证书域名校验并接受无效证书，因此不等同于严格的生产级证书校验。