use reqwest::header::HeaderMap;
use url::Url;

use crate::db::subscriptions::SubscriptionMetadata;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone)]
pub struct FetchedSubscription {
    pub url: String,
    pub body: String,
    pub metadata: SubscriptionMetadata,
}

pub async fn fetch_subscription(
    client: &reqwest::Client,
    url: &str,
) -> AppResult<FetchedSubscription> {
    let parsed = Url::parse(url)?;
    if parsed.scheme() != "https" {
        return Err(AppError::InvalidInput(
            "subscription URL must use HTTPS".to_string(),
        ));
    }

    let response = client
        .get(url)
        .send()
        .await?
        .error_for_status()
        .map_err(AppError::from)?;
    let metadata = parse_metadata(response.headers());
    let body = response.text().await?;

    Ok(FetchedSubscription {
        url: url.to_string(),
        body,
        metadata,
    })
}

fn parse_metadata(headers: &HeaderMap) -> SubscriptionMetadata {
    SubscriptionMetadata {
        profile_title: header_text(headers, "Profile-Title"),
        announce: header_text(headers, "Announce"),
        profile_update_interval_hours: header_text(headers, "Profile-Update-Interval")
            .and_then(|value| value.parse::<u64>().ok())
            .filter(|value| *value > 0),
        profile_web_page_url: header_text(headers, "Profile-Web-Page-Url"),
        routing_enable: header_text(headers, "Routing-Enable").and_then(|value| {
            match value.to_ascii_lowercase().as_str() {
                "1" | "true" | "yes" => Some(true),
                "0" | "false" | "no" => Some(false),
                _ => None,
            }
        }),
        subscription_userinfo: header_text(headers, "Subscription-Userinfo"),
    }
}

fn header_text(headers: &HeaderMap, key: &str) -> Option<String> {
    let value = headers.get(key)?.to_str().ok()?.trim();
    if value.is_empty() {
        return None;
    }

    if let Some(encoded) = value.strip_prefix("base64:") {
        decode_base64_header(encoded)
    } else {
        Some(value.to_string())
    }
}

fn decode_base64_header(value: &str) -> Option<String> {
    use base64::engine::general_purpose::{STANDARD, URL_SAFE};
    use base64::Engine;

    let compact: String = value.chars().filter(|char| !char.is_whitespace()).collect();
    let mut padded = compact.clone();
    let remainder = padded.len() % 4;
    if remainder != 0 {
        padded.extend(std::iter::repeat_n('=', 4 - remainder));
    }

    for candidate in [&compact, &padded] {
        for engine in [&STANDARD, &URL_SAFE] {
            if let Ok(bytes) = engine.decode(candidate) {
                if let Ok(decoded) = String::from_utf8(bytes) {
                    return Some(decoded.trim().to_string());
                }
            }
        }
    }

    None
}
