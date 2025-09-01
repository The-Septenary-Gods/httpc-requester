/// <reference path="./@types/frida.d.ts" />

/*
 * 这里只是节选了需要用到的部分定义
 */

interface uint16 {
    readU16: NativePointer['readU16'];
    writeU16: (value: number) => uint16;
}

interface uint64_t {
    readU64: NativePointer['readU64'];
    writeU64: (value: number) => uint64_t;
}
type size_t = uint64_t; // 默认为 64 位系统

interface ReadonlyUtf8String {
    readUtf8String: NativePointer['readUtf8String'];
}

/** (size=0x8) */
interface Pointer<T> {
    readPointer(): T;
    writePointer(value: T): Pointer<T>;
}
