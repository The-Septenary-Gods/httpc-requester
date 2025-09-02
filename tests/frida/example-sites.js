/// <reference path='../../@types/frida.d.ts' />
/// <reference path='../../@types/httpc.d.ts' />
/// <reference path='../../@types/httpc-test.d.ts' />

/** @type {string?} */
let g_repoPath = null;

// 添加颜色常量
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
};

class Httpc {
    /** @type {Module} */
    #Module;
    /** @type {Httpc.func_request} */
    #Func_Request;
    /** @type {Httpc.func_freeResponse} */
    #Func_FreeResponse;
    /** @type {string | undefined} */
    constructError;

    /** @param {string} modulePath */
    constructor(modulePath) {
        if (modulePath === undefined) {
            throw new Error('`modulePath` is required!');
        }

        try {
            this.#Module = Module.load(modulePath);
        } catch (e) {
            this.constructError = `Module.load failed for "${modulePath}": ${e.message}`;
            return;
        }

        const reqPtr = this.#Module.findExportByName('httpc');
        if (reqPtr === null || reqPtr.isNull()) {
            this.constructError = 'Export "httpc" not found in module: ' + modulePath;
            return;
        }
        this.#Func_Request = new NativeFunction(reqPtr, 'pointer', ['pointer','pointer','pointer','pointer']);

        const freePtr = this.#Module.findExportByName('httpc_free');
        if (freePtr === null || freePtr.isNull()) {
            this.constructError = 'Export "httpc_free" not found in module: ' + modulePath;
            return;
        }
        this.#Func_FreeResponse = new NativeFunction(freePtr, 'void', ['pointer']);
    }

    /**
     * 发送 HTTP(S) 请求
     *
     * ⚠️注意：这个方法是同步的，会阻塞线程！
     *
     * @param {string} method - HTTP 方法，如 'GET', 'POST'
     * @param {string} url - 请求的 URL，可以包括 Basic Auth 用户名、密码
     * @param {Map<string, string> | NativePointer} [headers] - 可选的请求头，Map 或 CHttpHeaders 指针
     * @param {string | NativePointer} [body] - 可选的请求体字符串，或指向 C 字符串的指针
     * @returns {Httpc.HttpResponse | null}
     */
    request(method, url, headers, body) {
        if (this.constructError) {
            throw new Error('Httpc not properly constructed: ' + this.constructError);
        }

        const requestParams = this.#getRequestParams(method, url, headers, body);
        const responsePtr = this.#Func_Request(...requestParams);

        try {
            return this.#handleResponse(responsePtr);
        } catch (_) {
            return null;
        } finally {
            // finally 总能触发，确保内存能释放
            // 无需空指针检查，Rust 层会做
            this.#Func_FreeResponse(responsePtr);
        }
    }

    /**
     * 从参数构造请求所需的 NativeFunction 参数
     * @param {string} method - HTTP 方法，如 'GET', 'POST'
     * @param {string} url - 请求的 URL，可以包括 Basic Auth 用户名、密码
     * @param {Map<string, string> | NativePointer} [headers] - 可选的请求头，Map 或 CHttpHeaders 指针
     * @param {string | NativePointer} [body] - 可选的请求体字符串，或指向 C 字符串的指针
     * @returns {ConstructorParameters<typeof Httpc.func_request>}
     */
    #getRequestParams(method, url, headers, body) {
        /** @type {Utf8String} */
        const methodBuf = Memory.allocUtf8String(method);

        /** @type {Utf8String} */
        const urlBuf = Memory.allocUtf8String(url);

        /** @type {Httpc.CHttpHeaders} */
        const headersPtr = headers instanceof Map ?
            this.#allocHeaders(headers) : // 如果传入 Map，转换为 CHttpHeaders 指针
            headers instanceof NativePointer ?
            headers : // 如果传入 NativePointer，则直接使用
            ptr(0);   // 否则视为 NULL

        /** @type {Utf8String} */
        const bodyPtr = typeof body === 'string' ?
            Memory.allocUtf8String(body) :  // 如果传入字符串，分配内存并写入
            body instanceof NativePointer ?
            body :  // 如果传入 NativePointer，则直接使用
            ptr(0); // 否则视为 NULL

        return [methodBuf, urlBuf, headersPtr, bodyPtr];
    }

    /**
     * 将 HTTP 相应结果从 C 结构体转换为 JS 对象
     * @param {Httpc.CHttpResponse} responsePtr 
     * @returns {Httpc.HttpResponse | null}
     */
    #handleResponse(responsePtr) {
        if (responsePtr.isNull()) {
            return null;
        }

        // body: char* @ 0x0
        const bodyPtr = responsePtr.readPointer();
        const body = bodyPtr.isNull() ? null : bodyPtr.readUtf8String();

        // status: uint16 @ 0x8
        const status = responsePtr.add(0x8).readU16();

        // content_type: char* @ 0x10
        const contentTypePtr = responsePtr.add(0x10).readPointer();
        const contentType = contentTypePtr.isNull() ? null : contentTypePtr.readUtf8String();

        // headers: HttpHeaders* @ 0x18
        const headersObjPtr = responsePtr.add(0x18).readPointer();
        /** @type {Map<string, string | null>} */
        const headers = new Map();

        if (!headersObjPtr.isNull()) {
            // HttpHeaders: headers (HttpHeaderItem*) @ 0x0, count (size_t) @ 0x8
            const itemsPtr = headersObjPtr.readPointer();
            const count = headersObjPtr.add(0x8).readU64().toNumber();

            for (let i = 0; i < count; i++) {
                // HttpHeaderItem: key @ 0x0, value @ 0x8, 每项大小 0x10 (64-bit pointers)
                const keyPtr = itemsPtr.add(i * 0x10).readPointer();
                const valPtr = itemsPtr.add(i * 0x10 + 0x8).readPointer();

                const key = keyPtr.isNull() ? null : keyPtr.readUtf8String();
                const value = valPtr.isNull() ? null : valPtr.readUtf8String();
                if (key !== null) {
                    headers.set(key.toLowerCase(), value);
                }
            }
        }

        return { body, status, content_type: contentType, headers };
    }

    /**
     * 为 C 层分配并写入 HttpHeaders 结构体（只在本次调用期间有效）
     * @param {Map<string,string>} headers
     * @returns {NativePointer} 指向 HttpHeaders 的指针
     */
    #allocHeaders(headers) {
        const count = headers.size >>> 0;
        if (count === 0) return ptr(0);

        // 分配 items 数组（每个 item: 2 个指针，共 0x10 bytes on 64-bit）
        const itemSize = Process.pointerSize * 2;
        const itemsBuf = Memory.alloc(itemSize * count);
        const stringAllocs = []; // Keep references here to prevent GC

        // 写入每个条目
        let i = 0;
        for (const [k, v] of headers.entries()) {
            const keyPtr = Memory.allocUtf8String(k);
            stringAllocs.push(keyPtr);
            const valPtr = Memory.allocUtf8String(v);
            stringAllocs.push(valPtr);

            const base = itemsBuf.add(i * itemSize);
            base.writePointer(keyPtr);
            base.add(Process.pointerSize).writePointer(valPtr);
            i++;
        }

        // 分配 HttpHeaders 结构体：items 指针 + size_t 计数
        const hdrs = Memory.alloc(Process.pointerSize + Process.pointerSize);
        hdrs.writePointer(itemsBuf);
        // size_t 假设使用 64 位（我们的 @types 里 size_t 是 64 位）
        hdrs.add(Process.pointerSize).writeU64(count);

        // HACK: Attach allocations to the returned pointer to prevent premature GC
        hdrs.itemsBuf = itemsBuf;
        hdrs.stringAllocs = stringAllocs;

        return hdrs;
    }
}

/**
 * 运行单个测试用例
 * @param {Httpc} httpc - Httpc 实例
 * @param {HttpcTest.TestCase} test - 测试用例对象
 * @param {number} index - 测试索引
 * @returns {boolean} 是否通过
 */
function runTest(httpc, test, index) {
    console.log(`Running test ${index + 1}: ${test.title}`);

    const headers = test.headers;
    const response = httpc.request(test.method, test.url, headers, test.body);
    let ok = true;

    if (!response) {
        ok = false;
        console.log(`  ${colors.red}[FAIL] ${test.title}`);
        console.log(`    Expected status: ${test.expected_status}`);
        console.log(`    Actual response: <NULL>${colors.reset}`);
    } else {
        // 检查状态码
        if (test.expected_status && response.status !== test.expected_status) {
            ok = false;
            console.log(`  ${colors.red}[FAIL] ${test.title}`);
            console.log(`    Expected status: ${test.expected_status}`);
            console.log(`    Actual status: ${response.status}${colors.reset}`);
        }

        // 检查响应体是否包含期望子串（若有要求）
        const body = response.body || '';
        if (test.expected_body_substr) {
            if (!body.includes(test.expected_body_substr)) {
                ok = false;
                console.log(`  ${colors.red}[FAIL] ${test.title}`);
                console.log(`    Expected body to contain: '${test.expected_body_substr}'`);

                // 打印实际响应体的前几百字符以便调试
                const maxPrint = 200;
                const truncatedBody = body.length > maxPrint ? body.substring(0, maxPrint) + '...' : body;
                console.log(`    Actual body (truncated): '${truncatedBody}'${colors.reset}`);
            }
        }

        // 检查期望 header（若有要求）
        if (test.expected_headers) {
            for (const [key, expectedValue] of Object.entries(test.expected_headers)) {
                const actualValue = response.headers.get(key.toLowerCase());
                if (actualValue !== expectedValue) {
                    ok = false;
                    console.log(`  ${colors.red}[FAIL] ${test.title}`);
                    console.log(`    Expected header ${key}: '${expectedValue}'`);
                    console.log(`    Actual header ${key}: '${actualValue}'${colors.reset}`);
                }
            }
        }
    }

    if (ok) {
        console.log(`  ${colors.green}[PASS] ${test.title}${colors.reset}`);
    }

    return ok;
}

rpc.exports = {
    init(stage, parameters) { // 测试入口
        g_repoPath = parameters.repoPath;
        const httpc = new Httpc(parameters.modulePath);

        // 定义测试用例
        /** @type {HttpcTest.TestCase[]} */
        const tests = [
            {
                title: 'example.com GET',
                method: 'GET',
                url: 'https://example.com',
                expected_status: 200,
                expected_body_substr: 'Example Domain',
                expected_headers: { 'Content-Type': 'text/html' },
            },
            {
                title: 'httpbin.org 404',
                method: 'GET',
                url: 'https://httpbin.org/status/404',
                expected_status: 404,
            },
            {
                title: 'httpbin.org 418 teapot',
                method: 'GET',
                url: 'https://httpbin.org/status/418',
                expected_status: 418,
                expected_body_substr: 'teapot'
            },
            {
                title: 'httpbin.org 503',
                method: 'GET',
                url: 'https://httpbin.org/status/503',
                expected_status: 503,
            },
            {
                title: 'httpbin.org Chinese qs',
                method: 'GET',
                url: 'https://httpbin.org/get?from=TSG%20%E5%8A%A8%E6%80%81%20HTTP(S)%20%E5%BA%93%E6%B5%8B%E8%AF%95',
                buildHeaders: () => new Map([
                    ['Accept', 'application/json'],
                ]),
                expected_status: 200,
                expected_body_substr: '"from": "TSG \\u52a8\\u6001 HTTP(S) \\u5e93\\u6d4b\\u8bd5"',
            },
            {
                title: 'httpbin.org POST json',
                method: 'POST',
                url: 'https://httpbin.org/post',
                buildHeaders: [
                    ['Accept', 'application/json'],
                    ['Content-Type', 'application/json'],
                ],
                body: '[{"我是谁": 5429}, 0x624995738]',
                expected_status: 200,
                expected_body_substr: '"data": "[{\\"\\u6211\\u662f\\u8c01\\": 5429}, 0x624995738]"',
                expected_headers: { 'Content-Type': 'application/json' },
            },
            {
                title: 'httpbin.org Bearer',
                method: 'GET',
                url: 'https://httpbin.org/bearer',
                headers: new Map([
                    ['Accept', 'application/json'],
                    ['Authorization', 'Bearer TSG_TOKEN'],
                ]),
                expected_status: 200,
                expected_body_substr: '"token": "TSG_TOKEN"',
            },
            {
                title: 'httpbin.org BasicAuth',
                method: 'GET',
                url: 'https://TSG:TSG-pass@httpbin.org/basic-auth/TSG/TSG-pass',
                headers: new Map([['Accept', 'application/json']]),
                expected_status: 200,
                expected_body_substr: '"user": "TSG"',
            },
            {
                title: 'httpbin.org BasicAuth fail',
                method: 'GET',
                url: 'https://TSG:TSG-PASS@httpbin.org/basic-auth/TSG/TSG-pass',
                headers: new Map([['Accept', 'application/json']]),
                expected_status: 401,
            },
        ];

        const ntests = tests.length;
        let passed = 0;

        for (let i = 0; i < ntests; i++) {
            if (runTest(httpc, tests[i], i)) {
                passed++;
            }
        }

        const failed = ntests - passed;

        // 写入失败用例数以便在 CI 中判断，最大不超过 126，因为 127 以上为错误数值保留
        const f = new File(g_repoPath + '\\.tmp_frida_test_result.txt', 'w');
        f.write(Math.min(failed, 126).toString());
        f.close();

        console.log();
        if (passed > 0) {
            console.log(`${colors.green}${passed}/${ntests} Passed${colors.reset}`);
        }
        if (failed > 0) {
            console.log(`${colors.red}${failed}/${ntests} Failed${colors.reset}`);
        }

        if (failed === 0) {
            console.log(`✅ ${colors.green}Okay! All tests passed!${colors.reset}`);
        } else {
            console.log(`\n❌ ${colors.red}Ohh...Some tests failed...\n${colors.reset}`);
            console.log('Hint:');
            console.log('  Some failures may be caused by server or network issues, not by your code.');
            console.log('  Consider retrying or visiting the URL to check.');
        }
    }
};
