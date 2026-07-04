use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};

use crate::error::{AppError, AppResult};
use crate::scheduler::AutoRefreshMode;
use crate::singbox::route_rules::RoutingMode;

pub const AUTO_REFRESH_MODE_KEY: &str = "auto_refresh_mode";
pub const AUTO_REFRESH_HOURS_KEY: &str = "auto_refresh_hours";
pub const ROUTING_MODE_KEY: &str = "routing_mode";
pub const DNS_DOH_URL_KEY: &str = "dns_doh_url";
pub const DEFAULT_DNS_DOH_URL: &str = "https://1.1.1.1/dns-query";

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

pub fn get_auto_refresh_mode(connection: &Connection) -> AppResult<AutoRefreshMode> {
    let value = get_setting(connection, AUTO_REFRESH_MODE_KEY)?
        .unwrap_or_else(|| AutoRefreshMode::Off.as_str().to_string());
    Ok(AutoRefreshMode::try_from(value.as_str()).unwrap_or(AutoRefreshMode::Off))
}

pub fn set_auto_refresh_mode(connection: &Connection, value: AutoRefreshMode) -> AppResult<()> {
    set_setting(connection, AUTO_REFRESH_MODE_KEY, value.as_str())
}

pub fn get_auto_refresh_hours(connection: &Connection) -> AppResult<u64> {
    let value =
        get_setting(connection, AUTO_REFRESH_HOURS_KEY)?.unwrap_or_else(|| "24".to_string());
    Ok(crate::scheduler::normalize_refresh_hours(
        value
            .parse::<u64>()
            .ok()
            .unwrap_or(crate::scheduler::DEFAULT_REFRESH_HOURS),
    ))
}

pub fn set_auto_refresh_hours(connection: &Connection, hours: u64) -> AppResult<()> {
    if !(crate::scheduler::MIN_REFRESH_HOURS..=crate::scheduler::MAX_REFRESH_HOURS).contains(&hours)
    {
        return Err(AppError::InvalidInput(format!(
            "auto refresh hours must be between {} and {}",
            crate::scheduler::MIN_REFRESH_HOURS,
            crate::scheduler::MAX_REFRESH_HOURS
        )));
    }
    set_setting(connection, AUTO_REFRESH_HOURS_KEY, &hours.to_string())
}

pub fn get_routing_mode(connection: &Connection) -> AppResult<RoutingMode> {
    let value = get_setting(connection, ROUTING_MODE_KEY)?
        .unwrap_or_else(|| RoutingMode::BypassRu.as_str().to_string());
    Ok(RoutingMode::try_from(value.as_str()).unwrap_or(RoutingMode::BypassRu))
}

pub fn set_routing_mode(connection: &Connection, value: RoutingMode) -> AppResult<()> {
    set_setting(connection, ROUTING_MODE_KEY, value.as_str())
}

pub fn get_dns_doh_url(connection: &Connection) -> AppResult<String> {
    Ok(
        get_setting(connection, DNS_DOH_URL_KEY)?
            .unwrap_or_else(|| DEFAULT_DNS_DOH_URL.to_string()),
    )
}

pub fn set_dns_doh_url(connection: &Connection, value: &str) -> AppResult<()> {
    set_setting(connection, DNS_DOH_URL_KEY, value)
}
