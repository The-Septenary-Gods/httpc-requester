#include "../../includes/httpc.h"

// 函数指针类型（与 DLL 导出一致，C ABI）
typedef HttpResponse* (__cdecl *httpc_fn)(const char* method, const char* url, const HttpHeaders* headers, const char* body);
typedef void (__cdecl *httpc_async_fn)(const HttpCallback callback, void* context, const char* method, const char* url, const HttpHeaders* headers, const char* body);
typedef void (__cdecl *httpc_free_fn)(HttpResponse* resp);

typedef struct {
    const char* const title;
    const char* const method;
    const char* const url;
    const unsigned expected_status;
    const char* const expected_body_substr; /* nullable: if non-null, body must contain this */
    const char* const body; /* nullable: request body */
    const int with_headers; /* 0: no custom headers; 1: add headers per test */
} Test;
