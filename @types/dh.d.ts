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

/* 这里只是节选了需要用到的部分定义 */

type NULL = typeof NULL;

interface NativePointerRestrictedBase {
    isNull: NativePointer['isNull'];
}

interface uint16 extends NativePointerRestrictedBase {
    readU16: NativePointer['readU16'];
    writeU16: (value: number) => uint16;
}

interface uint64_t extends NativePointerRestrictedBase {
    readU64: NativePointer['readU64'];
    writeU64: (value: number) => uint64_t;
}
type size_t = uint64_t; // 默认为 64 位系统

interface ReadonlyUtf8String extends NativePointerRestrictedBase {
    readUtf8String: NativePointer['readUtf8String'];
}

interface Utf8String extends ReadonlyUtf8String {
    writeUtf8String: (value: string) => Utf8String;
}

/** (size=0x8) */
interface Pointer<T> extends NativePointerRestrictedBase {
    readPointer(): T;
    writePointer(value: T): Pointer<T>;
}

type TArrayAllocator<T> = NativePointerRestrictedBase & T & {
    /** 输入偏移量时，请注意检查必须是 `sizeof(T)` 的整数倍 */
    add(offset: number): T;
};
