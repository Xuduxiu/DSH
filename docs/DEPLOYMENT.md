# 新电脑部署与恢复

## Windows 桌面版（推荐）

安装[官方 DSH 桌面版](https://www.deepseek.com/download/)，打开一次，再通过托盘菜单退出。下载本仓库 Release ZIP 并解压，双击 `install.cmd`。安装成功后重启 DSH，在新电脑内配置自己的模型凭据。

关闭主窗口可能只是隐藏到托盘。为避免配置并发写入，安装器检测到 `DeepSeek Harness` 进程时会停止，不会终止你的任务。

默认路径根据本机环境自动确定：

| 内容 | 默认位置 |
| --- | --- |
| DSH 程序 | `%LOCALAPPDATA%\Programs\DeepSeek Harness\DeepSeek Harness.exe` |
| DSH 数据 | 环境变量 `DSH_HOME`；未设置时为用户目录下 `.dsh` |
| 目标 profile | `desktop` |
| 插件副本 | `<DSH_HOME>\toolkit\versions\<内容哈希>` |
| 配置备份 | `<DSH_HOME>\toolkit\backups\desktop-<时间>-<进程号>` |

仅检查环境，不更改配置（在解压目录的 PowerShell 中运行）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Check
```

自定义 DSH 程序位置或数据目录：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 `
  -DesktopExecutable 'D:\Apps\DeepSeek Harness\DeepSeek Harness.exe' `
  -DshHome 'D:\DSH-data'
```

`-DshHome` 必须与桌面应用实际使用的数据目录一致。它不会自动更改桌面快捷方式或创建已有聊天记录的副本。新目录尚未由桌面程序初始化时，安装器会提示先打开桌面应用。

如只需独立 Web 配置，可指定 `-Profile web`。已运行的同一 Web profile 应先停止；安装器只会检查桌面进程，不会发现任意终端里的 Web 服务。启动方式遵循官方 CLI 文档，例如 `dsh web --no-open`。仅本地使用，不需开放防火墙端口。

## macOS / Linux 命令安装（未完成原生环境验收）

准备 Node.js 22+、pnpm，以及官方 `dsh` CLI。可按[上游指南](https://github.com/deepseek-ai/deepseek-harness)安装。保证 `dsh --version` 和 `pnpm --version` 都可运行，然后在仓库根目录执行：

```sh
node scripts/install.mjs --profile web --check
node scripts/install.mjs --profile web
dsh web
```

脚本使用官方 `dsh plugin` 命令，插件自动复制到 `DSH_HOME`；不会将仓库目录直接作为永久依赖。macOS 桌面 profile 需要先从 DSH 菜单安装桌面版自带的 `dsh` 命令，并完全退出桌面应用，再指定 `--profile desktop`。普通 npm CLI 不允许管理保留的 `desktop` profile。

以上命令路径由跨平台 Node.js API 实现，但当前只在 Windows 上完成真实 DSH 安装和运行验证。CI 里的模拟测试不能替代 macOS/Linux 实机测试。

## 使用插件管理界面安装

也可以在 DSH 的 Plugins 页面或 Creator 工具 `plugin_manager` 中逐个安装这三个插件目录：`plugin`、`arknights-ui`、`multiview`。**仓库根目录不是一个插件 bundle**，不能直接当成单插件安装。

界面安装本地目录可能采用链接，此时应保留目录。Windows 自动安装器已为你处理永久副本，优先使用 `install.cmd`。

## 卸载

退出 DSH 后，使用桌面版自带 CLI：

```powershell
$DshCli = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
& $DshCli plugin --profile desktop remove '@local/dsh-saturation' '@local/dsh-multiview' '@local/dsh-arknights-ui'
```

如使用自定义 `DSH_HOME`，先在当前终端设好对应环境变量。Web profile 将命令中的 `desktop` 替换为 `web`。也可以在 Plugins 页面逐项关闭或移除。卸载不会删除会话或科研论坛数据。

## 失败与恢复

安装器仅在成功核对所有插件后打印 `Installed 3 plugins`。非零退出码表示安装未完成；先阅读错误及日志路径。保留错误信息，不要把“依赖安装成功”当成三个插件全部生效。

安装前已有的以下文件会备份到提示目录：`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`cordis.patch.yml`。备份可能包含个人路径和设置，只保留本地。

1. 完全退出正在使用目标 profile 的 DSH 实例。
2. 将备份中存在的文件复制回 `<DSH_HOME>/profiles/<profile>/`。
3. 用同一 DSH CLI 执行 `dsh plugin --profile <profile> install`，重建备份配置的包链接。
4. 重启并核对 Plugins 页面。不要清除 `.dsh/sessions`、`.dsh/storages` 或凭据文件。

若这是全新 profile，没有安装前的 manifest，则备份目录可能为空。此时使用插件管理命令移除这三个包，或另选全新的隔离 Home 重试；不要将空备份视为完整回滚。

安装后的副本以内容哈希隔离。不要修改 `toolkit/versions` 内文件；修改仓库源码后重新运行安装器，会建立新的版本目录。旧目录保留，不自动删除。

## 常见问题

- **找不到 DSH**：确认已安装桌面版，或传入 `-DesktopExecutable`。
- **提示先初始化**：在目标 Home 中打开桌面版一次，再从托盘退出。
- **提示仍在运行**：托盘菜单选择退出；关闭窗口不足以停止程序。
- **看不到新主题或多栏**：重启 DSH，刷新页面，检查 Plugins 三个包都已启用。
- **版本兼容提示**：本项目实际验证的是 `0.2.1-rc.5`。升级 DSH 后需重新检查插件；不要跳过官方版本检查。
- **多栏中主题按钮消失**：为避免遮挡第三栏，主题浮动按钮被隐藏；使用 Settings → General → 视觉协议。
- **新电脑没有旧对话**：本发布包只部署功能；账号、会话和科研状态留在原电脑，需要单独管理自己的私人数据迁移。
