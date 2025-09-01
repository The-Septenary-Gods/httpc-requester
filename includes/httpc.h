/**
 * HTTP客户端 C 接口
 * 
 * 使用说明：
 * 1. 调用 httpc 方法发送 HTTP 请求
 * 2. 返回的 JSON 字符串需要使用 httpc_free 释放内存
 * 
 * 支持的HTTP方法：GET, DELETE, HEAD, OPTIONS
 */

#include <stdint.h>

typedef struct {
    char* key;
    char* value;
} HttpHeaderItem;

typedef struct {
    HttpHeaderItem* headers;
    size_t count;
} HttpHeaders;

typedef struct {
    char* body;
    uint16_t status;
    char* content_type;
    HttpHeaders* headers;
} HttpResponse;

/**
 * 发送HTTP请求
 * 
 * @param method HTTP 方法字符串（如 "GET"）
 * @param url 请求的 URL 地址
 * @return 返回 JSON 格式的响应字符串，包含以下字段：
 *         - status: HTTP 状态码
 *         - content_type: 响应内容类型
 *         - body: 响应体内容
 *         - error: 错误信息（如果发生错误）
 *         调用者必须使用 httpc_free 释放返回的字符串
 */
HttpResponse httpc(char* method, char* url);

/**
 * 释放由 httpc 返回的对象
 * 
 * @param ptr 由 httpc 函数返回的字符串指针
 */
void httpc_free(char* HttpResponse);
