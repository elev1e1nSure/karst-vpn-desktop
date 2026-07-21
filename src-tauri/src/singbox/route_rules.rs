use serde_json::{json, Value};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RoutingMode {
    Full,
    BypassLocal,
    BypassRu,
    BypassRuOnly,
}

impl RoutingMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Full => "full",
            Self::BypassLocal => "bypass_local",
            Self::BypassRu => "bypass_ru",
            Self::BypassRuOnly => "bypass_ru_only",
        }
    }

    pub fn bypass_local(&self) -> bool {
        matches!(self, Self::BypassLocal | Self::BypassRu)
    }

    pub fn bypass_ru(&self) -> bool {
        matches!(self, Self::BypassRu | Self::BypassRuOnly)
    }
}

impl TryFrom<&str> for RoutingMode {
    type Error = AppError;

    fn try_from(value: &str) -> AppResult<Self> {
        match value {
            "full" => Ok(Self::Full),
            "bypass_local" => Ok(Self::BypassLocal),
            "bypass_ru" => Ok(Self::BypassRu),
            "bypass_ru_only" => Ok(Self::BypassRuOnly),
            _ => Err(AppError::InvalidInput(format!(
                "invalid routing mode: {value}"
            ))),
        }
    }
}

/// Keeps xray's own egress out of the tunnel it feeds.
///
/// sing-box binds its own outbound to the physical interface, but xray is a separate process, so
/// with `auto_route` on its packets to the VPS re-enter the TUN and loop forever. Matching by
/// process name is the primary guard; the resolved server addresses are a second, independent one
/// in case xray resolves the host to an address we didn't see.
#[derive(Debug, Clone)]
pub struct XrayBypass {
    pub process_names: Vec<String>,
    pub server_cidrs: Vec<String>,
}

impl XrayBypass {
    fn route_rules(&self) -> Vec<Value> {
        let mut rules = vec![json!({
            "process_name": self.process_names,
            "action": "route",
            "outbound": "direct",
        })];

        if !self.server_cidrs.is_empty() {
            rules.push(json!({
                "ip_cidr": self.server_cidrs,
                "action": "route",
                "outbound": "direct",
            }));
        }

        rules
    }

    pub fn dns_rule(&self) -> Value {
        json!({
            "process_name": self.process_names,
            "action": "route",
            "server": "local-dns",
        })
    }
}

pub fn route_rules(mode: RoutingMode, xray_bypass: Option<&XrayBypass>) -> Vec<Value> {
    let mut rules = Vec::new();

    // Must precede every other rule: xray's egress has to leave before anything can capture it.
    if let Some(bypass) = xray_bypass {
        rules.extend(bypass.route_rules());
    }

    rules.push(json!({
        "action": "sniff",
    }));
    rules.push(json!({
        "protocol": "dns",
        "action": "hijack-dns",
    }));

    if mode.bypass_local() {
        rules.push(local_network_rule());
        rules.push(local_domain_rule());
    }

    if mode.bypass_ru() {
        rules.push(ru_domain_rule());
    }

    rules
}

fn local_network_rule() -> Value {
    json!({
        "ip_is_private": true,
        "action": "route",
        "outbound": "direct",
    })
}

pub fn local_domain_suffixes() -> [&'static str; 5] {
    [".local", ".lan", ".localdomain", ".home.arpa", ".arpa"]
}

fn local_domain_rule() -> Value {
    json!({
        "domain": ["localhost"],
        "domain_suffix": local_domain_suffixes(),
        "action": "route",
        "outbound": "direct",
    })
}

pub fn ru_domain_suffixes() -> [&'static str; 3] {
    ["ru", "su", "xn--p1ai"]
}

fn ru_domain_rule() -> Value {
    json!({
        "domain_suffix": ru_domain_suffixes(),
        "action": "route",
        "outbound": "direct",
    })
}
