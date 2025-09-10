# HTTPC - HTTP(S) Client Dynamic Library

[中文文档](README.md) | **English Document**

**HTTPC** is a library written in Rust that can be built as a dynamic link library (`.dll`). It provides a C-ABI interface for making HTTP(S) requests, and can be called via Frida or any other language or framework that supports the C ABI.

It supports common HTTP methods: `GET`, `DELETE`, `HEAD`, `OPTIONS`, `POST`, `PUT`, and `PATCH`,
and allows customization of request headers (`headers`) and request body (`body`).

A significant portion of this project's code was written or assisted by artificial intelligence.

## Building

This project has no dependencies other than the Rust toolchain.

The project uses the Rust 2024 edition, so the minimum required Rust version is 1.85.0.

Like most Rust projects, it can be built directly using `cargo build`.

```powershell
cargo build            # Debug build
cargo build --release  # Release build
```

> This project was developed and tested on the Windows amd64 platform.
> It theoretically supports other 64-bit platforms, but compatibility is not guaranteed as it has not been tested.
>
> Building the project on 32-bit platforms may work without issues, but the test code contains multiple hard-coded
> assumptions about 64-bit pointer sizes, which will cause test failures on 32-bit platforms.

## Usage

### Using with Frida

We provide a wrapper for Frida, allowing you to directly import the `Httpc` class from
[`tests/frida/example-sites.js`](tests/frida/example-sites.js) into your project.

Since Frida lacks module functionality, if you're not using bundling tools like Webpack or ncc,
the simplest way to use the `Httpc` class is to copy its code directly into your script.

You can then use the module as follows:

```javascript
const httpc = new Httpc(modulePath); // modulePath is the location of the .dll file
if (httpc.constructError) { // constructError typically occurs if the library is not found or symbols cannot be loaded
    throw new Error(httpc.constructError);
}

const response = httpc.request('GET', 'https://example.com');
if (!response) {
    throw new Error('No response');
} else if (response.status === 0xFFFF) {
    // 0xFFFF indicates an error from the library, including connection timeouts, etc.
    throw new Error('Httpc dylib threw error: ' + response.body);
}

console.log(response);
```

> We test our module and wrapper in the Frida v16.4.10 environment, so it is expected to work in this version.
>
> We also strive for forward compatibility, ensuring it works in the latest version of Frida.
>
> However, in earlier versions, it may not work due to missing JS APIs in Frida or an outdated QuickJS engine.

If desired, you can include type definition files at the top of the script containing `Httpc`
to enable better type hints in your editor, or even perform type checking with `tsc`:

```javascript
/// <reference path='../../@types/frida.d.ts' />
/// <reference path='../../@types/httpc.d.ts' />
```

You will need to adjust the paths to correctly point to your `*.d.ts` files.

### Calling via C ABI on Other Languages

Other languages can call this library via the C ABI. An example is provided in [`tests/tinycc/example-sites.c`](tests/tinycc/example-sites.c).

Relevant function declarations and data structure definitions can be found in [`includes/httpc.h`](includes/httpc.h).

## Testing

Testing should always be performed on the Windows amd64 platform.

The project's tests consist of three parts: JSDoc, Frida, and C.

Before running tests, you must first build the project in debug mode:

```powershell
cargo build
```

### Modifying the httpbin Endpoint

The tests use the [httpbin](https://httpbin.org) API to verify request and response parsing. However, since the default endpoint is a free public service, it can have high latency and may occasionally return 503 errors. For more reliable test results, you can deploy your own httpbin server using Docker:

```bash
docker run -p 80:80 kennethreitz/httpbin
```

> Docker containers are not supported by default on Windows. You may need to install Docker for Windows to run the server, or you can run it in WSL or on another Linux server.

Then, set the `HTTPBIN_ENDPOINT` environment variable to let the test program use your API endpoint:

```powershell
$env:HTTPBIN_ENDPOINT = "https://your-custom-httpbin.org" # Replace with your endpoint
```
When running CI via GitHub Actions or similar workflows, it is also possible and recommended to set the `HTTPBIN_ENDPOINT` environment variable to customize the httpbin endpoint.

To set this variable in GitHub Actions, refer to [this guide](https://docs.github.com/en/actions/learn-github-actions/variables#creating-configuration-variables-for-a-repository). Add a repository variable with the key `HTTPBIN_ENDPOINT` and set its value to your desired endpoint.

### JSDoc Checking

Before running JSDoc checks for the first time, ensure that Node.js (or Bun, Deno, etc.) and `tsc` are installed.

After installing Node.js, you can globally install `tsc` with the following command:

```powershell
npm install -g tsc
```

Run the JSDoc checks:

```powershell
tsc
```

### C Tests

The C tests use the TinyCC compiler. You may need to install TinyCC before running the tests for the first time.

On Windows, you can use Scoop or Chocolatey to install TinyCC. Here's an example using Scoop:

```powershell
scoop install tinycc
```

Run the C tests:

```powershell
tcc -run tests/tinycc/*.c
```

### Frida Tests

The Frida tests require the following environment:
- PowerShell 7 or higher
- Pip 3

Before running Frida checks for the first time, you may need to install `frida-cli` using the following commands:

```powershell
pip install frida==16.4.10
pip install frida-tools==13.7.1
```

Run the Frida tests:

```powershell
pwsh tests/frida/run-test.ps1
```
