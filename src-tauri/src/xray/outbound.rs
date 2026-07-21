use serde_json::{json, Map, Value};

use crate::error::{AppError, AppResult};
use crate::vless::model::{Security, Transport, VlessLink};

pub fn vless_to_outbound(link: &VlessLink) -> AppResult<Value> {
    let mut user = Map::new();
    user.insert("id".to_string(), json!(link.id));
    user.insert("encryption".to_string(), json!("none"));
    if let Some(flow) = &link.flow {
        user.insert("flow".to_string(), json!(flow.label()));
    }

    let mut stream = Map::new();
    stream.insert(
        "network".to_string(),
        json!(transport_network(&link.transport)?),
    );
    stream.insert("security".to_string(), json!(link.security.label()));
    if let Some((key, value)) = security_settings(&link.security) {
        stream.insert(key.to_string(), value);
    }
    if let Some((key, value)) = transport_settings(&link.transport) {
        stream.insert(key.to_string(), value);
    }

    Ok(json!({
        "protocol": "vless",
        "tag": "proxy",
        "settings": {
            "vnext": [{
                "address": link.host,
                "port": link.port,
                "users": [Value::Object(user)],
            }],
        },
        "streamSettings": Value::Object(stream),
    }))
}

/// v26.3.27 still spells this key `network`; `method` only exists in later prerelease builds.
fn transport_network(transport: &Transport) -> AppResult<&'static str> {
    let network = match transport {
        Transport::Tcp => "tcp",
        Transport::Ws { .. } => "ws",
        Transport::Grpc { .. } => "grpc",
        Transport::HttpUpgrade { .. } => "httpupgrade",
        Transport::Xhttp { .. } => "xhttp",
        // Xray removed the HTTP/2 transport; it errors out at config load instead of falling back.
        Transport::Http { .. } => {
            return Err(AppError::Core(
                "xray removed the http/h2 transport; this server requires the sing-box core"
                    .to_string(),
            ))
        }
    };

    Ok(network)
}

fn security_settings(security: &Security) -> Option<(&'static str, Value)> {
    match security {
        Security::None => None,
        Security::Tls {
            server_name,
            fingerprint,
            alpn,
            allow_insecure,
        } => {
            let mut tls = Map::new();
            insert_optional(&mut tls, "serverName", server_name);
            insert_optional(&mut tls, "fingerprint", fingerprint);
            if !alpn.is_empty() {
                tls.insert("alpn".to_string(), json!(alpn));
            }
            tls.insert("allowInsecure".to_string(), json!(allow_insecure));
            Some(("tlsSettings", Value::Object(tls)))
        }
        Security::Reality {
            server_name,
            public_key,
            short_id,
            fingerprint,
            spider_x,
        } => {
            let mut reality = Map::new();
            insert_optional(&mut reality, "serverName", server_name);
            reality.insert(
                "fingerprint".to_string(),
                json!(fingerprint.as_deref().unwrap_or("chrome")),
            );
            reality.insert("publicKey".to_string(), json!(public_key));
            insert_optional(&mut reality, "shortId", short_id);
            insert_optional(&mut reality, "spiderX", spider_x);
            Some(("realitySettings", Value::Object(reality)))
        }
    }
}

fn transport_settings(transport: &Transport) -> Option<(&'static str, Value)> {
    match transport {
        Transport::Tcp | Transport::Http { .. } => None,
        Transport::Ws { host, path } => {
            let mut ws = Map::new();
            insert_optional(&mut ws, "path", path);
            insert_optional(&mut ws, "host", host);
            Some(("wsSettings", Value::Object(ws)))
        }
        Transport::Grpc { service_name } => {
            let mut grpc = Map::new();
            insert_optional(&mut grpc, "serviceName", service_name);
            Some(("grpcSettings", Value::Object(grpc)))
        }
        Transport::HttpUpgrade { host, path } => {
            let mut upgrade = Map::new();
            insert_optional(&mut upgrade, "path", path);
            insert_optional(&mut upgrade, "host", host);
            Some(("httpupgradeSettings", Value::Object(upgrade)))
        }
        Transport::Xhttp {
            host,
            path,
            mode,
            extra,
        } => {
            let mut xhttp = Map::new();
            insert_optional(&mut xhttp, "host", host);
            insert_optional(&mut xhttp, "path", path);
            insert_optional(&mut xhttp, "mode", mode);
            // Xray replaces the whole xhttpSettings with `extra`, preserving only host/path/mode
            // from the outer level, so nothing else is worth setting alongside it. The parser
            // already rejected links whose `extra` is not valid JSON, so this cannot silently drop.
            if let Some(extra) = extra {
                if let Ok(value) = serde_json::from_str::<Value>(extra) {
                    xhttp.insert("extra".to_string(), value);
                }
            }
            Some(("xhttpSettings", Value::Object(xhttp)))
        }
    }
}

fn insert_optional(map: &mut Map<String, Value>, key: &str, value: &Option<String>) {
    if let Some(value) = value {
        if !value.is_empty() {
            map.insert(key.to_string(), json!(value));
        }
    }
}
