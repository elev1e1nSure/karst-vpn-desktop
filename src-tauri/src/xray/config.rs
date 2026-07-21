use serde_json::{json, Value};

/// Builds the xray side of the chain: a loopback SOCKS5 inbound that sing-box dials, and the
/// VLESS outbound that actually speaks the wire protocol. Routing, DNS and TUN stay in sing-box,
/// so xray needs no routing rules and therefore no geoip/geosite data files.
pub fn build_config(outbound: Value, socks_port: u16) -> Value {
    json!({
        "log": {
            // The readiness marker in xray::SPEC is logged at warning severity.
            "loglevel": "warning",
        },
        "inbounds": [
            {
                "tag": "socks-in",
                "protocol": "socks",
                "listen": "127.0.0.1",
                "port": socks_port,
                "settings": {
                    "auth": "noauth",
                    "udp": true,
                    // Local address xray hands out for UDP associations; loopback-only chain.
                    "ip": "127.0.0.1",
                },
            }
        ],
        "outbounds": [
            outbound,
            {
                "protocol": "freedom",
                "tag": "direct",
            }
        ],
    })
}
