# Oxford 1.3.1 · DSH 原生适配

DSH 中的测量脚本编辑和 Python 计划预览不需要原生窗口。要使用真实仪器，需在实验室电脑安装带此桥的 Oxford，并配置对应仪器驱动。此目录是针对已有 **Oxford 1.3.0.0 Python 测量版源码** 的增量；不提供 VISA 驱动、设备凭据或实验室配置。

## 从 1.3.0 源码构建

以下命令在原 Oxford 源码的独立副本上执行。把两个路径改为本机实际位置；`$source` 应包含 `Build-Portable.ps1` 和 `Oxford/Oxford_GE.csproj`。先保留原始版本。若 `git apply --check` 报内容不同，说明基线不是此补丁针对的版本，请核对差异后再继续。

```powershell
$native = 'D:\DSH\native'
$source = 'D:\Oxford-1.3.0\source'
git -C $source apply --check "$native\oxford-1.3-to-dsh.patch"
if ($LASTEXITCODE -ne 0) { throw 'Oxford 基线不匹配。' }
git -C $source apply "$native\oxford-1.3-to-dsh.patch"
if ($LASTEXITCODE -ne 0) { throw '未应用补丁。' }
Copy-Item -LiteralPath "$native\MainWindow.DshBridge.cs" -Destination "$source\Oxford\MainWindow.DshBridge.cs"
& "$source\Build-Portable.ps1" -Configuration Release
```

补丁只改程序启动、工程引用、文件版本及主题系统。使用已安装的 Visual Studio 也可构建同一 .NET Framework 4.7.2 / x86 工程。保留输出目录的全部依赖、字体和内置 CPython。**不要只复制 EXE。** 完成后，用仓库根目录 `bind-oxford.ps1 -Executable <完整的Oxford.exe路径>` 绑定该构建。重新编译或替换 EXE 后应重新绑定哈希。没有原工程时，请使用实验室提供并信任的 1.3.1 构建。

## 启动、协议与主题

默认使用「离线打开」查看设备配置；「联机打开」需要人工确认。需要采集时，在原生窗口确认通道、设备及保存位置，然后从 DSH 编译、启用并开始当前计划。计划源码更改以后须重新启用。原生仍负责驱动操作、暂停、停止和文件确认。控制不开放其他本机端口，桥只处理 DSH 启动的 Oxford 子进程的标准输入/输出；本机程序也可以单独运行。

带 `--dsh-stdio` 的独立进程收到协议请求时可以携带可选 `theme` 字段：`day`（罗德岛白昼）、`night`（罗德岛黑夜）、`glass`（终末地协议玻璃）、`xlab`（xLab 控制台）。初次握手和后续变更在 UI 线程使用现有换肤过程，更新原生控制、仪器前面板和曲线；相同协议不会反复重绘。WinForms 的玻璃背景采用 DSH 色层与基色叠加后的**不透明等效色**，不模拟浏览器的背景模糊。同步颜色不写用户原有浅色/深色偏好，也不发送仪器命令。当 DSH 管道断开，原生窗口恢复手动换肤，仍可就地管理正在执行的测量。

验证时可先用 **离线** 原生窗口，依次切换 DSH 四个主题，检查原生标题栏主题标识、前面板色板和返回状态中的 `theme`。未安装、未绑定、受 Windows 应用程序控制拦截或没有兼容驱动时，只能验证 DSH 工作台及离线计划预览；不要据此宣称真机采集通过。
