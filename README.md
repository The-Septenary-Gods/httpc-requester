# HTTP(S) 客户端动态库

**中文文档** | [English Document](README-en.md)

**HTTP(S) 客户端动态库** 是一个使用 Rust 编写的库，可以构建为动态链接库 `.dll`，并通过 Frida 或其他支持 C ABI 的语言或框架调用。

它支持常见的 HTTP 方法 `GET / DELETE / HEAD / OPTIONS / POST / PUT / PATCH`，并允许自定义请求头 `headers` 和请求体 `body`。

本项目有大量代码由人工智能编写或辅助编写。

## 构建

构建这一项目除了 Rust 工具链以外，没有其他依赖项。

本项目使用 Rust 2024 标准，因此最低构建版本为 1.85.0。

和绝大多数 Rust 项目一样，本项目可以直接用 `cargo build` 构建。

``` Powershell
cargo build            # 开发版本
cargo build --release  # 发布版本
```

> 本项目为 Windows amd64 平台开发，并在这一平台上测试。理论上支持其他 64 位平台，但未经测试，兼容性无法保证。
>
> 在 32 位平台上构建这一项目可能不存在问题，但测试代码中多处硬编码了指针大小为 64 位，因此在 32 位平台上运行测试代码时会失败。

## 使用

### Frida 使用

我们为 Frida 写了一个 wrapper，可以直接将 [`tests/frida/example-sites.js`](tests/frida/example-sites.js) 中的 `Httpc` 类引入你的工程中。

由于 Frida 没有模块功能，如果你没有用 webpack 或 ncc 等打包工具，那么引入这个类的最简单方法是直接将 `Httpc` 的代码复制到你的脚本中。

然后就可以使用这个模块了，就像这样：

``` JavaScript
const httpc = new Httpc(modulePath); // modulePath 为 .dll 文件的位置
if (httpc.constructError) { // constructError 通常是因为找不到库，或无法加载符号
    throw new Error(httpc.constructError);
}

const response = httpc.request('GET', 'https://example.com');
if (!response) {
    throw new Error('No response');
} else if (response.status === 0xFFFF) { // 用 0xFFFF 来表示库的报错，包括连接超时等问题
    throw new Error('Httpc dylib throwed error: ' + response.body);
}

console.log(response);
```

> 我们在 Frida v16.4.10 环境下测试我们的模块和 wrapper，因此在这个版本下是预期可用的。
>
> 我们也努力实现向前兼容性，在最新版的 Frida 中正常工作。
>
> 但在更早的版本中，可能会因为 Frida 缺失一些 JS API，或 QuickJS 引擎过旧而无法使用。

如果你愿意的话，可以在 `Httpc` 所在脚本的头部引入类型定义文件，这样可以让编辑器更好地为你提供类型提示，甚至让 tsc 为你做类型检查。

``` JavaScript
/// <reference path='../../@types/frida.d.ts' />
/// <reference path='../../@types/httpc.d.ts' />
```

你需要修改路径，让他们正确地指向你的 `*.d.ts` 文件。


### 其他语言通过 C ABI 调用

其他语言也可以通过 C ABI 调用这个库，例子如 [`tests/tinycc/example-sites.c`](tests/tinycc/example-sites.c)。

你可以在 [`includes/httpc.h`](includes/httpc.h) 中找到相关的函数声明和数据结构定义。

## 测试

测试始终应当在 Windows amd64 平台上进行。

本项目的测试包括 JSDoc、Frida 和 C 三部分。

运行测试前，需要先以 debug 模式构建一次项目：

``` Powershell
cargo build
```

### 修改 httpbin endpoint

测试中会使用 [httpbin](https://httpbin.org) 的 API 来检查请求和返回解析的正确性。但由于默认 endpoint
属于免费的公开服务，延迟较高，且有时会出现 503 错误。为了得到更准确的测试结果，可以用 docker 自行部署 httpbin 服务器：

``` Bash
docker run -p 80:80 kennethreitz/httpbin
```

> Windows 下默认不支持 docker 容器。可能需要安装 docker for Windows 来运行服务器，也可以在 WSL 或在另一台 Linux 服务器上运行。

然后设置环境变量 `HTTPBIN_ENDPOINT` 来让测试程序使用你的 API endpoint：

``` Powershell
$env:HTTPBIN_ENDPOINT = "https://your-custom-httpbin.org" # 替换为你的 endpoint
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
