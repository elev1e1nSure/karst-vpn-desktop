pub mod connection;
pub mod commands;
pub mod db;
pub mod dto;
pub mod error;
pub mod healthcheck;
pub mod scheduler;
pub mod singbox;
pub mod subscription;
pub mod vless;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let pool = db::open(&app_data_dir.join("karst.sqlite3"))?;
            let client = reqwest::Client::builder()
                .user_agent("Karst VPN Desktop/0.1.0")
                .build()?;
            let connection_manager = connection::manager::ConnectionManager::default();
            let schedule = scheduler::spawn(pool.clone(), client.clone());

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
            commands::settings::get_settings,
            commands::settings::set_auto_refresh_settings,
            commands::connection::connect,
            commands::connection::disconnect,
            commands::connection::connection_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
