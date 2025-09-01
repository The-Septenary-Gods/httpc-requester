/**
 * HTTP客户端 C 接口
 *
 * 使用说明：
 * 1. 调用 httpc 方法发送 HTTP 请求
 * 2. 返回的 HttpResponse* 需要使用 httpc_free 释放内存（包含内部字段）
 *
 * 支持的HTTP方法：GET, DELETE, HEAD, OPTIONS
 */

#include <stdint.h>
#include <stddef.h>

typedef struct {
    char* key;               // offset: 0x0
    char* value;             // offset: 0x8
} HttpHeaderItem;

typedef struct {
    HttpHeaderItem* headers; // offset: 0x0
    size_t count;            // offset: 0x8
} HttpHeaders;

typedef struct {
    char* body;              // offset: 0x0
    uint16_t status;         // offset: 0x8
    // 6 bytes padding
    char* content_type;      // offset: 0x10
    HttpHeaders* headers;    // offset: 0x18
} HttpResponse;

/**
 * 发送HTTP请求
 *
 * @param method HTTP 方法字符串（如 "GET"）
 * @param url 请求的 URL 地址
 * @return 返回指向 HttpResponse 的指针（需要调用 httpc_free 释放）
 */
HttpResponse* httpc(const char* method, const char* url);

/**
 * 释放由 httpc 返回的 HttpResponse 以及其内部字段。
 */
void httpc_free(HttpResponse* resp);
