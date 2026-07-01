use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone)]
pub struct SubscriptionRecord {
    pub id: String,
    pub url: String,
    pub name: String,
    pub profile_title: Option<String>,
    pub announce: Option<String>,
    pub profile_update_interval_hours: Option<u64>,
    pub profile_web_page_url: Option<String>,
    pub routing_enable: Option<bool>,
    pub subscription_userinfo: Option<String>,
    pub last_refresh_at: Option<DateTime<Utc>>,
    pub last_refresh_error: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct NewSubscription {
    pub id: String,
    pub url: String,
    pub name: String,
}

#[derive(Debug, Clone, Default)]
pub struct SubscriptionMetadata {
    pub profile_title: Option<String>,
    pub announce: Option<String>,
    pub profile_update_interval_hours: Option<u64>,
    pub profile_web_page_url: Option<String>,
    pub routing_enable: Option<bool>,
    pub subscription_userinfo: Option<String>,
}

pub fn insert_subscription(
    connection: &Connection,
    subscription: &NewSubscription,
) -> AppResult<SubscriptionRecord> {
    let now = Utc::now();
    connection.execute(
        r#"
        INSERT INTO subscriptions (
            id, url, name, created_at, updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5)
        "#,
        params![
            subscription.id,
            subscription.url,
            subscription.name,
            now.to_rfc3339(),
            now.to_rfc3339(),
        ],
    )?;
    get_subscription(connection, &subscription.id)
}

pub fn update_subscription_metadata(
    connection: &Connection,
    id: &str,
    metadata: &SubscriptionMetadata,
) -> AppResult<SubscriptionRecord> {
    let now = Utc::now();
    connection.execute(
        r#"
        UPDATE subscriptions
        SET profile_title = ?2,
            announce = ?3,
            profile_update_interval_hours = ?4,
            profile_web_page_url = ?5,
            routing_enable = ?6,
            subscription_userinfo = ?7,
            last_refresh_at = ?8,
            last_refresh_error = NULL,
            updated_at = ?9
        WHERE id = ?1
        "#,
        params![
            id,
            metadata.profile_title,
            metadata.announce,
            metadata.profile_update_interval_hours.map(|value| value as i64),
            metadata.profile_web_page_url,
            metadata.routing_enable.map(i64::from),
            metadata.subscription_userinfo,
            now.to_rfc3339(),
            now.to_rfc3339(),
        ],
    )?;
    get_subscription(connection, id)
}

pub fn set_refresh_error(
    connection: &Connection,
    id: &str,
    error: Option<&str>,
) -> AppResult<SubscriptionRecord> {
    let now = Utc::now();
    connection.execute(
        r#"
        UPDATE subscriptions
        SET last_refresh_error = ?2,
            updated_at = ?3
        WHERE id = ?1
        "#,
        params![id, error, now.to_rfc3339()],
    )?;
    get_subscription(connection, id)
}

pub fn list_subscriptions(connection: &Connection) -> AppResult<Vec<SubscriptionRecord>> {
    let mut statement = connection.prepare(
        r#"
        SELECT id, url, name, profile_title, announce, profile_update_interval_hours,
               profile_web_page_url, routing_enable, subscription_userinfo,
               last_refresh_at, last_refresh_error, created_at, updated_at
        FROM subscriptions
        ORDER BY created_at DESC, id DESC
        "#,
    )?;

    let rows = statement.query_map([], map_subscription)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

pub fn get_subscription(connection: &Connection, id: &str) -> AppResult<SubscriptionRecord> {
    connection
        .query_row(
            r#"
            SELECT id, url, name, profile_title, announce, profile_update_interval_hours,
                   profile_web_page_url, routing_enable, subscription_userinfo,
                   last_refresh_at, last_refresh_error, created_at, updated_at
            FROM subscriptions
            WHERE id = ?1
            "#,
            params![id],
            map_subscription,
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("subscription {id}")))
}

pub fn delete_subscription(connection: &Connection, id: &str) -> AppResult<bool> {
    let count = connection.execute("DELETE FROM subscriptions WHERE id = ?1", params![id])?;
    Ok(count > 0)
}

fn map_subscription(row: &Row<'_>) -> rusqlite::Result<SubscriptionRecord> {
    let update_interval: Option<i64> = row.get(5)?;
    let routing_enable: Option<i64> = row.get(7)?;
    let last_refresh_at = row.get::<_, Option<String>>(9)?.map(parse_datetime);
    let created_at = parse_datetime(row.get::<_, String>(11)?);
    let updated_at = parse_datetime(row.get::<_, String>(12)?);

    Ok(SubscriptionRecord {
        id: row.get(0)?,
        url: row.get(1)?,
        name: row.get(2)?,
        profile_title: row.get(3)?,
        announce: row.get(4)?,
        profile_update_interval_hours: update_interval.map(|value| value as u64),
        profile_web_page_url: row.get(6)?,
        routing_enable: routing_enable.map(|value| value != 0),
        subscription_userinfo: row.get(8)?,
        last_refresh_at,
        last_refresh_error: row.get(10)?,
        created_at,
        updated_at,
    })
}

fn parse_datetime(value: String) -> DateTime<Utc> {
    // A corrupt timestamp should not make the whole local store unreadable.
    DateTime::parse_from_rfc3339(&value)
        .map(|datetime| datetime.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now())
}
