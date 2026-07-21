pub mod config;
pub mod outbound;
pub mod route_rules;

use crate::core::SidecarSpec;

pub const SPEC: SidecarSpec = SidecarSpec {
    name: "sing-box",
    run_args: &["run", "-c"],
    config_file: "sing-box-config.json",
    log_file: "sing-box.log",
    rotated_log_file: "sing-box.log.1",
    pid_file: "sing-box.pid",
    ready_marker: "sing-box started",
    executables: &["sing-box.exe", "sing-box-x86_64-pc-windows-msvc.exe"],
    expected_sha256: env!("SINGBOX_SHA256"),
};
