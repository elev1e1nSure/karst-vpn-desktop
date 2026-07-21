use tokio::sync::watch;

use crate::core::process::{ProcessExit, SidecarProcess};
use crate::error::AppResult;

/// The processes making up one live connection.
///
/// sing-box is always present; xray only when it terminates the proxy protocol. sing-box is torn
/// down first so the TUN stops capturing traffic before xray's socket disappears underneath it.
pub struct Tunnel {
    singbox: SidecarProcess,
    xray: Option<SidecarProcess>,
}

impl Tunnel {
    pub fn new(singbox: SidecarProcess, xray: Option<SidecarProcess>) -> Self {
        Self { singbox, xray }
    }

    /// One receiver per process: either exiting means the connection is gone.
    pub fn exit_receivers(&self) -> Vec<watch::Receiver<Option<ProcessExit>>> {
        let mut receivers = vec![self.singbox.exit_receiver()];
        if let Some(xray) = &self.xray {
            receivers.push(xray.exit_receiver());
        }
        receivers
    }

    pub async fn stop(&mut self) -> AppResult<()> {
        let singbox_result = self.singbox.stop().await;
        let xray_result = match &mut self.xray {
            Some(xray) => xray.stop().await,
            None => Ok(()),
        };
        singbox_result.and(xray_result)
    }

    pub fn terminate_now(&mut self) -> AppResult<()> {
        let singbox_result = self.singbox.terminate_now();
        let xray_result = match &mut self.xray {
            Some(xray) => xray.terminate_now(),
            None => Ok(()),
        };
        singbox_result.and(xray_result)
    }
}
