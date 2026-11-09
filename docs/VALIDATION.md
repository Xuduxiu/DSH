# 发布验证记录

日期：2026-11-09（Asia/Shanghai）。发布版本：v1.0.0。

| 检查 | 状态 | 证据与边界 |
| --- | --- | --- |
| 三个插件的清单和入口文件 | PASS | 核对 package.json、Host/Client 入口、bundle patch、图标和许可证 |
| JavaScript 语法 | PASS | 所有 `.js` / `.mjs` 执行 `node --check` |
| 科研 Host | PASS | 20/20；工具注册、并行路线、论坛广播/定向、读取游标、并发日志、重启恢复；使用模拟 DSH 服务 |
| 科研 Client | PASS | 11/11；挂载、空会话、路线、论坛、启动参数等；使用模拟 React 和 DOM，非浏览器截图验收 |
| 安装器 | PASS | 5/5；含空格路径、重复安装、保留已有插件、配置备份、只读检查、非法 profile、失败状态 |
| 实际 DSH 插件安装 | PASS | Windows DSH `0.2.1-rc.5`，自带 pnpm `11.28.5`；在隔离 Home 的全新 Web profile 安装并启用三个包，逐个核对已安装 manifest |
| 配置组合 | PASS | `--profile web --dump-config` 出现全部三个 `@local/dsh-*` 插件 |
| 实际 Web 启动 | PASS | 独立本地端口启动；认证引导 HTTP 303、HTML 页面 HTTP 200；科研 state 路由对缺少 sessionId 返回预期 HTTP 400；启动日志无 error/failed |
| 新电脑桌面 UI 人工操作 | NOT_RUN | 没有另一台物理电脑；不能将隔离部署等同于所有桌面交互通过 |
| macOS/Linux 原生 DSH 安装 | NOT_RUN | GitHub Actions 的跨平台单元测试不能替代原生部署验收 |
| 实际模型科研任务 | NOT_RUN | 未使用个人 API Key，也未发起付费模型任务 |

测试使用新建的临时配置，没有读取或迁移日常 DSH 的聊天记录和凭据。运行检查完成后停止测试服务。

初次在受限执行环境下运行真实 DSH 安装/启动时，遇到沙箱文件权限限制；换成普通用户权限的隔离测试后安装与启动通过。该失败不是静默忽略，也未将沙箱失败记为成功。

复跑本仓库无需下载 npm 依赖：`npm test`。真实运行检查依赖已安装的官方 DSH 桌面运行时，不在 CI 中发起模型请求。
