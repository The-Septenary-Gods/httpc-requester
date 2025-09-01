#![allow(clippy::missing_safety_doc)]

use std::sync::OnceLock;
use std::ffi::{CStr, CString};
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

/// C ABI: httpc(method, url) -> HttpResponse*. Caller must call httpc_free to free.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn httpc(method: *const c_char, url: *const c_char) -> *mut HttpResponse {
    // 参数校验
    if method.is_null() || url.is_null() {
        return make_error_response("null pointer argument");
    }

    let method = unsafe {
        match CStr::from_ptr(method).to_str() {
            Ok(s) => s,
            Err(_) => return make_error_response("invalid utf-8 in method"),
        }
    };
    let url = unsafe {
        match CStr::from_ptr(url).to_str() {
            Ok(s) => s,
            Err(_) => return make_error_response("invalid utf-8 in url"),
        }
    };

    let agent = get_agent();
    // 构造请求
    // 已知问题：现在这里没有处理 body 和 headers，所以带 body 的方法暂不可用
    let req = match method.to_uppercase().as_str() {
        "GET" => agent.get(url),
        // "POST" => agent.post(url),
        // "PUT" => agent.put(url),
        "DELETE" => agent.delete(url),
        // "PATCH" => agent.patch(url),
        "HEAD" => agent.head(url),
        "OPTIONS" => agent.options(url),
        _ => return make_error_response("unsupported HTTP method"),
    };

    let mut resp = match req.call() {
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

    // 读取 body 为 String
    // 已知问题：这里假定 binary 是 UTF-8，其他编码或二进制流会出现问题
    let body_str = match resp.body_mut().read_to_string() {
        Ok(s) => s,
        Err(e) => return make_error_response(&format!("read body error: {e}")),
    };
    let body_cstr = CString::new(body_str).unwrap_or_else(|_| CString::new("").unwrap());

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

/// 释放由 httpc 返回的 HttpResponse 结构体
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
