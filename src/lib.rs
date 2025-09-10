#![allow(clippy::missing_safety_doc)]

use std::sync::OnceLock;
use std::ffi::{c_void, CStr, CString};
use std::os::raw::c_char;
use std::ptr;
use std::time::Duration;

static AGENT: OnceLock<ureq::Agent> = OnceLock::new();

// 定义与C头文件对应的结构体
#[repr(C)]
pub struct HttpHeaderItem {
    pub key: *mut c_char,
    pub value: *mut c_char,
}

#[repr(C)]
pub struct HttpHeaders {
    pub headers: *mut HttpHeaderItem,
    pub count: usize,
}

#[repr(C)]
pub struct HttpResponse {
    pub body: *mut c_char,
    pub status: u16,
    pub content_type: *mut c_char,
    pub headers: *mut HttpHeaders,
}


/// 工具函数：获取全局的 ureq::Agent 实例，并进行配置
fn get_agent() -> &'static ureq::Agent {
    AGENT.get_or_init(|| {
        // 全局配置：不把 4xx/5xx 当作 Error（这样可以拿到响应 body），设置全局 timeout
        let config = ureq::Agent::config_builder()
            .http_status_as_error(false)
            .timeout_global(Some(Duration::from_secs(30)))
            .user_agent("TSG-httpc/0.1")
            .build();
        ureq::Agent::new_with_config(config)
    })
}

/// 工具函数：构建错误响应
fn make_error_response(msg: &str) -> *mut HttpResponse {
    let error_msg = CString::new(msg).unwrap_or_else(|_| CString::new("unknown error").unwrap());

    let resp = Box::new(HttpResponse {
        body: error_msg.into_raw(),
        status: u16::MAX,
        content_type: ptr::null_mut(),
        headers: ptr::null_mut(),
    });

    Box::into_raw(resp)
}

type RustRequestParams = (String, String, Vec<(String, String)>, Option<String>);

/// 将 C ABI 参数转换为 Rust 原生类型，取得所有权以避免 use-after-free
fn c_to_rust_request_params(
    method_ptr: *const c_char,
    url_ptr: *const c_char,
    headers_ptr: *const HttpHeaders,
    body_ptr: *const c_char,
) -> Result<RustRequestParams, *mut HttpResponse> {
    if method_ptr.is_null() || url_ptr.is_null() {
        return Err(make_error_response("null pointer argument"));
    }

    // 拷贝 CString，取得所有权
    let method = unsafe { CStr::from_ptr(method_ptr).to_string_lossy().into_owned() };
    let url = unsafe { CStr::from_ptr(url_ptr).to_string_lossy().into_owned() };
    let body = if !body_ptr.is_null() {
        Some(unsafe { CStr::from_ptr(body_ptr).to_string_lossy().into_owned() })
    } else {
        None
    };

    // 构建 headers Vec，取得所有权
    let mut headers_vec: Vec<(String, String)> = Vec::new();
    if !headers_ptr.is_null() {
        let hdrs = unsafe { &*headers_ptr };
        if !hdrs.headers.is_null() && hdrs.count > 0 {
            let items = unsafe { std::slice::from_raw_parts(hdrs.headers, hdrs.count) };
            for item in items.iter() {
                if item.key.is_null() || item.value.is_null() { continue; }
                let key = unsafe { CStr::from_ptr(item.key).to_string_lossy().into_owned() };
                let val = unsafe { CStr::from_ptr(item.value).to_string_lossy().into_owned() };
                headers_vec.push((key, val));
            }
        }
    }
    Ok((method, url, headers_vec, body))
}

/// 处理 HTTP 请求的核心逻辑，使用 Rust 原生类型
fn httpc_internal(
    method: &str,
    url: &str,
    headers: &[(&str, &str)],
    body: Option<&str>,
) -> *mut HttpResponse {
    let agent = get_agent();
    // 标准化方法字符串：去除首尾空白，并使用不区分大小写比较
    let method_norm = method.trim();

    // 工具函数：将 Rust 传入的 headers 应用到请求上
    fn apply_headers<'a, B>(mut rb: ureq::RequestBuilder<B>, headers: &'a [(&'a str, &'a str)]) -> ureq::RequestBuilder<B> {
        for &(key, val) in headers.iter() {
            rb = rb.header(key, val);
        }
        rb
    }

    let resp = match () {
        // 无请求体的方法
        _ if method_norm.eq_ignore_ascii_case("GET") => {
            let rb = apply_headers(agent.get(url), headers);
            rb.call()
        }
        _ if method_norm.eq_ignore_ascii_case("DELETE") => {
            let rb = apply_headers(agent.delete(url), headers);
            rb.call()
        }
        _ if method_norm.eq_ignore_ascii_case("HEAD") => {
            let rb = apply_headers(agent.head(url), headers);
            rb.call()
        }
        _ if method_norm.eq_ignore_ascii_case("OPTIONS") => {
            let rb = apply_headers(agent.options(url), headers);
            rb.call()
        }
        // 需要请求体的方法
        _ if method_norm.eq_ignore_ascii_case("POST") => {
            let body_str = if let Some(b) = body { b } else { return make_error_response("POST requires body"); };
            let rb = apply_headers(agent.post(url), headers);
            rb.send(body_str)
        }
        _ if method_norm.eq_ignore_ascii_case("PUT") => {
            let body_str = if let Some(b) = body { b } else { return make_error_response("PUT requires body"); };
            let rb = apply_headers(agent.put(url), headers);
            rb.send(body_str)
        }
        _ if method_norm.eq_ignore_ascii_case("PATCH") => {
            let body_str = if let Some(b) = body { b } else { return make_error_response("PATCH requires body"); };
            let rb = apply_headers(agent.patch(url), headers);
            rb.send(body_str)
        }
        _ => return make_error_response("unsupported HTTP method"),
    };

    let mut resp = match resp {
        Ok(r) => r,
        Err(e) => return make_error_response(&format!("request error: {e}")),
    };

    let status_code = resp.status().as_u16();

    // 处理 Content-Type
    let content_type_cstr = resp.headers()
        .get("Content-Type")
        .and_then(|hv| hv.to_str().ok())
        .map(|s| CString::new(s).unwrap_or_else(|_| CString::new("").unwrap()))
        .unwrap_or_else(|| CString::new("").unwrap());

    // 处理 headers
    let headers_vec: Vec<HttpHeaderItem> = resp.headers()
        .iter()
        .filter_map(|(name, value)| {
            let name_str = name.as_str();
            let value_str = value.to_str().ok()?;

            let key_cstr = CString::new(name_str).ok()?;
            let value_cstr = CString::new(value_str).ok()?;

            Some(HttpHeaderItem {
                key: key_cstr.into_raw(),
                value: value_cstr.into_raw(),
            })
        })
        .collect();

    // 读取 body 为 String
    // 已知问题：这里假定 binary 是 UTF-8，其他编码或二进制流会出现问题
    let body_str = match resp.body_mut().read_to_string() {
        Ok(s) => s,
        Err(e) => return make_error_response(&format!("read body error: {e}")),
    };
    let body_cstr = CString::new(body_str).unwrap_or_else(|_| CString::new("").unwrap());

    let headers_count = headers_vec.len();
    let headers_ptr = if headers_count > 0 {
        Box::into_raw(headers_vec.into_boxed_slice()) as *mut HttpHeaderItem
    } else {
        ptr::null_mut()
    };

    let http_headers = Box::new(HttpHeaders {
        headers: headers_ptr,
        count: headers_count,
    });

    // 创建 HttpResponse
    let response = Box::new(HttpResponse {
        body: body_cstr.into_raw(),
        status: status_code,
        content_type: content_type_cstr.into_raw(),
        headers: Box::into_raw(http_headers),
    });

    Box::into_raw(response)
}

/// 进行 HTTP 请求
///
/// C ABI:
/// ``` C
/// HttpResponse* httpc(
///     const char* method,
///     const char* url,
///     const HttpHeaders* headers,
///     const char* body
/// );
/// ```
///
/// 调用者必须调用 httpc_free 释放返回的指针。
#[unsafe(no_mangle)]
pub extern "C" fn httpc(
    method: *const c_char,
    url: *const c_char,
    headers: *const HttpHeaders,
    body: *const c_char,
) -> *mut HttpResponse {
    let (
        method_s,
        url_s,
        headers_vec_str,
        body_s,
    ) = match c_to_rust_request_params(method, url, headers, body) {
        Ok(params) => params,
        Err(resp) => return resp,
    };

    // 将 Vec<(String, String)> 转换为 Vec<(&str, &str)>
    let headers_slice: Vec<(&str, &str)> = headers_vec_str
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();

    httpc_internal(
        &method_s,
        &url_s,
        &headers_slice,
        body_s.as_deref(),
    )
}

/// HTTP 回调函数类型
///
/// C ABI: `void (*HttpCallback)(HttpResponse* resp, void* context);
///
/// 调用者必须调用 httpc_free 释放返回的指针。
type HttpCallback = extern "C" fn(*mut HttpResponse, *mut c_void);

/// 异步进行 HTTP 请求
///
/// C ABI:
/// ``` C
/// void httpc_async(
///     const HttpCallback callback,
///     void* context,
///     const char* method,
///     const char* url,
///     const HttpHeaders* headers,
///     const char* body
/// );
/// ```
///
/// 此函数会复制所有传入的指针数据，因此调用者可以在调用此函数后立即安全地释放
/// method, url, headers, 和 body 指向的内存。
/// 函数内部会在线程中处理这些数据的副本，并在处理完成后调用回调。
///
/// 调用者必须调用 httpc_free 释放回调函数中返回的 HttpResponse 指针。
#[unsafe(no_mangle)]
pub extern "C" fn httpc_async(
    callback: HttpCallback,
    context: *mut c_void,
    method: *const c_char,
    url: *const c_char,
    headers: *const HttpHeaders,
    body: *const c_char,
) {
    let context_usize = context as usize;

    let (
        method_s,
        url_s,
        headers_vec_str,
        body_s,
    ) = match c_to_rust_request_params(method, url, headers, body) {
        Ok(params) => params,
        Err(resp) => {
            callback(resp, context);
            return;
        }
    };

    std::thread::spawn(move || {
        // 将 Vec<(String, String)> 转换为 Vec<(&str, &str)>
        let headers_slice: Vec<(&str, &str)> = headers_vec_str
            .iter()
            .map(|(k, v)| (k.as_str(), v.as_str()))
            .collect();

        let resp = httpc_internal(
            &method_s,
            &url_s,
            &headers_slice,
            body_s.as_deref(),
        );

        // 将 usize 转换回 void*
        let context = context_usize as *mut c_void;
        callback(resp, context);
    });
}

/// 释放由 httpc 返回的 HttpResponse 结构体
///
/// C ABI: void httpc_free(HttpResponse* resp)
#[unsafe(no_mangle)]
pub unsafe extern "C" fn httpc_free(ptr: *mut HttpResponse) {
    if ptr.is_null() { return; }

    unsafe {
        let response = Box::from_raw(ptr);

        // 释放 body
        if !response.body.is_null() {
            let _ = CString::from_raw(response.body);
        }

        // 释放 content_type
        if !response.content_type.is_null() {
            let _ = CString::from_raw(response.content_type);
        }

        // 释放 headers
        if !response.headers.is_null() {
            let headers = Box::from_raw(response.headers);

            // 释放每个 header item
            if !headers.headers.is_null() && headers.count > 0 {
                let header_slice = std::slice::from_raw_parts_mut(headers.headers, headers.count);
                for item in header_slice {
                    if !item.key.is_null() {
                        let _ = CString::from_raw(item.key);
                    }
                    if !item.value.is_null() {
                        let _ = CString::from_raw(item.value);
                    }
                }
                // 释放 headers 数组
                let slice_ptr = std::ptr::slice_from_raw_parts_mut(headers.headers, headers.count);
                let _ = Box::from_raw(slice_ptr);
            }
        }
    }
}
