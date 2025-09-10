/* *********************************************************************
 *                HTTPC - HTTP(S) Client Dynamic Library
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

/*
 * 使用说明：
 * 1. 调用 httpc 方法发送 HTTP 请求
 * 2. 返回的 HttpResponse* 需要使用 httpc_free 释放内存
 *
 * 支持的 HTTP 方法：GET, DELETE, HEAD, OPTIONS, POST, PUT, PATCH
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
 * 发送 HTTP 请求
 *
 * @param method HTTP 方法字符串（如 "GET"）
 * @param url 请求的 URL 地址
 * @param headers 可选请求头数组；可为 NULL 表示无自定义请求头
 * @param body 可选请求体（UTF-8 文本）；可为 NULL 表示无请求体
 * @return 返回 HttpResponse*
 */
HttpResponse* httpc(
    const char* method,
    const char* url,
    const HttpHeaders* headers,
    const char* body
);

typedef void (*HttpCallback)(HttpResponse* resp, void* context);

/**
 * 异步发送 HTTP 请求，请求成功后会调用回调函数
 *
 * @param callback 请求完成后调用的回调函数
 * @param context 用户自定义的上下文指针，会在回调时原样返回
 * @param method HTTP 方法字符串（如 "GET"）
 * @param url 请求的 URL 地址
 * @param headers 可选请求头数组；可为 NULL 表示无自定义请求头
 * @param body 可选请求体（UTF-8 文本）；可为 NULL 表示无请求体
 */
void httpc_async(
    const HttpCallback callback,
    void* context,
    const char* method,
    const char* url,
    const HttpHeaders* headers,
    const char* body
);

/**
 * 释放由 httpc 返回的 HttpResponse*，包括其内部字段的内存。
 */
void httpc_free(HttpResponse* resp);
