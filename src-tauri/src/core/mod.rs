pub mod process;
mod process_guard;

/// Every core the app can spawn. Startup recovery and the log viewer iterate this, so registering
/// a new core here is enough for both to pick it up.
pub const SPECS: &[&SidecarSpec] = &[&crate::singbox::SPEC, &crate::xray::SPEC];

/// Which core terminates the proxy protocol. sing-box runs either way — it owns TUN, routing and
/// DNS — so this only decides whether it dials the server itself or hands off to xray over a
/// loopback SOCKS5 hop.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CoreMode {
    Auto,
    SingBox,
    Xray,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransportCore {
    SingBox,
    Xray,
}

impl CoreMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::SingBox => "singbox",
            Self::Xray => "xray",
        }
    }

    /// Transport/core mismatches are not rejected here: each outbound builder already knows what it
    /// can express and reports it with a message naming the core to switch to.
    pub fn resolve(&self, transport: &crate::vless::model::Transport) -> TransportCore {
        match self {
            Self::SingBox => TransportCore::SingBox,
            Self::Xray => TransportCore::Xray,
            Self::Auto => match transport {
                crate::vless::model::Transport::Xhttp { .. } => TransportCore::Xray,
                _ => TransportCore::SingBox,
            },
        }
    }
}

impl TryFrom<&str> for CoreMode {
    type Error = crate::error::AppError;

    fn try_from(value: &str) -> crate::error::AppResult<Self> {
        match value {
            "auto" => Ok(Self::Auto),
            "singbox" => Ok(Self::SingBox),
            "xray" => Ok(Self::Xray),
            _ => Err(crate::error::AppError::InvalidInput(format!(
                "invalid core mode: {value}"
            ))),
        }
    }
}

impl TransportCore {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::SingBox => "sing-box",
            Self::Xray => "xray",
        }
    }
}

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
