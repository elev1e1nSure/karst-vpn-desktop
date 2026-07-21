use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlessLink {
    pub raw: String,
    pub id: String,
    pub host: String,
    pub port: u16,
    pub name: String,
    pub security: Security,
    pub transport: Transport,
    pub flow: Option<Flow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Security {
    None,
    Tls {
        server_name: Option<String>,
        fingerprint: Option<String>,
        alpn: Vec<String>,
        allow_insecure: bool,
    },
    Reality {
        server_name: Option<String>,
        public_key: String,
        short_id: Option<String>,
        fingerprint: Option<String>,
        // Xray-only: sing-box has no spiderX equivalent, so this stays unused until the xray core lands.
        spider_x: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Transport {
    Tcp,
    Ws {
        host: Option<String>,
        path: Option<String>,
    },
    Grpc {
        service_name: Option<String>,
    },
    Http {
        host: Option<String>,
        path: Option<String>,
    },
    HttpUpgrade {
        host: Option<String>,
        path: Option<String>,
    },
    Xhttp {
        host: Option<String>,
        path: Option<String>,
        mode: Option<String>,
        /// Raw JSON blob from the link's `extra` param, forwarded to Xray untouched. Xray treats it
        /// as a whole replacement `xhttpSettings`, keeping only host/path/mode from the outer level.
        extra: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Flow {
    XtlsRprxVision,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedBatch {
    pub links: Vec<VlessLink>,
    pub failures: Vec<ParseFailure>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseFailure {
    pub line: String,
    pub error: String,
}

#[derive(Debug, Error)]
pub enum ParseError {
    #[error("expected vless:// URI")]
    InvalidScheme,
    #[error("missing UUID")]
    MissingUuid,
    #[error("invalid UUID")]
    InvalidUuid,
    #[error("missing host")]
    MissingHost,
    #[error("missing port")]
    MissingPort,
    #[error("invalid port")]
    InvalidPort,
    #[error("unsupported security: {0}")]
    UnsupportedSecurity(String),
    #[error("unsupported transport: {0}")]
    UnsupportedTransport(String),
    #[error("reality security requires pbk")]
    MissingRealityPublicKey,
    #[error("unsupported flow: {0}")]
    UnsupportedFlow(String),
    #[error("unsupported xhttp mode: {0}")]
    UnsupportedXhttpMode(String),
    #[error("xhttp extra is not valid JSON: {0}")]
    InvalidXhttpExtra(String),
    #[error("xtls-rprx-vision requires tcp transport and tls or reality security")]
    InvalidVisionFlow,
    #[error("invalid URI: {0}")]
    InvalidUri(String),
}

impl Security {
    pub fn label(&self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Tls { .. } => "tls",
            Self::Reality { .. } => "reality",
        }
    }
}

impl Transport {
    pub fn label(&self) -> &'static str {
        match self {
            Self::Tcp => "tcp",
            Self::Ws { .. } => "ws",
            Self::Grpc { .. } => "grpc",
            Self::Http { .. } => "http",
            Self::HttpUpgrade { .. } => "httpupgrade",
            Self::Xhttp { .. } => "xhttp",
        }
    }
}

impl Flow {
    pub fn label(&self) -> &'static str {
        match self {
            Self::XtlsRprxVision => "xtls-rprx-vision",
        }
    }
}
