pub mod process;
mod process_guard;

/// Every core the app can spawn. Startup recovery and the log viewer iterate this, so registering
/// a new core here is enough for both to pick it up.
pub const SPECS: &[&SidecarSpec] = &[&crate::singbox::SPEC, &crate::xray::SPEC];

/// Everything that differs between the sidecar cores the app can drive.
///
/// Each core owns its own config, log and PID files so both can run side by side without
/// clobbering each other's state.
#[derive(Debug, Clone, Copy)]
pub struct SidecarSpec {
    /// Tauri sidecar base name; doubles as the human-facing name in log lines and errors.
    pub name: &'static str,
    pub run_args: &'static [&'static str],
    pub config_file: &'static str,
    pub log_file: &'static str,
    pub rotated_log_file: &'static str,
    pub pid_file: &'static str,
    /// Line the core prints once it is serving traffic.
    pub ready_marker: &'static str,
    /// Lowercase filenames accepted when reclaiming a stale PID, so an unrelated process is
    /// never killed.
    pub executables: &'static [&'static str],
    pub expected_sha256: &'static str,
}
