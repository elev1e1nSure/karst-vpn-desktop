use rusqlite::Connection;

use crate::error::AppResult;

pub fn run_migrations(connection: &Connection) -> AppResult<()> {
    connection.pragma_update(None, "foreign_keys", "ON")?;
    connection.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS subscriptions (
            id TEXT PRIMARY KEY NOT NULL,
            url TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            profile_title TEXT,
            announce TEXT,
            profile_update_interval_hours INTEGER,
            profile_web_page_url TEXT,
            routing_enable INTEGER,
            subscription_userinfo TEXT,
            last_refresh_at TEXT,
            last_refresh_error TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS servers (
            id TEXT PRIMARY KEY NOT NULL,
            subscription_id TEXT REFERENCES subscriptions(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            vless_uri TEXT NOT NULL,
            host TEXT NOT NULL,
            port INTEGER NOT NULL,
            uuid TEXT NOT NULL,
            security TEXT NOT NULL,
            transport TEXT NOT NULL,
            flow TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_servers_subscription_id
            ON servers(subscription_id);

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        "#,
    )?;
    Ok(())
}
