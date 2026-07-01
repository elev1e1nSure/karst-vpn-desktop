use serde_json::{json, Value};

pub fn default_route_rules() -> Vec<Value> {
    vec![
        json!({
            "action": "sniff",
        }),
        json!({
            "protocol": "dns",
            "action": "hijack-dns",
        }),
        json!({
            "ip_is_private": true,
            "action": "route",
            "outbound": "direct",
        }),
    ]
}
