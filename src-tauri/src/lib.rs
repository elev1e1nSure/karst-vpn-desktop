pub mod db;
pub mod error;
pub mod healthcheck;
pub mod scheduler;
pub mod singbox;
pub mod subscription;
pub mod vless;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
