use serde_json::{json, Map, Value};

use crate::vless::model::{Security, Transport, VlessLink};

pub fn vless_to_outbound(link: &VlessLink) -> Value {
    let mut outbound = Map::new();
    outbound.insert("type".to_string(), json!("vless"));
    outbound.insert("tag".to_string(), json!("proxy"));
    outbound.insert("server".to_string(), json!(link.host));
    outbound.insert("server_port".to_string(), json!(link.port));
    outbound.insert("uuid".to_string(), json!(link.id));
    outbound.insert("packet_encoding".to_string(), json!("xudp"));

    if let Some(flow) = &link.flow {
        outbound.insert("flow".to_string(), json!(flow.label()));
    }

    if let Some(tls) = tls_config(&link.security) {
        outbound.insert("tls".to_string(), tls);
    }

    if let Some(transport) = transport_config(&link.transport) {
        outbound.insert("transport".to_string(), transport);
    }

    Value::Object(outbound)
}

fn tls_config(security: &Security) -> Option<Value> {
    match security {
        Security::None => None,
        Security::Tls {
            server_name,
            fingerprint,
            alpn,
            allow_insecure,
        } => {
            let mut tls = Map::new();
            tls.insert("enabled".to_string(), json!(true));
            insert_optional(&mut tls, "server_name", server_name);
            tls.insert("insecure".to_string(), json!(allow_insecure));
            if !alpn.is_empty() {
                tls.insert("alpn".to_string(), json!(alpn));
            }
            if let Some(fingerprint) = fingerprint {
                tls.insert(
                    "utls".to_string(),
                    json!({
                        "enabled": true,
                        "fingerprint": fingerprint,
                    }),
                );
            }
            Some(Value::Object(tls))
        }
        Security::Reality {
            server_name,
            public_key,
            short_id,
            fingerprint,
            ..
        } => {
            let mut tls = Map::new();
            tls.insert("enabled".to_string(), json!(true));
            insert_optional(&mut tls, "server_name", server_name);
            let fingerprint = fingerprint.as_deref().unwrap_or("chrome");
            // sing-box requires uTLS for REALITY clients; chrome matches Xray's common default.
            tls.insert(
                "utls".to_string(),
                json!({
                    "enabled": true,
                    "fingerprint": fingerprint,
                }),
            );
            tls.insert(
                "reality".to_string(),
                json!({
                    "enabled": true,
                    "public_key": public_key,
                    "short_id": short_id.as_deref().unwrap_or(""),
                }),
            );
            Some(Value::Object(tls))
        }
    }
}

fn transport_config(transport: &Transport) -> Option<Value> {
    match transport {
        Transport::Tcp => None,
        Transport::Ws { host, path } => {
            let mut transport = Map::new();
            transport.insert("type".to_string(), json!("ws"));
            insert_optional(&mut transport, "path", path);
            if let Some(host) = host {
                transport.insert("headers".to_string(), json!({ "Host": host }));
            }
            Some(Value::Object(transport))
        }
        Transport::Grpc { service_name } => {
            let mut transport = Map::new();
            transport.insert("type".to_string(), json!("grpc"));
            insert_optional(&mut transport, "service_name", service_name);
            Some(Value::Object(transport))
        }
        Transport::Http { host, path } => {
            let mut transport = Map::new();
            transport.insert("type".to_string(), json!("http"));
            if let Some(host) = host {
                transport.insert("host".to_string(), json!([host]));
            }
            insert_optional(&mut transport, "path", path);
            Some(Value::Object(transport))
        }
        Transport::HttpUpgrade { host, path } => {
            let mut transport = Map::new();
            transport.insert("type".to_string(), json!("httpupgrade"));
            insert_optional(&mut transport, "host", host);
            insert_optional(&mut transport, "path", path);
            Some(Value::Object(transport))
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
