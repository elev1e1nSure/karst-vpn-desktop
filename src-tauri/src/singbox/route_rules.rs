use serde_json::{json, Value};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RoutingMode {
    Full,
    BypassLocal,
    BypassRu,
}

impl RoutingMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Full => "full",
            Self::BypassLocal => "bypass_local",
            Self::BypassRu => "bypass_ru",
        }
    }
}

impl TryFrom<&str> for RoutingMode {
    type Error = AppError;

    fn try_from(value: &str) -> AppResult<Self> {
        match value {
            "full" => Ok(Self::Full),
            "bypass_local" => Ok(Self::BypassLocal),
            "bypass_ru" => Ok(Self::BypassRu),
            _ => Err(AppError::InvalidInput(format!(
                "invalid routing mode: {value}"
            ))),
        }
    }
}

pub fn route_rules(mode: RoutingMode) -> Vec<Value> {
    let mut rules = vec![
        json!({
            "action": "sniff",
        }),
        json!({
            "protocol": "dns",
            "action": "hijack-dns",
        }),
    ];

    match mode {
        RoutingMode::Full => {}
        RoutingMode::BypassLocal => {
            rules.push(local_network_rule());
            rules.push(local_domain_rule());
        }
        RoutingMode::BypassRu => {
            rules.push(local_network_rule());
            rules.push(local_domain_rule());
            rules.push(ru_domain_rule());
        }
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
