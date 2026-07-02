use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::app_log::AppLog;
use crate::db::DbPool;
use crate::db::{lock_pool, servers};
use crate::error::{AppError, AppResult};
use crate::healthcheck::tcp_check;
use crate::singbox::config::{build_config, TunOptions};
use crate::singbox::outbound::vless_to_outbound;
use crate::singbox::process::SingboxProcess;
use crate::vless::parser::parse_vless_uri;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConnectionStatus {
    Disconnected,
    Connecting {
        server_id: String,
    },
    Connected {
        server_id: String,
        server_name: String,
    },
    Error {
        message: String,
    },
}

pub struct ConnectionManager {
    operation: tokio::sync::Mutex<()>,
    inner: Arc<Mutex<ConnectionState>>,
}

struct ConnectionState {
    process: Option<SingboxProcess>,
    status: ConnectionStatus,
    generation: u64,
}

impl Default for ConnectionManager {
    fn default() -> Self {
        Self {
            operation: tokio::sync::Mutex::new(()),
            inner: Arc::new(Mutex::new(ConnectionState {
                process: None,
                status: ConnectionStatus::Disconnected,
                generation: 0,
            })),
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
                let _ = self.stop_current_process().await;
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
            let guard = lock_pool(&pool)?;
            servers::get_server(&guard, &server_id)?
        };
        let link = parse_vless_uri(&server.vless_uri)
            .map_err(|error| AppError::Vless(error.to_string()))?;

        tcp_check(&link.host, link.port, Duration::from_secs(5)).await?;

        self.stop_current_process().await?;

        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| AppError::Io(std::io::Error::other(error)))?;
        let tun_options = TunOptions::new(app_data_dir.join("sing-box-cache.db"));
        let outbound = vless_to_outbound(&link);
        let config = build_config(outbound, &tun_options);
        let mut process = SingboxProcess::spawn(app, &config, &app_data_dir).await?;
        process.ensure_stable().await?;
        let exit = process.exit_receiver();

        let status = ConnectionStatus::Connected {
            server_id,
            server_name: server.name,
        };
        let generation = {
            let mut inner = self.lock_inner()?;
            inner.generation = inner.generation.wrapping_add(1);
            inner.process = Some(process);
            inner.status = status.clone();
            inner.generation
        };
        Self::monitor_exit(app.clone(), self.inner.clone(), generation, exit);
        Ok(status)
    }

    pub async fn disconnect(&self) -> AppResult<ConnectionStatus> {
        let _operation = self.operation.lock().await;
        self.stop_current_process().await?;
        self.set_status(ConnectionStatus::Disconnected)?;
        Ok(ConnectionStatus::Disconnected)
    }

    pub async fn shutdown(&self) -> AppResult<()> {
        let _operation = self.operation.lock().await;
        self.stop_current_process().await?;
        self.set_status(ConnectionStatus::Disconnected)
    }

    pub fn shutdown_now(&self) -> AppResult<()> {
        let process = {
            let mut inner = self.lock_inner()?;
            inner.generation = inner.generation.wrapping_add(1);
            inner.status = ConnectionStatus::Disconnected;
            inner.process.take()
        };
        if let Some(mut process) = process {
            process.terminate_now()?;
        }
        Ok(())
    }

    pub fn status(&self) -> AppResult<ConnectionStatus> {
        Ok(self.lock_inner()?.status.clone())
    }

    async fn stop_current_process(&self) -> AppResult<()> {
        let process = {
            let mut inner = self.lock_inner()?;
            inner.generation = inner.generation.wrapping_add(1);
            inner.process.take()
        };
        if let Some(mut process) = process {
            process.stop().await?;
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

    fn monitor_exit(
        app: AppHandle,
        inner: Arc<Mutex<ConnectionState>>,
        generation: u64,
        mut exit: tokio::sync::watch::Receiver<Option<crate::singbox::process::ProcessExit>>,
    ) {
        tauri::async_runtime::spawn(async move {
            let current_exit = { exit.borrow().clone() };
            let process_exit = if let Some(process_exit) = current_exit {
                process_exit
            } else {
                if exit.changed().await.is_err() {
                    return;
                }
                let process_exit = exit.borrow().clone();
                let Some(process_exit) = process_exit else {
                    return;
                };
                process_exit
            };

            let updated = match inner.lock() {
                Ok(mut state) if state.generation == generation && state.process.is_some() => {
                    state.process.take();
                    state.status = ConnectionStatus::Error {
                        message: process_exit.message.clone(),
                    };
                    true
                }
                _ => false,
            };
            if updated {
                app.state::<AppLog>()
                    .error(format!("connection lost: {}", process_exit.message));
            }
        });
    }
}
