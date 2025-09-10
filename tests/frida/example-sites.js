/* *********************************************************************
 *         Test Suite of HTTPC - HTTP(S) Client Dynamic Library
 * 
 * Copyright (C) 2025 爱佐 (Ayrzo, member of The Septenary Gods)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Project homepage: https://github.com/The-Septenary-Gods/httpc-requester
 * ********************************************************************* */

/// <reference path='../../@types/frida.d.ts' />
/// <reference path='../../@types/httpc.d.ts' />
/// <reference path='../../@types/httpc-test.d.ts' />

/** @type {string?} */
let g_repoPath = null;

/** @type {string} */
let g_httpbinEndpoint = 'https://httpbin.org';

// 添加颜色常量
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
};

/**
 * 设置 httpbin endpoint
 * @param {string} endpoint - 新的 endpoint
 */
function setHttpbinEndpoint(endpoint) {
    if (!endpoint || endpoint.trim() === '') {
        g_httpbinEndpoint = 'https://httpbin.org';
        return;
    }

    let normalizedEndpoint = endpoint.trim();

    // 如果没有协议前缀，添加 http://
    if (!normalizedEndpoint.startsWith('http://') && !normalizedEndpoint.startsWith('https://')) {
        normalizedEndpoint = 'http://' + normalizedEndpoint;
    }

    // 移除末尾的斜杠
    if (normalizedEndpoint.endsWith('/')) {
        normalizedEndpoint = normalizedEndpoint.slice(0, -1);
    }

    g_httpbinEndpoint = normalizedEndpoint;
}

/**
 * 获取完整的 httpbin URL
 * @param {string} path - 路径，如 '/status/404'
 * @returns {string}
 */
function getHttpbinUrl(path) {
    const safePath = path || '';
    const slash = safePath.startsWith('/') ? '' : '/';
    return `${g_httpbinEndpoint}${slash}${safePath}`;
}

/**
 * 获取带基础认证的完整 httpbin URL
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @param {string} path - 路径
 * @returns {string}
 */
function getHttpbinUrlWithBasicAuth(username, password, path) {
    const safePath = path || '';
    const slash = safePath.startsWith('/') ? '' : '/';

    // 查找协议部分
    const protocolMatch = g_httpbinEndpoint.match(/^(https?:\/\/)/);
    if (!protocolMatch) {
        throw new Error('Invalid endpoint format');
    }

    const protocol = protocolMatch[1];
    const hostPart = g_httpbinEndpoint.substring(protocol.length);

    return `${protocol}${username}:${password}@${hostPart}${slash}${safePath}`;
}

class Httpc {
    /** @ts-ignore @type {Module} */
    #Module;
    /** @ts-ignore @type {Httpc.func_request} */
    #Func_Request;
    /** @ts-ignore @type {Httpc.func_requestAsync} */
    #Func_RequestAsync;
    /** @ts-ignore @type {Httpc.func_freeResponse} */
    #Func_FreeResponse;
    /**
     * 由于保持异步请求中 callback 函数的引用，避免被 GC
     * @type {Array<NativeCallback<'void', ['pointer', 'pointer']>>}
     */
    #activeCallbacks = [];

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
            const msg = e instanceof Error ? e.message : e;
            this.constructError = `Module.load failed for "${modulePath}": ${msg}`;
            return;
        }

        const reqPtr = this.#Module.findExportByName('httpc');
        if (reqPtr === null || reqPtr.isNull()) {
            this.constructError = 'Export "httpc" not found in module: ' + modulePath;
            return;
        } // @ts-expect-error
        this.#Func_Request = new NativeFunction(reqPtr, 'pointer', ['pointer','pointer','pointer','pointer']);

        const reqAsyncPtr = this.#Module.findExportByName('httpc_async');
        if (reqAsyncPtr === null || reqAsyncPtr.isNull()) {
            this.constructError = 'Export "httpc_async" not found in module: ' + modulePath;
            return;
        } // @ts-expect-error
        this.#Func_RequestAsync = new NativeFunction(
            reqAsyncPtr,
            'void',
            ['pointer','pointer','pointer','pointer','pointer','pointer'],
        );

        const freePtr = this.#Module.findExportByName('httpc_free');
        if (freePtr === null || freePtr.isNull()) {
            this.constructError = 'Export "httpc_free" not found in module: ' + modulePath;
            return;
        } // @ts-expect-error
        this.#Func_FreeResponse = new NativeFunction(freePtr, 'void', ['pointer']);
    }

    /**
     * 发送 HTTP(S) 请求
     *
     * ⚠️注意：这个方法是同步的，会阻塞线程！
     *
     * @param {string} method - HTTP 方法，如 'GET', 'POST'
     * @param {string} url - 请求的 URL，可以包括 Basic Auth 用户名、密码
     * @param {Map<string, string> | Httpc.CHttpHeaders | null} [headers] - 可选的请求头，Map 或 CHttpHeaders 指针
     * @param {string | Utf8String | null} [body] - 可选的请求体字符串，或指向 C 字符串的指针
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
     * 异步发送 HTTP(S) 请求
     *
     * @param {string} method - HTTP 方法，如 'GET', 'POST'
     * @param {string} url - 请求的 URL，可以包括 Basic Auth 用户名、密码
     * @param {Map<string, string> | Httpc.CHttpHeaders | null} [headers] - 可选的请求头，Map 或 CHttpHeaders 指针
     * @param {string | Utf8String | null} [body] - 可选的请求体字符串，或指向 C 字符串的指针
     * @returns {Promise<Httpc.HttpResponse | null>}
     */
    requestAsync(method, url, headers, body) {
        return new Promise((resolve, reject) => {
            if (this.constructError) {
                reject(new Error('Httpc not properly constructed: ' + this.constructError));
                return;
            }

            // @ts-expect-error
            const callback = new NativeCallback((
                /** @type {Httpc.CHttpResponse} */
                responsePtr,
                _contextPtr,
            ) => {
                // 从持有引用的数组中移除回调
                const index = this.#activeCallbacks.indexOf(callback);
                if (index > -1) {
                    this.#activeCallbacks.splice(index, 1);
                }

                try {
                    const response = this.#handleResponse(responsePtr);
                    resolve(response);
                } catch (error) {
                    resolve(null);
                } finally {
                    if (!responsePtr.isNull()) {
                        this.#Func_FreeResponse(responsePtr);
                    }
                }
            }, 'void', ['pointer', 'pointer'], 'default');

            // 将回调保存到持有引用的数组中，防止被垃圾回收
            this.#activeCallbacks.push(callback);

            const requestParams = this.#getRequestParams(method, url, headers, body);

            try {
                // JS 端一次调用创建一个 NativeCallback，不用 context 指针
                this.#Func_RequestAsync(callback, ptr(0), ...requestParams);
            } catch (error) {
                // 从持有引用的数组中移除回调
                const index = this.#activeCallbacks.indexOf(callback);
                if (index > -1) {
                    this.#activeCallbacks.splice(index, 1);
                }

                reject(error);
            }
        });
    }

    /**
     * 从参数构造请求所需的 NativeFunction 参数
     * @param {string} method - HTTP 方法，如 'GET', 'POST'
     * @param {string} url - 请求的 URL，可以包括 Basic Auth 用户名、密码
     * @param {Map<string, string> | Httpc.CHttpHeaders | null} [headers] - 可选的请求头，Map 或 CHttpHeaders 指针
     * @param {string | Utf8String | null} [body] - 可选的请求体字符串，或指向 C 字符串的指针
     * @returns {Parameters<typeof Httpc.func_request>}
     */
    #getRequestParams(method, url, headers, body) {
        /** @type {Utf8String} */
        const methodBuf = Memory.allocUtf8String(method);

        /** @type {Utf8String} */
        const urlBuf = Memory.allocUtf8String(url);

        /** @type {Httpc.CHttpHeaders | NULL} */
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
     * @returns {Httpc.CHttpHeaders | NULL} 指向 HttpHeaders 的指针
     */
    #allocHeaders(headers) {
        const count = headers.size;
        if (count === 0) return ptr(0);

        // 分配 items 数组（每个 item: 2 个指针，共 0x10 bytes on 64-bit）
        const itemSize = Process.pointerSize * 2;
        /** @ts-expect-error @type {TArrayAllocator<Pointer<ReadonlyUtf8String>>} */
        const itemsBuf = Memory.alloc(itemSize * count);
        const stringAllocs = []; // Keep references here to prevent GC

        // 写入每个条目
        let i = 0;
        for (const [k, v] of headers.entries()) {
            const keyPtr = Memory.allocUtf8String(k);
            stringAllocs.push(keyPtr);
            const valPtr = Memory.allocUtf8String(v);
            stringAllocs.push(valPtr);

            /** @ts-expect-error @type {Httpc.CHttpHeaderItem} */
            const base = itemsBuf.add(i * itemSize);
            base.writePointer(keyPtr);
            base.add(Process.pointerSize).writePointer(valPtr);
            i++;
        }

        // 分配 HttpHeaders 结构体：items 指针 + size_t 计数
        /** @ts-expect-error @type {Httpc.CHttpHeaders} */
        const hdrs = Memory.alloc(Process.pointerSize + Process.pointerSize);
        hdrs.writePointer(itemsBuf);
        // @ts-expect-error size_t 假设使用 64 位（我们的 @types 里 size_t 是 64 位）
        hdrs.add(Process.pointerSize).writeU64(count);

        // @ts-expect-error HACK: Attach allocations to the returned pointer to prevent premature GC
        hdrs.itemsBuf = itemsBuf, hdrs.stringAllocs = stringAllocs;

        return hdrs;
    }
}

/**
 * 处理测试结果的通用函数
 * @param {HttpcTest.TestCase} test - 测试用例对象
 * @param {Httpc.HttpResponse | null} response - 响应对象
 * @returns {boolean} 是否通过
 */
function processTestResult(test, response) {
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

/**
 * 运行单个同步测试用例
 * @param {Httpc} httpc - Httpc 实例
 * @param {HttpcTest.TestCase} test - 测试用例对象
 * @param {number} index - 测试索引
 * @returns {boolean} 是否通过
 */
function runSyncTest(httpc, test, index) {
    console.log(`Running sync test ${index + 1}: ${test.title}`);
    const response = httpc.request(test.method, test.url, test.headers, test.body);
    return processTestResult(test, response);
}

/**
 * 运行单个异步测试用例
 * @param {Httpc} httpc - Httpc 实例
 * @param {HttpcTest.TestCase} test - 测试用例对象
 * @param {number} index - 测试索引
 * @returns {Promise<boolean>} 是否通过
 */
async function runAsyncTest(httpc, test, index) {
    console.log(`Running async test ${index + 1}: ${test.title}`);
    try {
        const response = await httpc.requestAsync(test.method, test.url, test.headers, test.body);
        return processTestResult(test, response);
    } catch (error) {
        console.log(`  ${colors.red}[FAIL] ${test.title} - Error: ${error}${colors.reset}`);
        return false;
    }
}

rpc.exports = {
    // @ts-ignore
    async init(_stage, parameters) { // 测试入口
        g_repoPath = parameters.repoPath;

        // 设置 httpbin endpoint（如果通过参数传入）
        if (parameters.httpbinEndpoint) {
            setHttpbinEndpoint(parameters.httpbinEndpoint);
        }

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
                title: 'httpbin 404',
                method: 'GET',
                url: getHttpbinUrl('/status/404'),
                expected_status: 404,
            },
            {
                title: 'httpbin 418 teapot',
                method: 'GET',
                url: getHttpbinUrl('/status/418'),
                expected_status: 418,
                expected_body_substr: 'teapot'
            },
            {
                title: 'httpbin 503',
                method: 'GET',
                url: getHttpbinUrl('/status/503'),
                expected_status: 503,
            },
            {
                title: 'httpbin Chinese qs',
                method: 'GET',
                url: getHttpbinUrl('/get?from=TSG%20%E5%8A%A8%E6%80%81%20HTTP(S)%20%E5%BA%93%E6%B5%8B%E8%AF%95'),
                headers: new Map([
                    ['Accept', 'application/json'],
                ]),
                expected_status: 200,
                expected_body_substr: '"from": "TSG \\u52a8\\u6001 HTTP(S) \\u5e93\\u6d4b\\u8bd5"',
            },
            {
                title: 'httpbin POST json',
                method: 'POST',
                url: getHttpbinUrl('/post'),
                headers: new Map([
                    ['Accept', 'application/json'],
                    ['Content-Type', 'application/json'],
                ]),
                body: '[{"我是谁": 5429}, 0x624995738]',
                expected_status: 200,
                expected_body_substr: '"data": "[{\\"\\u6211\\u662f\\u8c01\\": 5429}, 0x624995738]"',
                expected_headers: { 'Content-Type': 'application/json' },
            },
            {
                title: 'httpbin Bearer',
                method: 'GET',
                url: getHttpbinUrl('/bearer'),
                headers: new Map([
                    ['Accept', 'application/json'],
                    ['Authorization', 'Bearer TSG_TOKEN'],
                ]),
                expected_status: 200,
                expected_body_substr: '"token": "TSG_TOKEN"',
            },
            {
                title: 'httpbin BasicAuth',
                method: 'GET',
                url: getHttpbinUrlWithBasicAuth('TSG', 'TSG-pass', '/basic-auth/TSG/TSG-pass'),
                headers: new Map([['Accept', 'application/json']]),
                expected_status: 200,
                expected_body_substr: '"user": "TSG"',
            },
            {
                title: 'httpbin BasicAuth fail',
                method: 'GET',
                url: getHttpbinUrlWithBasicAuth('TSG', 'TSG-PASS', '/basic-auth/TSG/TSG-pass'),
                headers: new Map([['Accept', 'application/json']]),
                expected_status: 401,
            },
        ];

        const ntests = tests.length;

        // 运行同步测试
        console.log('--- Running Synchronous Tests ---');
        let syncPassed = 0;
        for (let i = 0; i < ntests; i++) {
            if (runSyncTest(httpc, tests[i], i)) {
                syncPassed++;
            }
        }

        // 运行异步测试
        console.log('\n--- Running Asynchronous Tests ---');
        let asyncPassed = 0;

        // 运行异步测试
        let asyncResults = [];

        try {
            // 创建所有异步测试的 Promise
            const asyncPromises = tests.map((test, index) =>
                runAsyncTest(httpc, test, index)
            );

            // 等待所有异步测试完成
            asyncResults = await Promise.all(asyncPromises);
        } catch (error) {
            console.log(`Async tests error: ${error}`);
            // 将所有异步测试标记为失败
            asyncResults = new Array(tests.length).fill(false);
        }

        console.log('\n--- Processing Asynchronous Test Results ---');
        asyncResults.forEach((passed) => {
            if (passed) {
                asyncPassed++;
            }
        });

        // 计算总体结果
        const totalTests = ntests * 2; // 同步 + 异步
        const totalPassed = syncPassed + asyncPassed;
        const totalFailed = totalTests - totalPassed;

        // 写入失败用例数以便在 CI 中判断，最大不超过 126，因为 127 以上为错误数值保留
        const f = new File(g_repoPath + '\\.tmp_frida_test_result.txt', 'w');
        f.write(Math.min(totalFailed, 126).toString());
        f.close();

        console.log();
        console.log(`${colors.green}Sync Tests: ${syncPassed}/${ntests} Passed${colors.reset}`);
        console.log(`${colors.green}Async Tests: ${asyncPassed}/${ntests} Passed${colors.reset}`);
        console.log(`${colors.green}Total: ${totalPassed}/${totalTests} Passed${colors.reset}`);

        if (totalFailed > 0) {
            console.log(`${colors.red}Total Failed: ${totalFailed}/${totalTests}${colors.reset}`);
        }

        if (totalFailed === 0) {
            console.log(`✅ ${colors.green}Okay! All tests passed!${colors.reset}`);
        } else {
            console.log(`\n❌ ${colors.red}Ohh...Some tests failed...\n${colors.reset}`);
            console.log('Hint:');
            console.log('  Some failures may be caused by server or network issues, not by your code.');
            console.log('  Consider retrying or visiting the URL to check.');
        }
    }
};
