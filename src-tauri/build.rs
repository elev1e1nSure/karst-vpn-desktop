use sha2::Digest;
use std::io::Read;

fn main() {
    let binaries_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries");

    compute_sidecar_hash(&binaries_dir, "sing-box", "SINGBOX_SHA256");
    compute_sidecar_hash(&binaries_dir, "xray", "XRAY_SHA256");

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

fn compute_sidecar_hash(binaries_dir: &std::path::Path, prefix: &str, env_var: &str) {
    let path = std::fs::read_dir(binaries_dir)
        .expect("cannot read binaries directory")
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .find(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with(prefix) && name.ends_with(".exe"))
        })
        .unwrap_or_else(|| panic!("{prefix}.exe not found in binaries/"));

    let mut file = std::fs::File::open(&path)
        .unwrap_or_else(|_| panic!("{prefix}.exe not found in binaries/"));
    let mut hasher = sha2::Sha256::new();
    let mut buffer = [0u8; 8192];
    loop {
        let count = file
            .read(&mut buffer)
            .unwrap_or_else(|_| panic!("failed to read {prefix}.exe"));
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    let hash = hex::encode(hasher.finalize());
    println!("cargo:rustc-env={env_var}={hash}");
}
