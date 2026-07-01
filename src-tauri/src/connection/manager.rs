use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::db::servers;
use crate::db::DbPool;
use crate::error::{AppError, AppResult};
use crate::healthcheck::tcp_check;
use crate::singbox::config::{build_config, TunOptions};
use crate::singbox::outbound::vless_to_outbound;
use crate::singbox::process::SingboxProcess;
use crate::vless::parser::parse_vless_uri;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConnectionStatus {
    Disconnected,
    Connecting { server_id: String },
    Connected { server_id: String, server_name: String },
    Error { message: String },
}

pub struct ConnectionManager {
    operation: tokio::sync::Mutex<()>,
    inner: Mutex<ConnectionState>,
}

struct ConnectionState {
    process: Option<SingboxProcess>,
    status: ConnectionStatus,
}

impl Default for ConnectionManager {
    fn default() -> Self {
        Self {
            operation: tokio::sync::Mutex::new(()),
            inner: Mutex::new(ConnectionState {
                process: None,
                status: ConnectionStatus::Disconnected,
            }),
        }
    }
}

impl ConnectionManager {
    pub async fn connect(
        &self,
        app: &AppHandle,
        pool: DbPool,
        server_id: String,
    ) -> AppResult<ConnectionStatus> {
        let _operation = self.operation.lock().await;
        self.set_status(ConnectionStatus::Connecting {
            server_id: server_id.clone(),
        })?;

        match self.connect_inner(app, pool, server_id).await {
            Ok(status) => Ok(status),
            Err(error) => {
                let _ = self.stop_current_process();
                let _ = self.set_status(ConnectionStatus::Disconnected);
                Err(error)
            }
        }
    }

    async fn connect_inner(
        &self,
        app: &AppHandle,
        pool: DbPool,
        server_id: String,
    ) -> AppResult<ConnectionStatus> {
        let server = {
            let guard = pool
                .lock()
                .map_err(|_| AppError::Database(rusqlite::Error::InvalidQuery))?;
            servers::get_server(&guard, &server_id)?
        };
        let link = parse_vless_uri(&server.vless_uri)
            .map_err(|error| AppError::Vless(error.to_string()))?;

        tcp_check(&link.host, link.port, Duration::from_secs(5)).await?;

        self.stop_current_process()?;

        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| AppError::Io(std::io::Error::new(std::io::ErrorKind::Other, error)))?;
        let tun_options = TunOptions::new(app_data_dir.join("sing-box-cache.db"));
        let outbound = vless_to_outbound(&link);
        let config = build_config(outbound, &tun_options);
        let process = SingboxProcess::spawn(app, &config, &app_data_dir).await?;

        let status = ConnectionStatus::Connected {
            server_id,
            server_name: server.name,
        };
        let mut inner = self.lock_inner()?;
        inner.process = Some(process);
        inner.status = status.clone();
        Ok(status)
    }

    pub async fn disconnect(&self) -> AppResult<ConnectionStatus> {
        let _operation = self.operation.lock().await;
        self.stop_current_process()?;
        self.set_status(ConnectionStatus::Disconnected)?;
        Ok(ConnectionStatus::Disconnected)
    }

    pub fn status(&self) -> AppResult<ConnectionStatus> {
        Ok(self.lock_inner()?.status.clone())
    }

    fn stop_current_process(&self) -> AppResult<()> {
        let mut inner = self.lock_inner()?;
        if let Some(mut process) = inner.process.take() {
            process.stop()?;
        }
        Ok(())
    }

    fn set_status(&self, status: ConnectionStatus) -> AppResult<()> {
        self.lock_inner()?.status = status;
        Ok(())
    }

    fn lock_inner(&self) -> AppResult<std::sync::MutexGuard<'_, ConnectionState>> {
        self.inner
            .lock()
            .map_err(|_| AppError::Connection("connection state lock poisoned".to_string()))
    }
}
