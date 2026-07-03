use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewWindow};

use crate::app_log::{self, AppLog};
use crate::connection::manager::ConnectionManager;

const GRACEFUL_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(12);

#[derive(Default)]
pub struct LifecycleState {
    shutdown_started: AtomicBool,
    tray_ready: AtomicBool,
}

impl LifecycleState {
    pub fn mark_tray_ready(&self) {
        self.tray_ready.store(true, Ordering::Release);
    }

    pub fn shutdown_started(&self) -> bool {
        self.shutdown_started.load(Ordering::Acquire)
    }

    fn begin_shutdown(&self) -> bool {
        self.shutdown_started
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
    }
}

pub fn handle_close_requested(app: &AppHandle, window: &WebviewWindow) -> bool {
    let state = app.state::<LifecycleState>();
    if state.shutdown_started() || !state.tray_ready.load(Ordering::Acquire) {
        return false;
    }

    if let Err(error) = window.hide() {
        app.state::<AppLog>().error(
            app_log::Category::Service,
            format!("failed to hide main window: {error}"),
        );
        return false;
    }

    app.state::<AppLog>().info(
        app_log::Category::Service,
        "main window hidden to system tray",
    );
    true
}

pub fn request_exit(app: &AppHandle, code: i32) {
    let state = app.state::<LifecycleState>();
    if !state.begin_shutdown() {
        return;
    }

    crate::tray::set_shutting_down(app);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let logs = app.state::<AppLog>();
        logs.info(app_log::Category::Service, "application shutdown requested");

        let manager = app.state::<ConnectionManager>();
        match tokio::time::timeout(GRACEFUL_SHUTDOWN_TIMEOUT, manager.shutdown(&app)).await {
            Ok(Ok(())) => logs.info(
                app_log::Category::Service,
                "application shutdown completed",
            ),
            Ok(Err(error)) => {
                logs.error(
                    app_log::Category::Service,
                    format!(
                        "application shutdown failed kind={} message={error}",
                        error.kind()
                    ),
                );
                force_tunnel_shutdown(&app, &manager);
            }
            Err(_) => {
                logs.error(
                    app_log::Category::Service,
                    "application shutdown timed out",
                );
                force_tunnel_shutdown(&app, &manager);
            }
        }

        app.exit(code);
    });
}

pub fn force_tunnel_shutdown(app: &AppHandle, manager: &ConnectionManager) {
    if let Err(error) = manager.shutdown_now(app) {
        app.state::<AppLog>().error(
            app_log::Category::Service,
            format!(
                "forced tunnel shutdown failed kind={} message={error}",
                error.kind()
            ),
        );
    }
}
