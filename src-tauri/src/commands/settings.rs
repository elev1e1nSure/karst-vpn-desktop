use tauri::State;

use crate::app_log::{self, AppLog};
use crate::core::CoreMode;
use crate::db;
use crate::db::settings;
use crate::db::DbPool;
use crate::dto::SettingsDto;
use crate::error::AppResult;
use crate::scheduler::{AutoRefreshMode, ScheduleHandle};
use crate::singbox::route_rules::RoutingMode;

#[tauri::command]
pub fn get_settings(pool: State<'_, DbPool>) -> AppResult<SettingsDto> {
    let guard = db::lock_pool(pool.inner())?;
    Ok(SettingsDto {
        auto_refresh_mode: settings::get_auto_refresh_mode(&guard)?
            .as_str()
            .to_string(),
        auto_refresh_hours: settings::get_auto_refresh_hours(&guard)?,
        routing_mode: settings::get_routing_mode(&guard)?.as_str().to_string(),
        dns_doh_url: settings::get_dns_doh_url(&guard)?,
        core_mode: settings::get_core_mode(&guard)?.as_str().to_string(),
    })
}

#[tauri::command]
pub fn set_core_mode(
    pool: State<'_, DbPool>,
    logs: State<'_, AppLog>,
    mode: String,
) -> AppResult<SettingsDto> {
    let mode = CoreMode::try_from(mode.as_str())?;
    let mode_label = mode.as_str();
    {
        let guard = db::lock_pool(pool.inner())?;
        settings::set_core_mode(&guard, mode)?;
    }
    logs.info(
        app_log::Category::Service,
        format!("settings updated core_mode={mode_label}"),
    );
    get_settings(pool)
}

#[tauri::command]
pub fn set_auto_refresh_settings(
    pool: State<'_, DbPool>,
    schedule: State<'_, ScheduleHandle>,
    logs: State<'_, AppLog>,
    mode: String,
    hours: Option<u64>,
) -> AppResult<SettingsDto> {
    let mode = AutoRefreshMode::try_from(mode.as_str())?;
    let mode_label = mode.as_str();
    {
        let mut guard = db::lock_pool(pool.inner())?;
        let transaction = guard.transaction()?;
        settings::set_auto_refresh_mode(&transaction, mode)?;
        if let Some(hours) = hours {
            settings::set_auto_refresh_hours(&transaction, hours)?;
        }
        transaction.commit()?;
    }
    schedule.notify_settings_changed();
    logs.info(
        app_log::Category::Service,
        format!(
            "settings updated auto_refresh_mode={} auto_refresh_hours={}",
            mode_label,
            hours
                .map(|value| value.to_string())
                .unwrap_or_else(|| "unchanged".to_string())
        ),
    );
    get_settings(pool)
}

#[tauri::command]
pub fn set_routing_mode(
    pool: State<'_, DbPool>,
    logs: State<'_, AppLog>,
    mode: String,
) -> AppResult<SettingsDto> {
    let mode = RoutingMode::try_from(mode.as_str())?;
    let mode_label = mode.as_str();
    {
        let guard = db::lock_pool(pool.inner())?;
        settings::set_routing_mode(&guard, mode)?;
    }
    logs.info(
        app_log::Category::Service,
        format!("settings updated routing_mode={mode_label}"),
    );
    get_settings(pool)
}

#[tauri::command]
pub fn set_dns_doh_url(
    pool: State<'_, DbPool>,
    logs: State<'_, AppLog>,
    url: String,
) -> AppResult<SettingsDto> {
    {
        let guard = db::lock_pool(pool.inner())?;
        settings::set_dns_doh_url(&guard, &url)?;
    }
    logs.info(
        app_log::Category::Service,
        format!("settings updated dns_doh_url={url}"),
    );
    get_settings(pool)
}
