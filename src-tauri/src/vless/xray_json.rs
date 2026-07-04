// Some subscription panels (e.g. Liberty VPN / 3X-UI in "Xray JSON" mode) don't serve the
// classic base64-encoded `vless://` link list — they always return a full Xray/v2ray client
// config: a JSON array of profiles, each with an `outbounds` list. This module detects that
// shape and synthesizes `vless://` URIs from it so the existing parser/import pipeline (which
// expects URI text) can handle it unchanged.

use serde_json::Value;
use url::Url;

/// Returns `None` if `body` doesn't look like JSON at all, so callers fall back to the
/// classic line-based parser untouched. Returns `Some(uris)` (possibly empty) once JSON framing
/// is detected — an empty result means the JSON contained no usable vless outbounds.
pub fn extract_vless_uris(body: &str) -> Option<Vec<String>> {
    let trimmed = body.trim();
    if !(trimmed.starts_with('[') || trimmed.starts_with('{')) {
        return None;
    }
    let value: Value = serde_json::from_str(trimmed).ok()?;
    let profiles: Vec<&Value> = match &value {
        Value::Array(items) => items.iter().collect(),
        Value::Object(_) => vec![&value],
        _ => return None,
    };

    let mut uris = Vec::new();
    for profile in profiles {
        let Some(outbounds) = profile.get("outbounds").and_then(Value::as_array) else {
            continue;
        };
        let remarks = profile.get("remarks").and_then(Value::as_str);
        for outbound in outbounds {
            if outbound.get("protocol").and_then(Value::as_str) != Some("vless") {
                continue;
            }
            if let Some(uri) = vless_uri_from_outbound(outbound, remarks) {
                uris.push(uri);
            }
        }
    }
    Some(uris)
}

fn vless_uri_from_outbound(outbound: &Value, remarks: Option<&str>) -> Option<String> {
    let vnext = outbound
        .get("settings")?
        .get("vnext")?
        .as_array()?
        .first()?;
    let address = vnext.get("address")?.as_str()?;
    let port = vnext.get("port")?.as_u64()?;
    let user = vnext.get("users")?.as_array()?.first()?;
    let id = user.get("id")?.as_str()?;

    let mut url = Url::parse(&format!("vless://{id}@{address}:{port}")).ok()?;
    let stream = outbound.get("streamSettings");

    let raw_network = stream
        .and_then(|s| s.get("network"))
        .and_then(Value::as_str)
        .unwrap_or("tcp");
    // Xray's config schema calls HTTP/2 transport "h2"; our own URI param convention uses "http".
    let network = if raw_network == "h2" {
        "http"
    } else {
        raw_network
    };
    let security = stream
        .and_then(|s| s.get("security"))
        .and_then(Value::as_str)
        .unwrap_or("none");

    {
        let mut query = url.query_pairs_mut();
        query.append_pair("encryption", "none");
        query.append_pair("type", network);
        if security != "none" {
            query.append_pair("security", security);
        }
        if let Some(flow) = str_field(user, "flow") {
            query.append_pair("flow", flow);
        }

        if let Some(tls) = stream.and_then(|s| s.get("tlsSettings")) {
            append_optional(&mut query, "sni", str_field(tls, "serverName"));
            append_optional(&mut query, "fp", str_field(tls, "fingerprint"));
            if let Some(alpn) = tls.get("alpn").and_then(Value::as_array) {
                let joined = alpn
                    .iter()
                    .filter_map(Value::as_str)
                    .collect::<Vec<_>>()
                    .join(",");
                append_optional(
                    &mut query,
                    "alpn",
                    (!joined.is_empty()).then_some(joined.as_str()),
                );
            }
            if tls.get("allowInsecure").and_then(Value::as_bool) == Some(true) {
                query.append_pair("allowInsecure", "1");
            }
        }
        if let Some(reality) = stream.and_then(|s| s.get("realitySettings")) {
            append_optional(&mut query, "sni", str_field(reality, "serverName"));
            append_optional(&mut query, "fp", str_field(reality, "fingerprint"));
            append_optional(&mut query, "pbk", str_field(reality, "publicKey"));
            append_optional(&mut query, "sid", str_field(reality, "shortId"));
        }

        match network {
            "ws" => {
                if let Some(ws) = stream.and_then(|s| s.get("wsSettings")) {
                    append_optional(&mut query, "path", str_field(ws, "path"));
                    let host = ws.get("headers").and_then(|h| str_field(h, "Host"));
                    append_optional(&mut query, "host", host);
                }
            }
            "grpc" => {
                if let Some(grpc) = stream.and_then(|s| s.get("grpcSettings")) {
                    append_optional(&mut query, "serviceName", str_field(grpc, "serviceName"));
                }
            }
            "http" | "httpupgrade" => {
                let key = if network == "httpupgrade" {
                    "httpupgradeSettings"
                } else {
                    "httpSettings"
                };
                if let Some(http) = stream.and_then(|s| s.get(key)) {
                    append_optional(&mut query, "path", str_field(http, "path"));
                    let host = http
                        .get("host")
                        .and_then(Value::as_array)
                        .and_then(|hosts| hosts.first())
                        .and_then(Value::as_str);
                    append_optional(&mut query, "host", host);
                }
            }
            _ => {}
        }
    }

    let name = remarks
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or_else(|| outbound.get("tag").and_then(Value::as_str));
    if let Some(name) = name {
        url.set_fragment(Some(name));
    }

    Some(url.to_string())
}

fn str_field<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value
        .get(key)
        .and_then(Value::as_str)
        .filter(|v| !v.is_empty())
}

fn append_optional(
    query: &mut url::form_urlencoded::Serializer<'_, url::UrlQuery<'_>>,
    key: &str,
    value: Option<&str>,
) {
    if let Some(value) = value {
        query.append_pair(key, value);
    }
}
