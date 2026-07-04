use std::io::Read;

fn main() {
    let binaries_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries");
    let singbox_path = std::fs::read_dir(&binaries_dir)
        .expect("cannot read binaries directory")
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .find(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("sing-box") && name.ends_with(".exe"))
        })
        .expect("sing-box.exe not found in binaries/");

    let mut file = std::fs::File::open(&singbox_path).expect("sing-box.exe not found in binaries/");
    let mut hasher = <sha2::Sha256 as sha2::Digest>::new();
    let mut buffer = [0u8; 8192];
    loop {
        let count = file.read(&mut buffer).expect("failed to read sing-box.exe");
        if count == 0 {
            break;
        }
        <sha2::Sha256 as sha2::Digest>::update(&mut hasher, &buffer[..count]);
    }
    let hash = hex::encode(<sha2::Sha256 as sha2::Digest>::finalize(hasher));
    println!("cargo:rustc-env=SINGBOX_SHA256={hash}");

    let mut windows = tauri_build::WindowsAttributes::new();
    windows = windows.app_manifest(
        r#"
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <dependency>
    <dependentAssembly>
      <assemblyIdentity
        type="win32"
        name="Microsoft.Windows.Common-Controls"
        version="6.0.0.0"
        processorArchitecture="*"
        publicKeyToken="6595b64144ccf1df"
        language="*"
      />
    </dependentAssembly>
  </dependency>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security>
      <requestedPrivileges>
        <requestedExecutionLevel level="requireAdministrator" uiAccess="false" />
      </requestedPrivileges>
    </security>
  </trustInfo>
</assembly>
"#,
    );

    let attributes = tauri_build::Attributes::new().windows_attributes(windows);
    tauri_build::try_build(attributes).expect("failed to run Tauri build script");
}
