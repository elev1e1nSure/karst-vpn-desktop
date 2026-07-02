pub mod app_log;
pub mod commands;
pub mod connection;
pub mod db;
pub mod dto;
pub mod error;
pub mod healthcheck;
pub mod scheduler;
pub mod singbox;
pub mod subscription;
pub mod vless;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let logs = app_log::AppLog::new(app_data_dir.clone());
            if let Err(error) = singbox::process::recover_stale_process(&app_data_dir) {
                logs.error(format!(
                    "stale sing-box recovery failed kind={} message={error}",
                    error.kind()
                ));
                return Err(error.into());
            }
            let pool = db::open(&app_data_dir.join("karst.sqlite3"))?;
            let client = reqwest::Client::builder()
                .user_agent(concat!("Karst VPN Desktop/", env!("CARGO_PKG_VERSION")))
                .connect_timeout(Duration::from_secs(10))
                .timeout(Duration::from_secs(30))
                .build()?;
            logs.info("application startup");
            let connection_manager = connection::manager::ConnectionManager::default();
            app.manage(logs);
            let schedule = scheduler::spawn(pool.clone(), client.clone(), app.handle().clone());

            app.manage(pool);
            app.manage(client);
            app.manage(connection_manager);
            app.manage(schedule);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::subscriptions::list_subscriptions,
            commands::subscriptions::add_subscription,
            commands::subscriptions::refresh_subscription,
            commands::subscriptions::refresh_all_subscriptions,
            commands::subscriptions::delete_subscription,
            commands::servers::list_servers,
            commands::servers::add_manual_link,
            commands::servers::delete_server,
            commands::servers::ping_servers,
            commands::settings::get_settings,
            commands::settings::set_auto_refresh_settings,
            commands::logs::list_logs,
            commands::logs::clear_logs,
            commands::connection::connect,
            commands::connection::disconnect,
            commands::connection::connection_status,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    let shutdown_started = Arc::new(AtomicBool::new(false));
    app.run(move |app_handle, event| match event {
        tauri::RunEvent::ExitRequested { code, api, .. } => {
            if shutdown_started.swap(true, Ordering::SeqCst) {
                return;
            }

            api.prevent_exit();
            let app_handle = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                let logs = app_handle.state::<app_log::AppLog>();
                logs.info("application shutdown requested");
                let manager = app_handle.state::<connection::manager::ConnectionManager>();
                match manager.shutdown().await {
                    Ok(()) => logs.info("application shutdown completed"),
                    Err(error) => logs.error(format!(
                        "application shutdown failed kind={} message={error}",
                        error.kind()
                    )),
                }
                app_handle.exit(code.unwrap_or(0));
            });
        }
        tauri::RunEvent::Exit => {
            let manager = app_handle.state::<connection::manager::ConnectionManager>();
            let _ = manager.shutdown_now();
        }
        _ => {}
    });
}
