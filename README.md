## 测试

测试始终应当在 Windows amd64 平台上进行。

本项目的测试包括 JSDoc、Frida 和 C 三部分。

运行测试前，需要先以 debug 模式构建一次项目：

``` Powershell
cargo build
```

### JSDoc 检查

第一次运行 JSDoc 检查前，需要确保已安装 Node.js（或 Bun, Deno，下略）和 tsc。

安装 Node.js 后，可以运行以下命令全局安装 tsc：

``` Powershell
npm install -g tsc
```

执行 JSDoc 检查：

``` Powershell
tsc
```

### C 测试

C 测试部分使用 TinyCC 编译器。第一次测试前可能需要安装 TinyCC。

Windows 系统下可以使用 Scoop 或 Chocolatey 安装。这里以 Scoop 为例：

``` Powershell
scoop install tinycc
```

运行 C 测试：

``` Powershell
tcc -run tests/tinycc/*.c
```

### Frida 测试

Frida 测试部分需要以下两个环境：
- Powershell 7 或更高
- Pip 3

第一次运行 Frida 检查前，可能需要用以下命令安装 frida-cli：

``` Powershell
pip install frida==16.4.10
pip install frida-tools==13.7.1
```

运行 Frida 测试：

``` Powershell
pwsh tests/frida/run-test.ps1
```
