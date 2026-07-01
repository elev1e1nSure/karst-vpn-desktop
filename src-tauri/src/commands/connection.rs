use tauri::{AppHandle, State};

use crate::connection::manager::ConnectionManager;
use crate::db::DbPool;
use crate::dto::ConnectionStatusDto;
use crate::error::AppResult;

#[tauri::command]
pub async fn connect(
    app: AppHandle,
    pool: State<'_, DbPool>,
    manager: State<'_, ConnectionManager>,
    server_id: String,
) -> AppResult<ConnectionStatusDto> {
    manager
        .connect(&app, pool.inner().clone(), server_id)
        .await
        .map(ConnectionStatusDto::from)
}

#[tauri::command]
pub async fn disconnect(
    manager: State<'_, ConnectionManager>,
) -> AppResult<ConnectionStatusDto> {
    manager.disconnect().await.map(ConnectionStatusDto::from)
}

#[tauri::command]
pub fn connection_status(
    manager: State<'_, ConnectionManager>,
) -> AppResult<ConnectionStatusDto> {
    manager.status().map(ConnectionStatusDto::from)
}
