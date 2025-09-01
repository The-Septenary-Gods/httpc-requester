#include "../../includes/httpc.h"

// 函数指针类型（与 DLL 导出一致，C ABI）
typedef HttpResponse* (__cdecl *httpc_fn)(const char* method, const char* url);
typedef void (__cdecl *httpc_free_fn)(HttpResponse* resp);
