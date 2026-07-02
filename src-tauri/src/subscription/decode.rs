use base64::engine::general_purpose::{STANDARD, URL_SAFE};
use base64::Engine;

pub fn decode_subscription(input: &str) -> String {
    let trimmed = input.trim();
    // Plain subscriptions already contain URI schemes, while base64 blobs do not.
    if trimmed.contains("://") {
        return trimmed.to_string();
    }

    let compact: String = trimmed.chars().filter(|char| !char.is_whitespace()).collect();
    if compact.is_empty() {
        return String::new();
    }

    for candidate in padded_candidates(&compact) {
        for engine in [&STANDARD, &URL_SAFE] {
            if let Ok(bytes) = engine.decode(&candidate) {
                if let Ok(decoded) = String::from_utf8(bytes) {
                    let decoded = decoded.trim().to_string();
                    if decoded.contains("://") {
                        return decoded;
                    }
                }
            }
        }
    }

    trimmed.to_string()
}

fn padded_candidates(value: &str) -> Vec<String> {
    let mut candidates = vec![value.to_string()];
    let remainder = value.len() % 4;
    if remainder != 0 {
        let mut padded = value.to_string();
        padded.extend(std::iter::repeat_n('=', 4 - remainder));
        candidates.push(padded);
    }
    candidates
}
