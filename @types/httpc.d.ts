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

    type CHttpHeaderItem = Pointer<ReadonlyUtf8String> & {
        /** char* key (size=0x8) */
        add(offset: 0x00): Pointer<ReadonlyUtf8String>;
        /** char* value (size=0x8) */
        add(offset: 0x08): Pointer<ReadonlyUtf8String>;
    }

    declare function func_request(
        method: Utf8String,
        url: Utf8String,
        headers: CHttpHeaders,
        body: Utf8String
    ): CHttpResponse;

    declare function func_freeResponse(resp: Pointer<CHttpResponse>): void;
}
