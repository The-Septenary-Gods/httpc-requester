#include "../../includes/httpc.h"

// 函数指针类型（与 DLL 导出一致，C ABI）
typedef HttpResponse* (__cdecl *httpc_fn)(const char* method, const char* url, const HttpHeaders* headers, const char* body);
typedef void (__cdecl *httpc_free_fn)(HttpResponse* resp);

typedef struct {
    const char* title;
    const char* method;
    const char* url;
    unsigned expected_status;
    const char* expected_body_substr; /* nullable: if non-null, body must contain this */
    const char* body; /* nullable: request body */
    int with_headers; /* 0: no custom headers; 1: add headers per test */
} Test;
