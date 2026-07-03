use std::process::Command;

use crate::error::{AppError, AppResult};

const RULE_BLOCK: &str = "Karst VPN Kill Switch";
const RULE_ALLOW: &str = "Karst VPN Kill Switch Proxy";

pub struct KillSwitch {
    enabled: bool,
}

impl KillSwitch {
    pub fn enable(proxy_host: &str, proxy_port: u16) -> AppResult<Self> {
        run_netsh(&[
            "advfirewall",
            "firewall",
            "add",
            "rule",
            &format!("name=\"{}\"", RULE_BLOCK),
            "dir=out",
            "action=block",
            "enable=yes",
        ])?;

        run_netsh(&[
            "advfirewall",
            "firewall",
            "add",
            "rule",
            &format!("name=\"{}\"", RULE_ALLOW),
            "dir=out",
            "action=allow",
            "protocol=TCP",
            &format!("remoteip={}", proxy_host),
            &format!("remoteport={}", proxy_port),
            "enable=yes",
        ])?;

        Ok(Self { enabled: true })
    }

    pub fn disable(&mut self) {
        if !self.enabled {
            return;
        }
        self.enabled = false;
        let _ = run_netsh(&[
            "advfirewall",
            "firewall",
            "delete",
            "rule",
            &format!("name=\"{}\"", RULE_BLOCK),
        ]);
        let _ = run_netsh(&[
            "advfirewall",
            "firewall",
            "delete",
            "rule",
            &format!("name=\"{}\"", RULE_ALLOW),
        ]);
    }

    pub fn recover_stale() -> AppResult<()> {
        let _ = run_netsh(&[
            "advfirewall",
            "firewall",
            "delete",
            "rule",
            &format!("name=\"{}\"", RULE_BLOCK),
        ]);
        let _ = run_netsh(&[
            "advfirewall",
            "firewall",
            "delete",
            "rule",
            &format!("name=\"{}\"", RULE_ALLOW),
        ]);
        Ok(())
    }
}

impl Drop for KillSwitch {
    fn drop(&mut self) {
        self.disable();
    }
}

fn run_netsh(args: &[&str]) -> AppResult<()> {
    let output = Command::new("netsh")
        .args(args)
        .output()
        .map_err(|error| AppError::Connection(format!("failed to run netsh: {error}")))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Connection(format!(
            "netsh failed: {}",
            stderr.trim()
        )));
    }
    Ok(())
}
