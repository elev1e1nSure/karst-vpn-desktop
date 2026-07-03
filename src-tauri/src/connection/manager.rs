use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::app_log::{self, AppLog};
use crate::connection::killswitch::KillSwitch;
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
    Disconnecting {
        server_id: Option<String>,
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
    kill_switch: Option<KillSwitch>,
    status: ConnectionStatus,
    generation: u64,
}

impl Default for ConnectionManager {
    fn default() -> Self {
        Self {
            operation: tokio::sync::Mutex::new(()),
            inner: Arc::new(Mutex::new(ConnectionState {
                process: None,
                kill_switch: None,
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
        Self::ensure_not_shutting_down(app)?;
        self.set_status(
            app,
            ConnectionStatus::Connecting {
                server_id: server_id.clone(),
            },
        )?;

        match self.connect_inner(app, pool, server_id).await {
            Ok(status) => Ok(status),
            Err(error) => {
                app.state::<AppLog>().error(
                    app_log::Category::Vpn,
                    format!(
                        "connection failed kind={} message={error}",
                        error.kind()
                    ),
                );
                let _ = self.stop_current_process().await;
                let _ = self.set_status(
                    app,
                    ConnectionStatus::Error {
                        message: error.to_string(),
                    },
                );
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

        app.state::<AppLog>().info(
            app_log::Category::Net,
            format!(
                "TCP healthcheck starting host={}:{}",
                link.host, link.port
            ),
        );
        tcp_check(&link.host, link.port, Duration::from_secs(5)).await?;
        app.state::<AppLog>().info(
            app_log::Category::Net,
            format!(
                "TCP healthcheck passed host={}:{}",
                link.host, link.port
            ),
        );
        Self::ensure_not_shutting_down(app)?;

        self.stop_current_process().await?;

        let ks_host = link.host.clone();
        let ks_port = link.port;
        let mut kill_switch =
            tokio::task::spawn_blocking(move || KillSwitch::enable(&ks_host, ks_port))
                .await
                .map_err(|_| {
                    AppError::Connection("kill switch setup panicked".to_string())
                })??;
        app.state::<AppLog>().info(
            app_log::Category::Vpn,
            format!(
                "kill switch enabled host={}:{}",
                link.host, link.port
            ),
        );

        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| AppError::Io(std::io::Error::other(error)))?;
        let tun_options = TunOptions::new(app_data_dir.join("sing-box-cache.db"));
        let outbound = vless_to_outbound(&link);
        let config = build_config(outbound, &tun_options);

        app.state::<AppLog>().info(
            app_log::Category::Core,
            "sing-box spawning",
        );
        let mut process = match SingboxProcess::spawn(app, &config, &app_data_dir).await {
            Ok(process) => process,
            Err(error) => {
                kill_switch.disable();
                return Err(error);
            }
        };
        let stable_result = process.ensure_stable().await;
        if let Err(error) = stable_result {
            let _ = process.stop().await;
            kill_switch.disable();
            return Err(error);
        }
        app.state::<AppLog>().info(
            app_log::Category::Core,
            "sing-box started and stable",
        );
        if let Err(error) = Self::ensure_not_shutting_down(app) {
            let _ = process.stop().await;
            kill_switch.disable();
            return Err(error);
        }
        let exit = process.exit_receiver();

        let status = ConnectionStatus::Connected {
            server_id,
            server_name: server.name.clone(),
        };
        app.state::<AppLog>().info(
            app_log::Category::Vpn,
            format!("VPN connected to {}", server.name),
        );
        let generation = {
            let mut inner = self.lock_inner()?;
            inner.generation = inner.generation.wrapping_add(1);
            inner.process = Some(process);
            inner.kill_switch = Some(kill_switch);
            inner.status = status.clone();
            inner.generation
        };
        crate::tray::update_connection_status(app, &status);
        Self::monitor_exit(app.clone(), self.inner.clone(), generation, exit);
        Ok(status)
    }

    pub async fn disconnect(&self, app: &AppHandle) -> AppResult<ConnectionStatus> {
        let _operation = self.operation.lock().await;
        let server_id = self.active_server_id()?;
        self.set_status(app, ConnectionStatus::Disconnecting { server_id })?;

        app.state::<AppLog>().info(
            app_log::Category::Vpn,
            "VPN disconnecting",
        );
        if let Err(error) = self.stop_current_process().await {
            let _ = self.set_status(
                app,
                ConnectionStatus::Error {
                    message: error.to_string(),
                },
            );
            return Err(error);
        }
        app.state::<AppLog>().info(
            app_log::Category::Vpn,
            "VPN disconnected",
        );
        self.set_status(app, ConnectionStatus::Disconnected)?;
        Ok(ConnectionStatus::Disconnected)
    }

    pub async fn shutdown(&self, app: &AppHandle) -> AppResult<()> {
        let _operation = self.operation.lock().await;
        let server_id = self.active_server_id()?;
        self.set_status(app, ConnectionStatus::Disconnecting { server_id })?;
        if let Err(error) = self.stop_current_process().await {
            let _ = self.set_status(
                app,
                ConnectionStatus::Error {
                    message: error.to_string(),
                },
            );
            return Err(error);
        }
        self.set_status(app, ConnectionStatus::Disconnected)
    }

    pub fn shutdown_now(&self, app: &AppHandle) -> AppResult<()> {
        let (process, kill_switch) = {
            let mut inner = self.lock_inner()?;
            inner.generation = inner.generation.wrapping_add(1);
            inner.status = ConnectionStatus::Disconnected;
            (inner.process.take(), inner.kill_switch.take())
        };
        if let Some(mut process) = process {
            process.terminate_now()?;
        }
        if let Some(mut ks) = kill_switch {
            ks.disable();
        }
        crate::tray::update_connection_status(app, &ConnectionStatus::Disconnected);
        Ok(())
    }

    pub fn status(&self) -> AppResult<ConnectionStatus> {
        Ok(self.lock_inner()?.status.clone())
    }

    async fn stop_current_process(&self) -> AppResult<()> {
        let (process, kill_switch) = {
            let mut inner = self.lock_inner()?;
            inner.generation = inner.generation.wrapping_add(1);
            (inner.process.take(), inner.kill_switch.take())
        };
        if let Some(mut process) = process {
            process.stop().await?;
        }
        if let Some(mut ks) = kill_switch {
            let _ = tokio::task::spawn_blocking(move || {
                ks.disable();
            })
            .await;
        }
        Ok(())
    }

    fn set_status(&self, app: &AppHandle, status: ConnectionStatus) -> AppResult<()> {
        self.lock_inner()?.status = status.clone();
        crate::tray::update_connection_status(app, &status);
        Ok(())
    }

    fn active_server_id(&self) -> AppResult<Option<String>> {
        let server_id = match &self.lock_inner()?.status {
            ConnectionStatus::Connecting { server_id }
            | ConnectionStatus::Connected { server_id, .. } => Some(server_id.clone()),
            ConnectionStatus::Disconnecting { server_id } => server_id.clone(),
            ConnectionStatus::Disconnected | ConnectionStatus::Error { .. } => None,
        };
        Ok(server_id)
    }

    fn ensure_not_shutting_down(app: &AppHandle) -> AppResult<()> {
        if app
            .state::<crate::lifecycle::LifecycleState>()
            .shutdown_started()
        {
            return Err(AppError::Connection(
                "connection cancelled because application is shutting down".to_string(),
            ));
        }
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

            let kill_to_disable = {
                let mut state = match inner.lock() {
                    Ok(state) => state,
                    Err(_) => return,
                };
                if state.generation != generation || state.process.is_none() {
                    return;
                }
                state.process.take();
                let ks = state.kill_switch.take();
                state.status = ConnectionStatus::Error {
                    message: process_exit.message.clone(),
                };
                ks
            };

            if let Some(mut ks) = kill_to_disable {
                let _ = tokio::task::spawn_blocking(move || {
                    ks.disable();
                })
                .await;
            }
            crate::tray::update_connection_status(
                &app,
                &ConnectionStatus::Error {
                    message: process_exit.message.clone(),
                },
            );
            app.state::<AppLog>().error(
                app_log::Category::Vpn,
                format!("connection lost: {}", process_exit.message),
            );
        });
    }
}
