/// <reference path="../../@types/frida.d.ts" />
/// <reference path="../../@types/httpc.d.ts" />

// 添加颜色常量
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
};

class Httpc {
    #Module;
    /** @type { (methodPtr: NativePointer, urlPtr: NativePointer) => Httpc.CHttpResponse } */
    #Func_Request;
    /** @type { (ptr: Httpc.CHttpResponse) => void } */
    #Func_FreeResponse;

    /** @param {string} modulePath */
    constructor(modulePath) {
        if (modulePath === undefined) {
            throw new Error('`modulePath` is required!');
        }
        this.#Module = Module.load(modulePath);

        this.#Func_Request = new NativeFunction(
            this.#Module.findExportByName('httpc'),
            'pointer',
            ['pointer', 'pointer'],
        );

        this.#Func_FreeResponse = new NativeFunction(
            this.#Module.findExportByName('httpc_free'),
            'void',
            ['pointer'],
        );
    }

    /**
     * @type {Httpc.request}
     */
    request(method, url) {
        const methodBuf = Memory.allocUtf8String(method);
        const urlBuf = Memory.allocUtf8String(url);

        const responsePtr = this.#Func_Request(methodBuf, urlBuf);
        if (responsePtr.isNull()) {
            return null;
        }

        // body: char* @ 0x0
        const bodyPtr = responsePtr.add(0x0).readPointer();
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
            const itemsPtr = headersObjPtr.add(0x0).readPointer();
            const count = headersObjPtr.add(0x8).readU64().toNumber();

            for (let i = 0; i < count; i++) {
                // HttpHeaderItem: key @ 0x0, value @ 0x8, 每项大小 0x10 (64-bit pointers)
                const keyPtr = itemsPtr.add(i * 0x10 + 0x0).readPointer();
                const valPtr = itemsPtr.add(i * 0x10 + 0x8).readPointer();

                const key = keyPtr.isNull() ? null : keyPtr.readUtf8String();
                const value = valPtr.isNull() ? null : valPtr.readUtf8String();
                if (key !== null) {
                    headers.set(key, value);
                }
            }
        }

        // 读取完成后释放由库分配的内存
        this.#Func_FreeResponse(responsePtr);

        return { body, status, content_type: contentType, headers };
    }
}

/**
 * 运行单个测试用例
 * @param {Httpc} httpc - Httpc 实例
 * @param {Object} test - 测试用例对象
 * @param {number} index - 测试索引
 * @returns {boolean} 是否通过
 */
function runTest(httpc, test, index) {
    console.log(`Running test ${index + 1}: ${test.title}`);

    const response = httpc.request(test.method, test.url);
    let ok = true;

    if (!response) {
        ok = false;
        console.log(`  ${colors.red}[FAIL] ${test.title}`);
        console.log(`    Expected status: ${test.expected_status}`);
        console.log(`    Actual response: <NULL>${colors.reset}`);
    } else {
        // 检查状态码
        if (response.status !== test.expected_status) {
            ok = false;
            console.log(`  ${colors.red}[FAIL] ${test.title}`);
            console.log(`    Expected status: ${test.expected_status}`);
            console.log(`    Actual status: ${response.status}${colors.reset}`);
        }

        // 检查响应体是否包含期望子串（若有要求）
        const body = response.body || "";
        if (test.expected_body_substr) {
            if (!body.includes(test.expected_body_substr)) {
                ok = false;
                console.log(`  ${colors.red}[FAIL] ${test.title}`);
                console.log(`    Expected body to contain: "${test.expected_body_substr}"`);

                // 打印实际响应体的前几百字符以便调试
                const maxPrint = 200;
                const truncatedBody = body.length > maxPrint ? body.substring(0, maxPrint) + "..." : body;
                console.log(`    Actual body (truncated): "${truncatedBody}"${colors.reset}`);
            }
        }

        // 检查期望 header（若有要求）
        if (test.expected_headers) {
            for (const [key, expectedValue] of Object.entries(test.expected_headers)) {
                const actualValue = response.headers.get(key.toLowerCase());
                if (actualValue !== expectedValue) {
                    ok = false;
                    console.log(`  ${colors.red}[FAIL] ${test.title}`);
                    console.log(`    Expected header ${key}: "${expectedValue}"`);
                    console.log(`    Actual header ${key}: "${actualValue}"${colors.reset}`);
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
        const httpc = new Httpc(parameters.modulePath);

        // 定义测试用例
        const tests = [
            {
                title: "example.com GET",
                method: "GET",
                url: "https://example.com",
                expected_status: 200,
                expected_body_substr: "Example Domain",
                expected_headers: { "Content-Type": "text/html" },
            },
            {
                title: "httpbin.org 404",
                method: "GET",
                url: "https://httpbin.org/status/404",
                expected_status: 404,
            },
            {
                title: "httpbin.org 418 teapot",
                method: "GET",
                url: "https://httpbin.org/status/418",
                expected_status: 418,
                expected_body_substr: "teapot"
            },
            {
                title: "httpbin.org 503",
                method: "GET",
                url: "https://httpbin.org/status/503",
                expected_status: 503,
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

        console.log("");
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
            console.log("Hint:");
            console.log("  Some failures may be caused by server or network issues, not by your code.");
            console.log("  Consider retrying or visiting the URL to check.");
        }
    }
};
