# 获取当前目录
$currentDir = Get-Location

# 构建目标 DLL 的路径
$modulePath = Join-Path -Path $currentDir -ChildPath "target\debug\tsg_httpc.dll"

# 确保路径使用 Windows 风格的反斜杠并转义
$modulePath = $modulePath -replace '\\', '\\'

# 构建 JSON 字符串
$jsonPayload = "{`"modulePath`":`"$modulePath`"}"

# 构建 Frida 命令
$fridaCommand = "frida -q --exit-on-error -l tests/frida/example-sites.js -P '$jsonPayload' frida.exe"

# 输出命令以供检查
Write-Host "Frida Command: $fridaCommand"

# 执行命令（如果需要）
Invoke-Expression $fridaCommand
