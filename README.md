# DSH 工具箱

[![Tests](https://github.com/Xuduxiu/DSH/actions/workflows/test.yml/badge.svg)](https://github.com/Xuduxiu/DSH/actions/workflows/test.yml)

给 **DeepSeek Harness** 增加饱和式科研、多栏工作区和明日方舟风格主题。提供完整插件源码、Windows 安装入口及新电脑部署说明。

| 扩展 | 功能 | 说明 |
| --- | --- | --- |
| 饱和式科研 | 一个目标拆成多条技术路线；每条路线独立对话；任务论坛广播、定向消息和进度追踪 | [使用说明](plugin/README.md) |
| 多栏工作区 | 同时查看最多三个会话；双击会话开新栏；每栏可切换对话/轨迹 | [使用说明](multiview/README.md) |
| 视觉主题 | 罗德岛白昼、罗德岛黑夜、终末地玻璃三种视觉协议 | [使用说明](arknights-ui/README.md) |

这是用户扩展项目，依赖官方 DeepSeek Harness；DSH 主程序请从[官方页面下载](https://www.deepseek.com/download/)。插件源码采用 MIT 许可证；主题不包含游戏原画、字体或音频资源，与游戏官方没有关联。

## 在另一台 Windows 电脑上安装

1. 安装 [DeepSeek Harness 桌面版](https://www.deepseek.com/download/)，打开一次以初始化配置，再从**托盘菜单 → 退出**彻底退出。
2. 从 [Releases](https://github.com/Xuduxiu/DSH/releases/latest) 下载 `DSH-toolkit-v1.0.0.zip`，**先全部解压**。
3. 双击解压目录内的 **`install.cmd`**。看到 `Installed 3 plugins` 后重新打开 DSH。

无需另装 Node.js、Git 或 pnpm：Windows 安装器使用 DSH 桌面版自带的运行时。默认安装位置会自动识别当前 Windows 用户；自定义位置见[部署文档](docs/DEPLOYMENT.md)。

首次在新电脑使用时，在 DSH 内登录或配置自己的模型 API Key，并选择工作区。仓库和安装包不包含账号、API Key、聊天记录、研究结果或个人配置。

**安装成功后的入口：** 新建对话可见“饱和式科研”栏；左侧双击会话打开额外分栏；主题位于 Settings → General → 视觉协议（多栏模式下主题浮动按钮隐藏）。科研多路线会发起多个模型任务，请按自己的模型用量选择路线数量，默认最多 8 条。

## 安装器会做什么

- 将三个插件复制到当前 DSH 数据目录下的 `toolkit/versions/<内容哈希>/`。
- 使用官方 `dsh plugin --profile desktop add ...` 注册并启用插件。
- 在 `toolkit/backups/` 保存本次安装前的 profile 配置；保留原有插件和设置。
- 核对三个插件是否安装并启用，写入 `toolkit/installed-desktop.json` 回执。

插件复制后不再依赖下载目录，可以删除解压包；不要删除 DSH 数据目录下的 `toolkit/versions`。重新运行安装器可更新扩展，旧版目录和配置备份保留用于恢复。安装失败会返回非零退出码并显示备份位置，可能已有部分变更，具体恢复步骤见部署文档。

## 验证与兼容性

本次实际验证环境：**Windows、DSH `0.2.1-rc.5`**。

- 20 项科研 Host 测试、11 项科研 Client 模拟测试、5 项安装器测试通过。
- 在空白隔离 DSH Home 中，真实安装三个插件及配置组合检查通过。
- 隔离 Web 实例启动成功，页面 HTTP 200，科研接口返回预期参数校验响应，启动无错误。
- [验证记录](docs/VALIDATION.md) 明确区分模拟测试、真实运行检查与未执行项目。

DSH 仍在快速迭代；其他版本会显示兼容性提示，不能据此视作已验证。macOS/Linux 的命令安装路径见[部署文档](docs/DEPLOYMENT.md)，原生桌面实际安装尚未验证。

## 开发与测试

安装 Node.js 22 或更新版本后：

```sh
git clone https://github.com/Xuduxiu/DSH.git
cd DSH
npm test
```

测试没有第三方 npm 依赖，不需要运行 `npm install`。GitHub Actions 在 Windows、Linux、macOS 上运行相同测试；这不等同于三平台桌面界面验收。

```text
plugin/          饱和式科研插件（Host、Client、持久化状态）
multiview/       多栏工作区插件
arknights-ui/    三套视觉主题
scripts/        可移植安装逻辑
tools/          源码检查与测试
docs/           部署、恢复和验证记录
install.cmd     Windows 双击入口
install.ps1     Windows 参数化安装入口
```

## 上游与许可证

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [官方 CLI 与 profile 文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/README.md)
- [官方插件管理文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/plugin-manager/README.md)
- [MIT License](LICENSE)，各插件原有版权声明保留在对应目录。
