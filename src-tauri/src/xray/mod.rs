pub mod config;
pub mod outbound;

use crate::core::SidecarSpec;

pub const SPEC: SidecarSpec = SidecarSpec {
    name: "xray",
    run_args: &["run", "-c"],
    config_file: "xray-config.json",
    log_file: "xray.log",
    rotated_log_file: "xray.log.1",
    pid_file: "xray.pid",
    // core/xray.go logs this at Warning severity only after Start() succeeds; the version banner
    // printed before startup does not contain the word, so this cannot fire early.
    ready_marker: "started",
    executables: &["xray.exe", "xray-x86_64-pc-windows-msvc.exe"],
    expected_sha256: env!("XRAY_SHA256"),
};
