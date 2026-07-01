use serde::Serialize;

use crate::connection::manager::ConnectionStatus;
use crate::db::servers::ServerRecord;
use crate::db::subscriptions::SubscriptionRecord;
use crate::subscription::refresh::ImportSummary;

#[derive(Debug, Clone, Serialize)]
pub struct ServerDto {
    pub id: String,
    pub subscription_id: Option<String>,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub security: String,
    pub transport: String,
    pub flow: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SubscriptionDto {
    pub id: String,
    pub url: String,
    pub name: String,
    pub profile_title: Option<String>,
    pub announce: Option<String>,
    pub profile_update_interval_hours: Option<u64>,
    pub profile_web_page_url: Option<String>,
    pub routing_enable: Option<bool>,
    pub subscription_userinfo: Option<String>,
    pub last_refresh_at: Option<String>,
    pub last_refresh_error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SettingsDto {
    pub auto_refresh_mode: String,
    pub auto_refresh_hours: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ImportSummaryDto {
    pub subscription_id: String,
    pub imported: usize,
    pub failed: usize,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConnectionStatusDto {
    pub state: String,
    pub server_id: Option<String>,
    pub server_name: Option<String>,
    pub message: Option<String>,
}

impl From<ServerRecord> for ServerDto {
    fn from(record: ServerRecord) -> Self {
        Self {
            id: record.id,
            subscription_id: record.subscription_id,
            name: record.name,
            host: record.host,
            port: record.port,
            security: record.security,
            transport: record.transport,
            flow: record.flow,
            created_at: record.created_at.to_rfc3339(),
            updated_at: record.updated_at.to_rfc3339(),
        }
    }
}

impl From<SubscriptionRecord> for SubscriptionDto {
    fn from(record: SubscriptionRecord) -> Self {
        Self {
            id: record.id,
            url: record.url,
            name: record.name,
            profile_title: record.profile_title,
            announce: record.announce,
            profile_update_interval_hours: record.profile_update_interval_hours,
            profile_web_page_url: record.profile_web_page_url,
            routing_enable: record.routing_enable,
            subscription_userinfo: record.subscription_userinfo,
            last_refresh_at: record.last_refresh_at.map(|value| value.to_rfc3339()),
            last_refresh_error: record.last_refresh_error,
            created_at: record.created_at.to_rfc3339(),
            updated_at: record.updated_at.to_rfc3339(),
        }
    }
}

impl From<ImportSummary> for ImportSummaryDto {
    fn from(summary: ImportSummary) -> Self {
        Self {
            subscription_id: summary.subscription_id,
            imported: summary.imported,
            failed: summary.failed,
            error: summary.error,
        }
    }
}

impl From<ConnectionStatus> for ConnectionStatusDto {
    fn from(status: ConnectionStatus) -> Self {
        match status {
            ConnectionStatus::Disconnected => Self {
                state: "disconnected".to_string(),
                server_id: None,
                server_name: None,
                message: None,
            },
            ConnectionStatus::Connecting { server_id } => Self {
                state: "connecting".to_string(),
                server_id: Some(server_id),
                server_name: None,
                message: None,
            },
            ConnectionStatus::Connected {
                server_id,
                server_name,
            } => Self {
                state: "connected".to_string(),
                server_id: Some(server_id),
                server_name: Some(server_name),
                message: None,
            },
            ConnectionStatus::Error { message } => Self {
                state: "error".to_string(),
                server_id: None,
                server_name: None,
                message: Some(message),
            },
        }
    }
}
