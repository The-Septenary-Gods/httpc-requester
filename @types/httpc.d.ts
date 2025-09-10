/* *********************************************************************
 *      Type Definitions of HTTPC - HTTP(S) Client Dynamic Library
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
/// <reference path="./frida.d.ts" />
/// <reference path="./dh.d.ts" />

declare namespace Httpc {
    interface HttpResponse {
        body: string | null;
        status: number;
        content_type: string | null;
        headers: Map<string, string | null>;
    }

    type CHttpResponse = Pointer<ReadonlyUtf8String> & {
        /** char* body (size=0x8) */
        add(offset: 0x00): Pointer<ReadonlyUtf8String>;
        /** uint16_t status (size=0x2) */
        add(offset: 0x08): uint16;
        /** char* content_type (size=0x8) */
        add(offset: 0x10): Pointer<ReadonlyUtf8String>;
        /** HttpHeaders* headers (size=0x8) */
        add(offset: 0x18): Pointer<CHttpHeaders>;
    }

    type CHttpHeaders = Pointer<CHttpHeaderItem> & {
        /** HttpHeaderItem* items (size=0x8) */
        add(offset: 0x00): Pointer<CHttpHeaderItem>;
        /** size_t count (size=0x8) */
        add(offset: 0x08): size_t;
    }

    type CHttpHeaderItem = TArrayAllocator<Pointer<ReadonlyUtf8String>> & {
        /** char* key (size=0x8) */
        add(offset: 0x00): Pointer<ReadonlyUtf8String>;
        /** char* value (size=0x8) */
        add(offset: 0x08): Pointer<ReadonlyUtf8String>;
    }

    function func_request(
        method: Utf8String,
        url: Utf8String,
        headers: CHttpHeaders | NULL,
        body: Utf8String | NULL,
    ): CHttpResponse;

    function func_requestAsync(
        callback: NativeCallback<'void', ['pointer', 'pointer']>,
        context: NativePointer,
        method: Utf8String,
        url: Utf8String,
        headers: CHttpHeaders | NULL,
        body: Utf8String | NULL,
    ): void;

    function func_freeResponse(resp: CHttpResponse): void;
}
