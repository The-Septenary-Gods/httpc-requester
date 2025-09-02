本项目用 Rust 语言编写，用于构建一个 C ABI .dll 动态库，提供 `httpc(char* method, char* url)` 方法。

本项目只需要考虑 Windows 目标，构建的 .dll 动态库目标是被 Frida 脚本调用运行，因此需要在这一平台上测试。
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

## 语言标准差异

`#[unsafe(no_mangle)]` 是 Rust 2024 的标准，不是错误。
