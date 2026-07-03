use tauri::State;

use crate::app_log::{self, AppLog};
use crate::db;
use crate::db::settings;
use crate::db::DbPool;
use crate::dto::SettingsDto;
use crate::error::AppResult;
use crate::scheduler::{AutoRefreshMode, ScheduleHandle};

#[tauri::command]
pub fn get_settings(pool: State<'_, DbPool>) -> AppResult<SettingsDto> {
    let guard = db::lock_pool(pool.inner())?;
    Ok(SettingsDto {
        auto_refresh_mode: settings::get_auto_refresh_mode(&guard)?
            .as_str()
            .to_string(),
        auto_refresh_hours: settings::get_auto_refresh_hours(&guard)?,
    })
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
