# 获取当前目录
$currentDir = Get-Location

# 构建目标 DLL 的路径
$repoPath = $currentDir
$modulePath = Join-Path -Path $currentDir -ChildPath "target\debug\tsg_httpc.dll"

# 确保路径使用 Windows 风格的反斜杠并转义
$repoPath = $currentDir -replace '\\', '\\'
$modulePath = $modulePath -replace '\\', '\\'

# 构建 JSON 字符串
$jsonPayload = "{`"repoPath`":`"$repoPath`",`"modulePath`":`"$modulePath`"}"

# 构建 Frida 命令
$fridaCommand = "frida -q --exit-on-error -l tests/frida/example-sites.js -P '$jsonPayload' frida.exe"

# 执行测试
Invoke-Expression $fridaCommand

# 读取临时文件并计算非空行数
$resultFile = Join-Path -Path $repoPath -ChildPath ".tmp_frida_test_result.txt"
if (Test-Path $resultFile) {
    $resultValue = Get-Content $resultFile | Select-Object -First 1
    if ($resultValue -match '^\d+$') {
        $exitCode = $resultValue
    } else {
        Write-Host "无法解析为整数，内容为：$resultValue"
        $exitCode = 254
    }
    $host.SetShouldExit($exitCode)
} else {
    $host.SetShouldExit(255)
}
