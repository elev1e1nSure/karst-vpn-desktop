use tauri::State;
use uuid::Uuid;

use crate::db::servers::{self, NewServer};
use crate::db::DbPool;
use crate::dto::ServerDto;
use crate::error::{AppError, AppResult};
use crate::vless::parser::parse_vless_uri;

#[tauri::command]
pub fn list_servers(pool: State<'_, DbPool>) -> AppResult<Vec<ServerDto>> {
    let guard = lock_pool(&pool)?;
    servers::list_servers(&guard).map(|records| records.into_iter().map(ServerDto::from).collect())
}

#[tauri::command]
pub fn add_manual_link(
    pool: State<'_, DbPool>,
    vless_uri: String,
    name: Option<String>,
) -> AppResult<ServerDto> {
    let link =
        parse_vless_uri(&vless_uri).map_err(|error| AppError::Vless(error.to_string()))?;
    let server = NewServer {
        id: Uuid::new_v4().to_string(),
        subscription_id: None,
        name: name
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| link.name.clone()),
        vless_uri: link.raw.clone(),
        host: link.host.clone(),
        port: link.port,
        uuid: link.id.clone(),
        security: link.security.label().to_string(),
        transport: link.transport.label().to_string(),
        flow: link.flow.as_ref().map(|flow| flow.label().to_string()),
    };

    let guard = lock_pool(&pool)?;
    servers::insert_server(&guard, &server).map(ServerDto::from)
}

#[tauri::command]
pub fn delete_server(pool: State<'_, DbPool>, server_id: String) -> AppResult<bool> {
    let guard = lock_pool(&pool)?;
    servers::delete_server(&guard, &server_id)
}

fn lock_pool<'a>(
    pool: &'a State<'_, DbPool>,
) -> AppResult<std::sync::MutexGuard<'a, rusqlite::Connection>> {
    pool.inner()
        .lock()
        .map_err(|_| AppError::Database(rusqlite::Error::InvalidQuery))
}
