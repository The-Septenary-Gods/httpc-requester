## 测试

本项目的测试包括 Frida 和 C 两部分。

### 环境准备

Frida 测试部分需要以下两个环境：
- Powershell 7 或更高
- Pip 3

用以下命令安装 frida-cli：

``` Powershell
pip install frida==16.4.10
pip install frida-tools==13.7.1
```

C 测试部分使用 TinyCC 编译器。Windows 系统下可以使用 Scoop 或 Chocolatey 安装。这里以 Scoop 为例：

``` Powershell
scoop install tinycc
```

### 运行测试

运行测试前，需要先以 debug 模式构建一次项目：

``` Powershell
cargo build
```

运行 Frida 测试：

``` Powershell
pwsh tests/frida/run-test.ps1
```

运行 C 测试：

``` Powershell
tcc -run tests/tinycc/*.c
```
