#[cfg(target_os = "windows")]
fn main() {
    // 添加编译资源文件，添加版本号等信息
    let _ = embed_resource::compile("assets/resources.rc", embed_resource::NONE);
}

#[cfg(not(target_os = "windows"))]
fn main() { }
