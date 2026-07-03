pub mod app_log;
pub mod commands;
pub mod connection;
pub mod db;
pub mod dto;
pub mod error;
pub mod healthcheck;
pub mod lifecycle;
pub mod scheduler;
pub mod singbox;
pub mod subscription;
pub mod tray;
pub mod vless;

use std::time::Duration;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::show_main_window(app);
        }))
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let logs = app_log::AppLog::new(app_data_dir.clone());
            app.manage(lifecycle::LifecycleState::default());
            app.manage(logs);

            if let Err(error) = singbox::process::recover_stale_process(&app_data_dir) {
                app.state::<app_log::AppLog>().error(
                    app_log::Category::Service,
                    format!(
                        "stale sing-box recovery failed kind={} message={error}",
                        error.kind()
                    ),
                );
                return Err(error.into());
            }
            let pool = db::open(&app_data_dir.join("karst.sqlite3"))?;
            let client = reqwest::Client::builder()
                .user_agent(concat!("Karst VPN Desktop/", env!("CARGO_PKG_VERSION")))
                .connect_timeout(Duration::from_secs(10))
                .timeout(Duration::from_secs(30))
                .build()?;
            app.state::<app_log::AppLog>().info(
                app_log::Category::Service,
                "application startup",
            );
            let connection_manager = connection::manager::ConnectionManager::default();
            let schedule = scheduler::spawn(pool.clone(), client.clone(), app.handle().clone());

            app.manage(pool);
            app.manage(client);
            app.manage(connection_manager);
            app.manage(schedule);

            match tray::create(app.handle()) {
                Ok(controller) => {
                    app.manage(controller);
                    app.state::<lifecycle::LifecycleState>().mark_tray_ready();
                    let status = app
                        .state::<connection::manager::ConnectionManager>()
                        .status()?;
                    tray::update_connection_status(app.handle(), &status);
                }
                Err(error) => app.state::<app_log::AppLog>().error(
                    app_log::Category::Service,
                    format!("system tray initialization failed: {error}"),
                ),
            }

            let main_window = app
                .get_webview_window("main")
                .ok_or_else(|| std::io::Error::other("main window is unavailable"))?;
            let app_handle = app.handle().clone();
            let window_for_event = main_window.clone();
            main_window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    if lifecycle::handle_close_requested(&app_handle, &window_for_event) {
                        api.prevent_close();
                    }
                }
            });

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

    app.run(move |app_handle, event| match event {
        tauri::RunEvent::ExitRequested { code, api, .. } => {
            if app_handle
                .state::<lifecycle::LifecycleState>()
                .shutdown_started()
            {
                return;
            }

            api.prevent_exit();
            lifecycle::request_exit(app_handle, code.unwrap_or(0));
        }
        tauri::RunEvent::Exit => {
            let manager = app_handle.state::<connection::manager::ConnectionManager>();
            lifecycle::force_tunnel_shutdown(app_handle, &manager);
        }
        _ => {}
    });
}
