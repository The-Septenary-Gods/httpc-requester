本项目用 Rust 语言编写，用于构建一个 C ABI .dll 动态库，提供 `httpc(char* method, char* url)` 方法。

本项目只需要考虑 Windows 目标，构建的 .dll 动态库目标是被 Frida 脚本调用运行，因此需要在这一平台上测试。
