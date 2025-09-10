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

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <windows.h>
#include "example-sites.h"

/* 颜色常量（编译时宏） */
#define CONSOLE_GREEN "\x1b[32m"
#define CONSOLE_RED   "\x1b[31m"
#define CONSOLE_RESET "\x1b[0m"

#define MAX_TESTS 16

#define ERR_FAILED_TO_LOAD_LIBRARY 255
#define ERR_FAILED_TO_GET_PROC_ADDRESS 254
#define ERR_MEMORY_ALLOCATION 253
#define ERR_EXCEED_MAX_TESTS 250

#define DEFAULT_HTTPBIN_ENDPOINT "https://httpbin.org"

// 全局函数指针
static httpc_free_fn p_httpc_free_global = NULL;

// 内部函数：获取基础 endpoint（不含路径）
static char* get_httpbin_base_endpoint() {
    // 全局缓存环境变量结果
    static char* httpbin_endpoint = NULL;

    if (!httpbin_endpoint) {
        const char* const env_endpoint = getenv("HTTPBIN_ENDPOINT");

        if (!env_endpoint || strlen(env_endpoint) == 0) {
            httpbin_endpoint = strdup(DEFAULT_HTTPBIN_ENDPOINT);
            if (!httpbin_endpoint) {
                exit(ERR_MEMORY_ALLOCATION);
            }
        } else {
            if (strncmp(env_endpoint, "http://", 7) != 0
             && strncmp(env_endpoint, "https://", 8) != 0) {
                const char* const prefix = "http://";
                size_t endpoint_chars = strlen(prefix) + strlen(env_endpoint) + 1;
                char* full_endpoint = (char*)malloc(endpoint_chars);
                if (!full_endpoint) {
                    exit(ERR_MEMORY_ALLOCATION);
                }
                snprintf(full_endpoint, endpoint_chars, "%s%s", prefix, env_endpoint);
                httpbin_endpoint = full_endpoint;
            } else {
                httpbin_endpoint = strdup(env_endpoint);
                if (!httpbin_endpoint) {
                    exit(ERR_MEMORY_ALLOCATION);
                }
            }

            // 检查最后一个字符是否为 '/'，如果是则清除
            if (httpbin_endpoint[strlen(httpbin_endpoint) - 1] == '/') {
                httpbin_endpoint[strlen(httpbin_endpoint) - 1] = '\0';
            }
        }
    }

    return httpbin_endpoint;
}

// 获取完整的 URL - 如果 path 为 NULL 或空字符串，返回不带路径的 httpbin_endpoint。
// 返回堆内存，需要调用者管理生命周期。
char* get_httpbin_url(const char* path) {
    char* httpbin_endpoint = get_httpbin_base_endpoint();
    const char* safe_path = path ? path : "";
    const char* slash = (safe_path[0] == '/') ? "" : "/";

    size_t url_chars = strlen(httpbin_endpoint) + strlen(slash) + strlen(safe_path) + 1;
    char* full_url = (char*)malloc(url_chars);
    if (!full_url) {
        exit(ERR_MEMORY_ALLOCATION);
    }

    snprintf(full_url, url_chars, "%s%s%s", httpbin_endpoint, slash, safe_path);
    return full_url;
}

// 获取带基础认证的完整 URL
// 返回堆内存，需要调用者管理生命周期。
char* get_httpbin_url_with_basic_auth(const char* username, const char* password, const char* path) {
    char* base_endpoint = get_httpbin_base_endpoint();
    const char* safe_path = path ? path : "";
    const char* slash = (safe_path[0] == '/') ? "" : "/";

    // 查找协议部分
    char* protocol_end = strstr(base_endpoint, "://");
    if (!protocol_end) {
        exit(ERR_MEMORY_ALLOCATION); // 无效的 endpoint 格式
    }

    size_t protocol_len = protocol_end - base_endpoint + 3; // 包含 "://"
    char* host_part = protocol_end + 3;

    // 计算所需内存大小
    size_t url_chars = protocol_len + strlen(username) + 1 + strlen(password) + 1 +
                       strlen(host_part) + strlen(slash) + strlen(safe_path) + 1;

    char* full_url = (char*)malloc(url_chars);
    if (!full_url) {
        exit(ERR_MEMORY_ALLOCATION);
    }

    // 拼接 URL: protocol://username:password@host/path
    snprintf(full_url, url_chars, "%.*s%s:%s@%s%s%s",
             (int)protocol_len, base_endpoint, username, password, host_part, slash, safe_path);

    return full_url;
}

// --- 异步测试所需的上下文 ---
typedef struct {
    const Test* test;
} AsyncContext;

volatile long g_async_completed_count = 0;
volatile long g_async_passed_count = 0;

/**
 * @brief 核心测试逻辑：比较响应和预期结果。
 */
static int process_test_result(const Test* t, const HttpResponse* response) {
    int ok = 1;
    printf("Processing result for: %s\n", t->title);
    if (!response) {
        ok = 0;
        printf("%s[FAIL] %s%s\n", CONSOLE_RED, t->title, CONSOLE_RESET);
        printf("  Expected status: %u\n", (unsigned)t->expected_status);
        printf("  Actual response: <NULL>\n");
    } else {
        if (response->status != t->expected_status) {
            ok = 0;
            printf("%s[FAIL] %s%s\n", CONSOLE_RED, t->title, CONSOLE_RESET);
            printf("  Expected status: %u\n", (unsigned)t->expected_status);
            printf("  Actual status: %u\n", (unsigned)response->status);
        }

        const char* body = response->body ? response->body : "";
        if (t->expected_body_substr) {
            if (strstr(body, t->expected_body_substr) == NULL) {
                ok = 0;
                printf("%s[FAIL] %s%s\n", CONSOLE_RED, t->title, CONSOLE_RESET);
                printf("  Expected body to contain: \"%s\"\n", t->expected_body_substr);
                printf("  Actual body (first 500 chars): \"%.500s\"\n", body);
            }
        }
    }

    if (ok) {
        printf("%s[PASS] %s%s\n", CONSOLE_GREEN, t->title, CONSOLE_RESET);
    } else {
        printf("\n");
    }
    return ok;
}

/**
 * @brief 异步请求的回调函数。
 */
static void async_test_callback(HttpResponse* response, void* context) {
    AsyncContext* ctx = (AsyncContext*)context;
    if (process_test_result(ctx->test, response)) {
        InterlockedIncrement(&g_async_passed_count);
    }

    if (response) {
        p_httpc_free_global(response);
    }

    // 释放上下文
    free(ctx);

    InterlockedIncrement(&g_async_completed_count);
}

int main() {
    HMODULE lib = LoadLibraryA("target\\debug\\httpc.dll");
    if (!lib) {
        printf("LoadLibrary failed, error=%lu\n", (unsigned long)GetLastError());
        return ERR_FAILED_TO_LOAD_LIBRARY;
    }

    const httpc_fn p_httpc = (httpc_fn)GetProcAddress(lib, "httpc");
    const httpc_async_fn p_httpc_async = (httpc_async_fn)GetProcAddress(lib, "httpc_async");
    p_httpc_free_global = (httpc_free_fn)GetProcAddress(lib, "httpc_free");

    if (!p_httpc || !p_httpc_async || !p_httpc_free_global) {
        printf("GetProcAddress failed, error=%lu\n", (unsigned long)GetLastError());
        FreeLibrary(lib);
        return ERR_FAILED_TO_GET_PROC_ADDRESS;
    }

    const Test tests[] = {
        {
            "example.com GET",
            "GET", "https://example.com",
            200,
            "Example Domain",
            NULL,
            0,
        }, {
            "httpbin 404",
            "GET", get_httpbin_url("/status/404"),
            404,
            NULL,
            NULL,
            0,
        }, {
            "httpbin 418 teapot",
            "GET", get_httpbin_url("/status/418"),
            418,
            "teapot",
            NULL,
            0,
        }, {
            "httpbin 503",
            "GET", get_httpbin_url("/status/503"),
            503,
            NULL,
            NULL,
            0,
        }, {
            "httpbin Chinese qs",
            "GET", get_httpbin_url("/get?from=TSG%20%E5%8A%A8%E6%80%81%20HTTP(S)%20%E5%BA%93%E6%B5%8B%E8%AF%95"),
            200,
            "\"from\": \"TSG \\u52a8\\u6001 HTTP(S) \\u5e93\\u6d4b\\u8bd5\"",
            NULL,
            0,
        }, {
            "httpbin POST json",
            "POST", get_httpbin_url("/post"),
            200,
            "\"data\": \"[{\\\"\\u6211\\u662f\\u8c01\\\": 5429}, 0x624995738]\"",
            "[{\"我是谁\": 5429}, 0x624995738]",
            1,
        }, {
            "httpbin Bearer",
            "GET", get_httpbin_url("/bearer"),
            200,
            "\"token\": \"TSG_TOKEN\"",
            NULL,
            1,
        }, {
            "httpbin BasicAuth",
            "GET", get_httpbin_url_with_basic_auth("TSG", "TSG-pass", "/basic-auth/TSG/TSG-pass"),
            200,
            "\"user\": \"TSG\"",
            NULL,
            1,
        }, {
            "httpbin BasicAuth fail",
            "GET", get_httpbin_url_with_basic_auth("TSG", "TSG-PASS", "/basic-auth/TSG/TSG-pass"),
            401,
            NULL,
            NULL,
            1,
        },
    };

    const int ntests = sizeof(tests) / sizeof(Test);
    if (ntests > MAX_TESTS) {
        printf("Error: Number of tests exceeds MAX_TESTS.\n");
        FreeLibrary(lib);
        return ERR_EXCEED_MAX_TESTS;
    }

    int sync_passed = 0;
    printf("--- Running Synchronous Tests ---\n");
    for (size_t i = 0; i < ntests; ++i) {
        const Test* const t = &tests[i];
        HttpHeaders* hdrs_ptr = NULL;
        HttpHeaders hdrs = {0};
        HttpHeaderItem items[4];
        char* kbuf[4] = {0};
        char* vbuf[4] = {0};
        size_t nitems = 0;

        if (t->with_headers) {
            kbuf[nitems] = strdup("Accept"); vbuf[nitems] = strdup("application/json");
            items[nitems] = (HttpHeaderItem){kbuf[nitems], vbuf[nitems]}; nitems++;
            if (strcmp(t->title, "httpbin POST json") == 0) {
                kbuf[nitems] = strdup("Content-Type"); vbuf[nitems] = strdup("application/json");
                items[nitems] = (HttpHeaderItem){kbuf[nitems], vbuf[nitems]}; nitems++;
            } else if (strcmp(t->title, "httpbin Bearer") == 0) {
                kbuf[nitems] = strdup("Authorization"); vbuf[nitems] = strdup("Bearer TSG_TOKEN");
                items[nitems] = (HttpHeaderItem){kbuf[nitems], vbuf[nitems]}; nitems++;
            }
        }
        if (nitems > 0) { hdrs.headers = items; hdrs.count = nitems; hdrs_ptr = &hdrs; }

        HttpResponse* response = p_httpc(t->method, t->url, hdrs_ptr, t->body);
        sync_passed += process_test_result(t, response);
        if (response) p_httpc_free_global(response);

        for (size_t j = 0; j < nitems; ++j) { if (kbuf[j]) free(kbuf[j]); if (vbuf[j]) free(vbuf[j]); }
    }

    printf("\n--- Running Asynchronous Tests ---\n");
    AsyncContext** async_contexts = calloc(ntests, sizeof(AsyncContext*));
    HttpHeaders** async_hdrs_storage = calloc(ntests, sizeof(HttpHeaders*));

    for (size_t i = 0; i < ntests; ++i) {
        const Test* const t = &tests[i];
        async_contexts[i] = calloc(1, sizeof(AsyncContext));
        async_contexts[i]->test = t;

        HttpHeaders* hdrs_ptr = NULL;
        if (t->with_headers) {
            async_hdrs_storage[i] = calloc(1, sizeof(HttpHeaders));
            HttpHeaderItem* items = calloc(4, sizeof(HttpHeaderItem));
            async_hdrs_storage[i]->headers = items;
            hdrs_ptr = async_hdrs_storage[i];

            size_t nitems = 0;
            items[nitems].key = strdup("Accept"); items[nitems].value = strdup("application/json");
            nitems++;
            if (strcmp(t->title, "httpbin POST json") == 0) {
                items[nitems].key = strdup("Content-Type"); items[nitems].value = strdup("application/json");
                nitems++;
            } else if (strcmp(t->title, "httpbin Bearer") == 0) {
                items[nitems].key = strdup("Authorization"); items[nitems].value = strdup("Bearer TSG_TOKEN");
                nitems++;
            }
            async_hdrs_storage[i]->count = nitems;
        }

        printf("Dispatching async test: %s\n", t->title);
        p_httpc_async(async_test_callback, async_contexts[i], t->method, t->url, hdrs_ptr, t->body);
    }

    printf("Waiting for async tests to complete...\n");
    while (g_async_completed_count < ntests) {
        Sleep(100); // 等待全部测试完成
    }

    printf("\n--- Processing Asynchronous Test Results ---\n");
    for (size_t i = 0; i < ntests; ++i) {
        // 释放为异步 headers 分配的内存
        if (async_hdrs_storage[i]) {
            for (size_t j = 0; j < async_hdrs_storage[i]->count; ++j) {
                free(async_hdrs_storage[i]->headers[j].key);
                free(async_hdrs_storage[i]->headers[j].value);
            }
            free(async_hdrs_storage[i]->headers);
            free(async_hdrs_storage[i]);
        }
        // 这里理论上还应该释放堆上的 tests[i]->url
        // 但这些值有些是字面量，有些在堆上
        // 要正确释放还要维护状态，太麻烦了
        // 反正程序也要结束了，不处理也是安全的
    }

    free(async_hdrs_storage);
    free(async_contexts);

    const int total_tests = ntests * 2;
    const int total_passed = sync_passed + g_async_passed_count;
    const int total_failed = total_tests - total_passed;

    printf("\n--- Test Summary ---\n");
    if (total_passed > 0) printf("%s%d/%d Passed%s\n", CONSOLE_GREEN, total_passed, total_tests, CONSOLE_RESET);
    if (total_failed > 0) printf("%s%d/%d Failed%s\n", CONSOLE_RED, total_failed, total_tests, CONSOLE_RESET);

    if (total_failed == 0) {
        printf("%sOkay! All tests passed!%s\n", CONSOLE_GREEN, CONSOLE_RESET);
    } else {
        printf("\n%sOhh...Some tests failed...\n\n%s", CONSOLE_RED, CONSOLE_RESET);
        printf("Hint:\n");
        printf("  Some failures may be caused by server or network issues, not by your code.\n");
        printf("  Consider retrying or visiting the URL to check.\n");
    }

    FreeLibrary(lib);
    // 返回失败用例数以便在 CI 中判断，最大不超过 126，因为 127 以上为错误数值保留
    return (total_failed < 126) ? total_failed : 126;
}

