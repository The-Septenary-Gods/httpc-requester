## 测试

### 环境准备

C 测试部分使用 TinyCC 编译器。Windows 系统下可以使用 Scoop 或 Chocolatey 安装。这里以 Scoop 为例：

``` Powershell
scoop install tinycc
```

### 运行测试

运行测试前，需要先以 debug 模式构建一次项目：

``` Powershell
cargo build
```

运行 C 测试：

``` Powershell
tcc -run tests/tinycc/*.c
```
