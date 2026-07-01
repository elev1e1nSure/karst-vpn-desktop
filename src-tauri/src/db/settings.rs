use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};

use crate::error::{AppError, AppResult};

pub const AUTO_REFRESH_MODE_KEY: &str = "auto_refresh_mode";
pub const AUTO_REFRESH_HOURS_KEY: &str = "auto_refresh_hours";

pub const AUTO_REFRESH_OFF: &str = "off";
pub const AUTO_REFRESH_AUTO: &str = "auto";
pub const AUTO_REFRESH_EVERY_HOURS: &str = "every_hours";

pub fn get_setting(connection: &Connection, key: &str) -> AppResult<Option<String>> {
    connection
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()
        .map_err(AppError::from)
}

pub fn set_setting(connection: &Connection, key: &str, value: &str) -> AppResult<()> {
    let now = Utc::now().to_rfc3339();
    connection.execute(
        r#"
        INSERT INTO settings (key, value, updated_at)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        "#,
        params![key, value, now],
    )?;
    Ok(())
}

pub fn get_auto_refresh_mode(connection: &Connection) -> AppResult<String> {
    let value = get_setting(connection, AUTO_REFRESH_MODE_KEY)?
        .unwrap_or_else(|| AUTO_REFRESH_OFF.to_string());
    validate_auto_refresh_mode(&value)?;
    Ok(value)
}

pub fn set_auto_refresh_mode(connection: &Connection, value: &str) -> AppResult<()> {
    validate_auto_refresh_mode(value)?;
    set_setting(connection, AUTO_REFRESH_MODE_KEY, value)
}

pub fn get_auto_refresh_hours(connection: &Connection) -> AppResult<u64> {
    let value =
        get_setting(connection, AUTO_REFRESH_HOURS_KEY)?.unwrap_or_else(|| "24".to_string());
    value
        .parse::<u64>()
        .ok()
        .filter(|hours| *hours > 0)
        .ok_or_else(|| AppError::InvalidInput("auto refresh hours must be positive".to_string()))
}

pub fn set_auto_refresh_hours(connection: &Connection, hours: u64) -> AppResult<()> {
    if hours == 0 {
        return Err(AppError::InvalidInput(
            "auto refresh hours must be positive".to_string(),
        ));
    }
    set_setting(connection, AUTO_REFRESH_HOURS_KEY, &hours.to_string())
}

fn validate_auto_refresh_mode(value: &str) -> AppResult<()> {
    match value {
        AUTO_REFRESH_OFF | AUTO_REFRESH_AUTO | AUTO_REFRESH_EVERY_HOURS => Ok(()),
        _ => Err(AppError::InvalidInput(format!(
            "invalid auto refresh mode: {value}"
        ))),
    }
}
