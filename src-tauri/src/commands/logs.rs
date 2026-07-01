use tauri::State;

use crate::app_log::AppLog;
use crate::dto::LogEntryDto;
use crate::error::AppResult;

#[tauri::command]
pub fn list_logs(logs: State<'_, AppLog>) -> AppResult<Vec<LogEntryDto>> {
    logs.list()
        .map(|entries| entries.into_iter().map(LogEntryDto::from).collect())
}

#[tauri::command]
pub fn clear_logs(logs: State<'_, AppLog>) -> AppResult<()> {
    logs.clear()
}
