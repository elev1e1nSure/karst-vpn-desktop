use std::time::Duration;

use tauri::State;
use tokio::task::JoinSet;
use uuid::Uuid;

use crate::app_log::AppLog;
use crate::db;
use crate::db::servers::{self, NewServer};
use crate::db::DbPool;
use crate::dto::{ServerDto, ServerPingDto};
use crate::error::{AppError, AppResult};
use crate::healthcheck::measure_latency;
use crate::vless::parser::parse_vless_uri;

#[tauri::command]
pub fn list_servers(pool: State<'_, DbPool>) -> AppResult<Vec<ServerDto>> {
    let guard = db::lock_pool(pool.inner())?;
    servers::list_servers(&guard).map(|records| records.into_iter().map(ServerDto::from).collect())
}

#[tauri::command]
pub fn add_manual_link(
    pool: State<'_, DbPool>,
    logs: State<'_, AppLog>,
    vless_uri: String,
    name: Option<String>,
) -> AppResult<ServerDto> {
    let link = parse_vless_uri(&vless_uri).map_err(|error| AppError::Vless(error.to_string()))?;
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

    let guard = db::lock_pool(pool.inner())?;
    let result = servers::insert_server(&guard, &server).map(ServerDto::from);
    match &result {
        Ok(server) => logs.info(format!(
            "manual server added id={} host={}:{}",
            server.id, server.host, server.port
        )),
        Err(error) => logs.error(format!(
            "manual server add failed kind={} message={error}",
            error.kind()
        )),
    }
    result
}

#[tauri::command]
pub async fn ping_servers(pool: State<'_, DbPool>) -> AppResult<Vec<ServerPingDto>> {
    let records = {
        let guard = db::lock_pool(pool.inner())?;
        servers::list_servers(&guard)?
    };

    let mut set = JoinSet::new();
    for record in records {
        set.spawn(async move {
            let latency_ms = measure_latency(&record.host, record.port, Duration::from_secs(4)).await;
            ServerPingDto {
                id: record.id,
                latency_ms,
            }
        });
    }

    let mut results = Vec::new();
    while let Some(result) = set.join_next().await {
        if let Ok(ping) = result {
            results.push(ping);
        }
    }
    Ok(results)
}

#[tauri::command]
pub fn delete_server(
    pool: State<'_, DbPool>,
    logs: State<'_, AppLog>,
    server_id: String,
) -> AppResult<bool> {
    let guard = db::lock_pool(pool.inner())?;
    let result = servers::delete_server(&guard, &server_id);
    match &result {
        Ok(deleted) => logs.info(format!(
            "server delete requested id={server_id} deleted={deleted}"
        )),
        Err(error) => logs.error(format!(
            "server delete failed kind={} message={error}",
            error.kind()
        )),
    }
    result
}
