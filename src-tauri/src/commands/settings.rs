use tauri::State;

use crate::db::settings;
use crate::db::DbPool;
use crate::dto::SettingsDto;
use crate::error::{AppError, AppResult};
use crate::scheduler::ScheduleHandle;

#[tauri::command]
pub fn get_settings(pool: State<'_, DbPool>) -> AppResult<SettingsDto> {
    let guard = lock_pool(&pool)?;
    Ok(SettingsDto {
        auto_refresh_mode: settings::get_auto_refresh_mode(&guard)?,
        auto_refresh_hours: settings::get_auto_refresh_hours(&guard)?,
    })
}

#[tauri::command]
pub fn set_auto_refresh_settings(
    pool: State<'_, DbPool>,
    schedule: State<'_, ScheduleHandle>,
    mode: String,
    hours: Option<u64>,
) -> AppResult<SettingsDto> {
    {
        let guard = lock_pool(&pool)?;
        settings::set_auto_refresh_mode(&guard, &mode)?;
        if let Some(hours) = hours {
            settings::set_auto_refresh_hours(&guard, hours)?;
        }
    }
    schedule.notify_settings_changed();
    get_settings(pool)
}

fn lock_pool<'a>(
    pool: &'a State<'_, DbPool>,
) -> AppResult<std::sync::MutexGuard<'a, rusqlite::Connection>> {
    pool.inner()
        .lock()
        .map_err(|_| AppError::Database(rusqlite::Error::InvalidQuery))
}
