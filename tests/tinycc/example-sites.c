#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <windows.h>
#include "example-sites.h"

/* 颜色常量（编译时宏） */
#define CONSOLE_GREEN "\x1b[32m"
#define CONSOLE_RED   "\x1b[31m"
#define CONSOLE_RESET "\x1b[0m"

int main() {
    // 优先从构建输出目录加载 DLL（相对当前工作目录）
    HMODULE lib = LoadLibraryA("target\\debug\\tsg_httpc.dll");
    if (!lib) {
        DWORD err = GetLastError();
        printf("LoadLibrary failed, error=%lu\n", (unsigned long)err);
        return 255;
    }

    httpc_fn p_httpc = (httpc_fn)GetProcAddress(lib, "httpc");
    httpc_free_fn p_httpc_free = (httpc_free_fn)GetProcAddress(lib, "httpc_free");
    if (!p_httpc || !p_httpc_free) {
        DWORD err = GetLastError();
        printf("GetProcAddress failed, error=%lu (httpc=%p, httpc_free=%p)\n",
               (unsigned long)err, (void*)p_httpc, (void*)p_httpc_free);
        FreeLibrary(lib);
        return 254;
    }

    // 发送 GET 请求
    // 以下为测试框架：便于以后添加多个测试。输出使用英文，注释保持中文。

    Test tests[] = {
        {
            "example.com GET",
            "GET",
            "https://example.com",
            200,
            "Example Domain",
            NULL,
            0,
        },
        {
            "httpbin.org 404",
            "GET",
            "https://httpbin.org/status/404",
            404,
            NULL,
            NULL,
            0,
        },
        {
            "httpbin.org 418 teapot",
            "GET",
            "https://httpbin.org/status/418",
            418, "teapot",
            NULL,
            0,
        },
        {
            "httpbin.org 503",
            "GET",
            "https://httpbin.org/status/503",
            503,
            NULL,
            NULL,
            0,
        },
        {
            "httpbin.org Chinese qs",
            "GET",
            "https://httpbin.org/get?from=TSG%20%E5%8A%A8%E6%80%81%20HTTP(S)%20%E5%BA%93%E6%B5%8B%E8%AF%95",
            200,
            "\"from\": \"TSG \\u52a8\\u6001 HTTP(S) \\u5e93\\u6d4b\\u8bd5\"",
            NULL,
            0,
        },
        {
            "httpbin.org POST json",
            "POST",
            "https://httpbin.org/post",
            200,
            "\"data\": \"[{\\\"\\u6211\\u662f\\u8c01\\\": 5429}, 0x624995738]\"",
            "[{\"我是谁\": 5429}, 0x624995738]",
            1,
        },
        {
            "httpbin.org Bearer",
            "GET",
            "https://httpbin.org/bearer",
            200,
            "\"token\": \"TSG_TOKEN\"",
            NULL,
            1,
        },
        {
            "httpbin.org BasicAuth",
            "GET",
            "https://TSG:TSG-pass@httpbin.org/basic-auth/TSG/TSG-pass",
            200,
            "\"user\": \"TSG\"",
            NULL,
            1,
        },
        {
            "httpbin.org BasicAuth fail",
            "GET",
            "https://TSG:TSG-PASS@httpbin.org/basic-auth/TSG/TSG-pass",
            401,
            NULL,
            NULL,
            1,
        },
    };

    int ntests = sizeof(tests) / sizeof(tests[0]);
    int passed = 0;

    for (int i = 0; i < ntests; ++i) {
        Test *t = &tests[i];
        printf("Running test %d: ", i + 1, t->title);

        /* 针对需要自定义 headers 的用例，构建 HttpHeaders */
        HttpHeaders* hdrs_ptr = NULL;
        HttpHeaders hdrs = {0};
        HttpHeaderItem items[4];
        char* kbuf[4] = {0};
        char* vbuf[4] = {0};
        size_t nitems = 0;

        if (t->with_headers) {
            /* 通用：指定 Accept: application/json */
            kbuf[nitems] = _strdup("Accept");
            vbuf[nitems] = _strdup("application/json");
            items[nitems].key = kbuf[nitems];
            items[nitems].value = vbuf[nitems];
            nitems++;

            if (strcmp(t->title, "httpbin.org POST json") == 0) {
                kbuf[nitems] = _strdup("Content-Type");
                vbuf[nitems] = _strdup("application/json");
                items[nitems].key = kbuf[nitems];
                items[nitems].value = vbuf[nitems];
                nitems++;
            } else if (strcmp(t->title, "httpbin.org Bearer") == 0) {
                kbuf[nitems] = _strdup("Authorization");
                vbuf[nitems] = _strdup("Bearer TSG_TOKEN");
                items[nitems].key = kbuf[nitems];
                items[nitems].value = vbuf[nitems];
                nitems++;
            }

            if (nitems > 0) {
                hdrs.headers = items;
                hdrs.count = nitems;
                hdrs_ptr = &hdrs;
            }
        }

        const char* body = t->body;
        HttpResponse* response = p_httpc(t->method, t->url, hdrs_ptr, body);
        int ok = 1;

        if (!response) {
            /* 请求未返回对象，视为失败 */
            ok = 0;
            printf("%s[FAIL] %s%s\n", CONSOLE_RED, t->title, CONSOLE_RESET);
            printf("  Expected status: %u\n", (unsigned)t->expected_status);
            printf("  Actual response: <NULL>\n");
        } else {
            /* 检查状态码 */
            if (response->status != t->expected_status) {
                ok = 0;
                printf("%s[FAIL] %s%s\n", CONSOLE_RED, t->title, CONSOLE_RESET);
                printf("  Expected status: %u\n", (unsigned)t->expected_status);
                printf("  Actual status: %u\n", (unsigned)response->status);
            }

            /* 检查响应体是否包含期望子串（若有要求） */
            const char* body = response->body ? response->body : "";
            if (t->expected_body_substr) {
                if (strstr(body, t->expected_body_substr) == NULL) {
                    ok = 0;
                    printf("%s[FAIL] %s%s\n", CONSOLE_RED, t->title, CONSOLE_RESET);
                    printf("  Expected body to contain: \"%s\"\n", t->expected_body_substr);

                    /* 打印实际响应体的前几百字符以便调试 */
                    size_t len = strlen(body);
                    size_t max_print = 200;
                    size_t to_print = len < max_print ? len : max_print;
                    printf("  Actual body (truncated): \"");
                    if (to_print > 0) {
                        printf("%.*s", (int)to_print, body);
                    }
                    if (len > to_print) {
                        printf("...");
                    }
                    printf("\"\n");
                }
            }

            /* 释放响应对象 */
            p_httpc_free(response);
        }

        if (ok) {
            ++passed;
            printf("%s[PASS] %s%s\n", CONSOLE_GREEN, t->title, CONSOLE_RESET);
        } else {
            printf("\n");
        }

        /* 释放 headers 临时分配的内存 */
        for (size_t j = 0; j < nitems; ++j) {
            if (kbuf[j]) free(kbuf[j]);
            if (vbuf[j]) free(vbuf[j]);
        }
    }

    int failed = ntests - passed;
    /* 最终汇总：分别打印 Passed 和 Failed（如果有），最后打印总状态。使用颜色。英文输出，注释中文。 */
    printf("\n");
    if (passed > 0) {
        printf("%s%d/%d Passed%s\n", CONSOLE_GREEN, passed, ntests, CONSOLE_RESET);
    }
    if (failed > 0) {
        printf("%s%d/%d Failed%s\n", CONSOLE_RED, failed, ntests, CONSOLE_RESET);
    }

    if (failed == 0) {
        printf("%sOkay! All tests passed!%s\n", CONSOLE_GREEN, CONSOLE_RESET);
    } else {
        printf("\n%sOhh...Some tests failed...\n\n%s", CONSOLE_RED, CONSOLE_RESET);
        printf("Hint:\n");
        printf("  Some failures may be caused by server or network issues, not by your code.\n");
        printf("  Consider retrying or visiting the URL to check.\n");
    }

    FreeLibrary(lib);
    /* 返回失败用例数以便在 CI 中判断，最大不超过 126，因为 127 以上为错误数值保留 */
    return (failed < 126) ? failed : 126;
}
