use std::path::PathBuf;

use serde_json::{json, Value};

use super::route_rules::{
    local_domain_suffixes, route_rules, ru_domain_suffixes, RoutingMode,
};

#[derive(Debug, Clone)]
pub struct TunOptions {
    pub interface_name: String,
    pub address: Vec<String>,
    pub mtu: u16,
    pub stack: String,
    pub cache_file: PathBuf,
}

impl TunOptions {
    pub fn new(cache_file: PathBuf) -> Self {
        Self {
            interface_name: "Karst VPN".to_string(),
            // Keep the tunnel IPv4-only until the proxy path provides reliable IPv6 routing.
            address: vec!["172.19.0.1/30".to_string()],
            // A standard MTU avoids PMTU black holes across VLESS transports.
            mtu: 1500,
            stack: "gvisor".to_string(),
            cache_file,
        }
    }
}

pub fn build_config(
    outbound: Value,
    tun: &TunOptions,
    routing_mode: RoutingMode,
    dns_doh_url: &str,
) -> Value {
    json!({
        "log": {
            "level": "info",
            "timestamp": true,
        },
        "dns": dns_block(routing_mode, dns_doh_url),
        "inbounds": [
            {
                "type": "tun",
                "tag": "tun-in",
                "interface_name": tun.interface_name,
                "address": tun.address,
                "mtu": tun.mtu,
                "stack": tun.stack,
                "auto_route": true,
                "strict_route": false,
            }
        ],
        "outbounds": [
            outbound,
            {
                "type": "direct",
                "tag": "direct",
            },
            {
                "type": "block",
                "tag": "block",
            }
        ],
        "route": {
            "rules": route_rules(routing_mode),
            "rule_set": [],
            "final": "proxy",
            "auto_detect_interface": true,
            "default_domain_resolver": "remote-doh",
        },
        "experimental": {
            "cache_file": {
                "enabled": true,
                "path": tun.cache_file,
            },
        },
    })
}

fn dns_block(routing_mode: RoutingMode, dns_doh_url: &str) -> Value {
    let mut rules: Vec<Value> = Vec::new();
    if matches!(routing_mode, RoutingMode::BypassLocal | RoutingMode::BypassRu) {
        rules.push(json!({
            "domain": ["localhost"],
            "domain_suffix": local_domain_suffixes(),
            "action": "route",
            "server": "local-dns",
        }));
    }
    if routing_mode == RoutingMode::BypassRu {
        rules.push(json!({
            "domain_suffix": ru_domain_suffixes(),
            "action": "route",
            "server": "local-dns",
        }));
    }

    let mut remote_server = json!({
        "type": "https",
        "tag": "remote-doh",
    });

    if let Ok(parsed) = url::Url::parse(dns_doh_url) {
        if let Some(host) = parsed.host_str() {
            remote_server["server"] = json!(host);
        }
        if let Some(port) = parsed.port() {
            remote_server["server_port"] = json!(port);
        }
        let path = parsed.path();
        if path != "/dns-query" && !path.is_empty() {
            remote_server["path"] = json!(path);
        }
    }

    if remote_server.get("server").is_none() {
        remote_server["server"] = json!("1.1.1.1");
    }

    json!({
        "servers": [
            remote_server,
            {
                "type": "local",
                "tag": "local-dns",
            },
        ],
        "rules": rules,
        "final": "remote-doh",
        "strategy": "ipv4_only",
    })
}
