use std::collections::HashMap;

use url::Url;
use uuid::Uuid;

use super::model::{
    Flow, ParseError, ParseFailure, ParsedBatch, Security, Transport, VlessLink,
};

pub fn parse_vless_uri(input: &str) -> Result<VlessLink, ParseError> {
    let raw = input.trim();
    let url = Url::parse(raw).map_err(|error| ParseError::InvalidUri(error.to_string()))?;

    if url.scheme() != "vless" {
        return Err(ParseError::InvalidScheme);
    }

    let id = url.username();
    if id.is_empty() {
        return Err(ParseError::MissingUuid);
    }
    Uuid::parse_str(id).map_err(|_| ParseError::InvalidUuid)?;

    let host = url
        .host_str()
        .ok_or(ParseError::MissingHost)?
        .trim_start_matches('[')
        .trim_end_matches(']')
        .to_string();
    let port = url.port().ok_or(ParseError::MissingPort)?;
    if port == 0 {
        return Err(ParseError::InvalidPort);
    }

    let query = parse_query(url.query().unwrap_or(""));
    let transport = parse_transport(&query)?;
    let security = parse_security(&query)?;
    let flow = parse_flow(query.get("flow"))?;

    if matches!(flow, Some(Flow::XtlsRprxVision))
        && (!matches!(transport, Transport::Tcp)
            || !matches!(security, Security::Tls { .. } | Security::Reality { .. }))
    {
        return Err(ParseError::InvalidVisionFlow);
    }

    let name = url
        .fragment()
        .map(percent_decode)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| format!("{host}:{port}"));

    Ok(VlessLink {
        raw: raw.to_string(),
        id: id.to_string(),
        host,
        port,
        name,
        security,
        transport,
        flow,
    })
}

pub fn parse_subscription_body(body: &str) -> ParsedBatch {
    let mut links = Vec::new();
    let mut failures = Vec::new();

    for line in body.lines().map(str::trim).filter(|line| !line.is_empty()) {
        match parse_vless_uri(line) {
            Ok(link) => links.push(link),
            Err(error) => failures.push(ParseFailure {
                line: line.to_string(),
                error: error.to_string(),
            }),
        }
    }

    ParsedBatch { links, failures }
}

fn parse_security(query: &HashMap<String, String>) -> Result<Security, ParseError> {
    match query.get("security").map(String::as_str).unwrap_or("none") {
        "none" => Ok(Security::None),
        "tls" => Ok(Security::Tls {
            server_name: first_non_empty(query, &["sni", "peer"]),
            fingerprint: first_non_empty(query, &["fp"]),
            alpn: query
                .get("alpn")
                .map(|value| {
                    value
                        .split(',')
                        .map(str::trim)
                        .filter(|item| !item.is_empty())
                        .map(str::to_string)
                        .collect()
                })
                .unwrap_or_default(),
            allow_insecure: query
                .get("allowInsecure")
                .or_else(|| query.get("allow_insecure"))
                .map(|value| matches!(value.as_str(), "1" | "true" | "True"))
                .unwrap_or(false),
        }),
        "reality" => {
            let public_key = query
                .get("pbk")
                .filter(|value| !value.is_empty())
                .cloned()
                .ok_or(ParseError::MissingRealityPublicKey)?;
            Ok(Security::Reality {
                server_name: first_non_empty(query, &["sni", "peer"]),
                public_key,
                short_id: first_non_empty(query, &["sid"]),
                fingerprint: first_non_empty(query, &["fp"]),
            })
        }
        other => Err(ParseError::UnsupportedSecurity(other.to_string())),
    }
}

fn parse_transport(query: &HashMap<String, String>) -> Result<Transport, ParseError> {
    match query.get("type").map(String::as_str).unwrap_or("tcp") {
        "tcp" => Ok(Transport::Tcp),
        "ws" => Ok(Transport::Ws {
            host: first_non_empty(query, &["host"]),
            path: first_non_empty(query, &["path"]),
        }),
        "grpc" => Ok(Transport::Grpc {
            service_name: first_non_empty(query, &["serviceName", "service_name"]),
        }),
        "http" => Ok(Transport::Http {
            host: first_non_empty(query, &["host"]),
            path: first_non_empty(query, &["path"]),
        }),
        "httpupgrade" => Ok(Transport::HttpUpgrade {
            host: first_non_empty(query, &["host"]),
            path: first_non_empty(query, &["path"]),
        }),
        "xhttp" => Err(ParseError::UnsupportedTransport("xhttp".to_string())),
        other => Err(ParseError::UnsupportedTransport(other.to_string())),
    }
}

fn parse_flow(value: Option<&String>) -> Result<Option<Flow>, ParseError> {
    match value.map(String::as_str).filter(|value| !value.is_empty()) {
        None => Ok(None),
        Some("xtls-rprx-vision") => Ok(Some(Flow::XtlsRprxVision)),
        Some(other) => Err(ParseError::UnsupportedFlow(other.to_string())),
    }
}

fn first_non_empty(query: &HashMap<String, String>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| query.get(*key))
        .find(|value| !value.is_empty())
        .cloned()
}

fn parse_query(query: &str) -> HashMap<String, String> {
    let mut values = HashMap::new();

    for pair in query.split('&').filter(|pair| !pair.is_empty()) {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        values.insert(percent_decode(key), percent_decode(value));
    }

    values
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(high), Some(low)) = (hex_value(bytes[index + 1]), hex_value(bytes[index + 2]))
            {
                output.push((high << 4) | low);
                index += 3;
                continue;
            }
        }

        output.push(bytes[index]);
        index += 1;
    }

    String::from_utf8_lossy(&output).into_owned()
}

fn hex_value(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}
