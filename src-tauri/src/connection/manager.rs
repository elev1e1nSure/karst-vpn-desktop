use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::app_log::{self, AppLog};
use crate::connection::tunnel::Tunnel;
use crate::core::process::SidecarProcess;
use crate::core::TransportCore;
use crate::db::DbPool;
use crate::db::{lock_pool, servers, settings};
use crate::error::{AppError, AppResult};
use crate::healthcheck::{resolve_server_cidrs, tcp_check};
use crate::singbox::config::{build_config, TunOptions};
use crate::singbox::outbound::{socks_outbound, vless_to_outbound};
use crate::singbox::route_rules::XrayBypass;
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
    process: Option<Tunnel>,
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
                    format!("connection failed kind={} message={error}", error.kind()),
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
        let (server, routing_mode, dns_doh_url, core_mode) = {
            let guard = lock_pool(&pool)?;
            (
                servers::get_server(&guard, &server_id)?,
                settings::get_routing_mode(&guard)?,
                settings::get_dns_doh_url(&guard)?,
                settings::get_core_mode(&guard)?,
            )
        };
        let link = parse_vless_uri(&server.vless_uri)
            .map_err(|error| AppError::Vless(error.to_string()))?;

        app.state::<AppLog>().info(
            app_log::Category::Net,
            format!("TCP healthcheck starting host={}:{}", link.host, link.port),
        );
        tcp_check(&link.host, link.port, Duration::from_secs(5)).await?;
        app.state::<AppLog>().info(
            app_log::Category::Net,
            format!("TCP healthcheck passed host={}:{}", link.host, link.port),
        );
        Self::ensure_not_shutting_down(app)?;

        self.stop_current_process().await?;

        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| AppError::Io(std::io::Error::other(error)))?;
        let tun_options = TunOptions::new(app_data_dir.join("sing-box-cache.db"));
        let core = core_mode.resolve(&link.transport);

        // Dropping `xray` on any early return terminates it, so no explicit cleanup is needed
        // before the tunnel is assembled.
        let (proxy_outbound, xray, xray_bypass) = match core {
            TransportCore::SingBox => (vless_to_outbound(&link)?, None, None),
            TransportCore::Xray => {
                let socks_port = Self::pick_loopback_port()?;
                let xray_config = crate::xray::config::build_config(
                    crate::xray::outbound::vless_to_outbound(&link)?,
                    socks_port,
                );
                app.state::<AppLog>().info(
                    app_log::Category::Core,
                    format!("xray spawning socks_port={socks_port}"),
                );
                let mut process =
                    SidecarProcess::spawn(app, &crate::xray::SPEC, &xray_config, &app_data_dir)
                        .await?;
                process.ensure_ready().await?;
                app.state::<AppLog>()
                    .info(app_log::Category::Core, "xray started and ready");

                let bypass = XrayBypass {
                    process_names: crate::xray::SPEC
                        .executables
                        .iter()
                        .map(|name| (*name).to_string())
                        .collect(),
                    server_cidrs: resolve_server_cidrs(&link.host, link.port).await,
                    server_port: link.port,
                };
                app.state::<AppLog>().info(
                    app_log::Category::Core,
                    format!(
                        "xray bypass rules processes=[{}] server_cidrs={}",
                        bypass.process_names.join(","),
                        bypass.server_cidrs.len()
                    ),
                );
                (socks_outbound(socks_port), Some(process), Some(bypass))
            }
        };

        let config = build_config(
            proxy_outbound,
            &tun_options,
            routing_mode,
            &dns_doh_url,
            xray_bypass.as_ref(),
        );

        app.state::<AppLog>().info(
            app_log::Category::Core,
            format!(
                "sing-box spawning routing_mode={} transport_core={}",
                routing_mode.as_str(),
                core.as_str()
            ),
        );
        let mut singbox =
            SidecarProcess::spawn(app, &crate::singbox::SPEC, &config, &app_data_dir).await?;
        singbox.ensure_ready().await?;
        app.state::<AppLog>()
            .info(app_log::Category::Core, "sing-box started and ready");
        Self::ensure_not_shutting_down(app)?;

        let process = Tunnel::new(singbox, xray);
        let exits = process.exit_receivers();

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
            inner.status = status.clone();
            inner.generation
        };
        crate::tray::update_connection_status(app, &status);
        for exit in exits {
            Self::monitor_exit(app.clone(), self.inner.clone(), generation, exit);
        }
        Ok(status)
    }

    pub async fn disconnect(&self, app: &AppHandle) -> AppResult<ConnectionStatus> {
        let _operation = self.operation.lock().await;
        let server_id = self.active_server_id()?;
        self.set_status(app, ConnectionStatus::Disconnecting { server_id })?;

        app.state::<AppLog>()
            .info(app_log::Category::Vpn, "VPN disconnecting");
        if let Err(error) = self.stop_current_process().await {
            let _ = self.set_status(
                app,
                ConnectionStatus::Error {
                    message: error.to_string(),
                },
            );
            return Err(error);
        }
        app.state::<AppLog>()
            .info(app_log::Category::Vpn, "VPN disconnected");
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
        let process = {
            let mut inner = self.lock_inner()?;
            inner.generation = inner.generation.wrapping_add(1);
            inner.status = ConnectionStatus::Disconnected;
            inner.process.take()
        };
        if let Some(mut process) = process {
            process.terminate_now()?;
        }
        crate::tray::update_connection_status(app, &ConnectionStatus::Disconnected);
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

    /// Picks a free loopback port for the sing-box -> xray hop. The listener is dropped right away,
    /// so a racing process could still take it; the window is small and a collision surfaces as a
    /// normal startup failure rather than silent breakage.
    fn pick_loopback_port() -> AppResult<u16> {
        let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
        Ok(listener.local_addr()?.port())
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
        mut exit: tokio::sync::watch::Receiver<Option<crate::core::process::ProcessExit>>,
        // One task per process: whichever dies first wins the generation check and reports the loss.
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

            {
                let mut state = match inner.lock() {
                    Ok(state) => state,
                    Err(_) => return,
                };
                if state.generation != generation || state.process.is_none() {
                    return;
                }
                state.process.take();
                state.status = ConnectionStatus::Error {
                    message: process_exit.message.clone(),
                };
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
