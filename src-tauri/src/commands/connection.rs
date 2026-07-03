use tauri::{AppHandle, State};

use crate::app_log::{self, AppLog};
use crate::connection::manager::ConnectionManager;
use crate::db::DbPool;
use crate::dto::ConnectionStatusDto;
use crate::error::AppResult;

#[tauri::command]
pub async fn connect(
    app: AppHandle,
    pool: State<'_, DbPool>,
    manager: State<'_, ConnectionManager>,
    logs: State<'_, AppLog>,
    server_id: String,
) -> AppResult<ConnectionStatusDto> {
    logs.info(app_log::Category::Vpn, format!("connect requested server_id={server_id}"));
    let result = manager
        .connect(&app, pool.inner().clone(), server_id)
        .await
        .map(ConnectionStatusDto::from);

    match &result {
        Ok(status) => logs.info(
            app_log::Category::Vpn,
            format!(
                "connect finished state={} server_id={}",
                status.state,
                status.server_id.as_deref().unwrap_or("none")
            ),
        ),
        Err(error) => logs.error(
            app_log::Category::Vpn,
            format!("connect failed kind={} message={error}", error.kind()),
        ),
    }

    result
}

#[tauri::command]
pub async fn disconnect(
    app: AppHandle,
    manager: State<'_, ConnectionManager>,
    logs: State<'_, AppLog>,
) -> AppResult<ConnectionStatusDto> {
    logs.info(app_log::Category::Vpn, "disconnect requested");
    let result = manager
        .disconnect(&app)
        .await
        .map(ConnectionStatusDto::from);
    match &result {
        Ok(status) => logs.info(
            app_log::Category::Vpn,
            format!("disconnect finished state={}", status.state),
        ),
        Err(error) => logs.error(
            app_log::Category::Vpn,
            format!("disconnect failed kind={} message={error}", error.kind()),
        ),
    }
    result
}

#[tauri::command]
pub fn connection_status(manager: State<'_, ConnectionManager>) -> AppResult<ConnectionStatusDto> {
    manager.status().map(ConnectionStatusDto::from)
}
