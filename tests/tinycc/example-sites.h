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
