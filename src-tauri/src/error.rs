use serde::ser::{SerializeStruct, Serializer};
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("network error: {0}")]
    Network(#[from] reqwest::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("url error: {0}")]
    Url(#[from] url::ParseError),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("invalid VLESS link: {0}")]
    Vless(String),
    #[error("subscription error: {0}")]
    Subscription(String),
    #[error("sing-box error: {0}")]
    Singbox(String),
    #[error("connection error: {0}")]
    Connection(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("invalid input: {0}")]
    InvalidInput(String),
}

impl AppError {
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Database(_) => "database",
            Self::Network(_) => "network",
            Self::Io(_) => "io",
            Self::Url(_) => "url",
            Self::Json(_) => "json",
            Self::Vless(_) => "vless",
            Self::Subscription(_) => "subscription",
            Self::Singbox(_) => "singbox",
            Self::Connection(_) => "connection",
            Self::NotFound(_) => "not_found",
            Self::InvalidInput(_) => "invalid_input",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("kind", self.kind())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;
