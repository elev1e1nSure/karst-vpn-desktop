use std::path::PathBuf;

use serde_json::{json, Value};

use super::route_rules::{route_rules, RoutingMode};

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

pub fn build_config(outbound: Value, tun: &TunOptions, routing_mode: RoutingMode) -> Value {
    json!({
        "log": {
            "level": "info",
            "timestamp": true,
        },
        "dns": {
            "servers": [
                {
                    "type": "https",
                    "tag": "cloudflare",
                    "server": "1.1.1.1",
                    "server_port": 443,
                    "path": "/dns-query",
                    "tls": {
                        "enabled": true,
                        "server_name": "cloudflare-dns.com",
                    },
                }
            ],
            "final": "cloudflare",
            "strategy": "ipv4_only",
        },
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
            "default_domain_resolver": "cloudflare",
        },
        "experimental": {
            "cache_file": {
                "enabled": true,
                "path": tun.cache_file,
            },
        },
    })
}
