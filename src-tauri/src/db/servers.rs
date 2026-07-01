use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone)]
pub struct ServerRecord {
    pub id: String,
    pub subscription_id: Option<String>,
    pub name: String,
    pub vless_uri: String,
    pub host: String,
    pub port: u16,
    pub uuid: String,
    pub security: String,
    pub transport: String,
    pub flow: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct NewServer {
    pub id: String,
    pub subscription_id: Option<String>,
    pub name: String,
    pub vless_uri: String,
    pub host: String,
    pub port: u16,
    pub uuid: String,
    pub security: String,
    pub transport: String,
    pub flow: Option<String>,
}

pub fn insert_server(connection: &Connection, server: &NewServer) -> AppResult<ServerRecord> {
    let now = Utc::now();
    connection.execute(
        r#"
        INSERT INTO servers (
            id, subscription_id, name, vless_uri, host, port, uuid,
            security, transport, flow, created_at, updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
        "#,
        params![
            server.id,
            server.subscription_id,
            server.name,
            server.vless_uri,
            server.host,
            i64::from(server.port),
            server.uuid,
            server.security,
            server.transport,
            server.flow,
            now.to_rfc3339(),
            now.to_rfc3339(),
        ],
    )?;
    get_server(connection, &server.id)
}

pub fn delete_servers_for_subscription(
    connection: &Connection,
    subscription_id: &str,
) -> AppResult<usize> {
    let count = connection.execute(
        "DELETE FROM servers WHERE subscription_id = ?1",
        params![subscription_id],
    )?;
    Ok(count)
}

pub fn list_servers(connection: &Connection) -> AppResult<Vec<ServerRecord>> {
    let mut statement = connection.prepare(
        r#"
        SELECT id, subscription_id, name, vless_uri, host, port, uuid,
               security, transport, flow, created_at, updated_at
        FROM servers
        ORDER BY created_at DESC, id DESC
        "#,
    )?;

    let rows = statement.query_map([], map_server)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

pub fn get_server(connection: &Connection, id: &str) -> AppResult<ServerRecord> {
    connection
        .query_row(
            r#"
            SELECT id, subscription_id, name, vless_uri, host, port, uuid,
                   security, transport, flow, created_at, updated_at
            FROM servers
            WHERE id = ?1
            "#,
            params![id],
            map_server,
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("server {id}")))
}

pub fn delete_server(connection: &Connection, id: &str) -> AppResult<bool> {
    let count = connection.execute("DELETE FROM servers WHERE id = ?1", params![id])?;
    Ok(count > 0)
}

fn map_server(row: &Row<'_>) -> rusqlite::Result<ServerRecord> {
    let port: i64 = row.get(5)?;
    let created_at = parse_datetime(row.get::<_, String>(10)?);
    let updated_at = parse_datetime(row.get::<_, String>(11)?);

    Ok(ServerRecord {
        id: row.get(0)?,
        subscription_id: row.get(1)?,
        name: row.get(2)?,
        vless_uri: row.get(3)?,
        host: row.get(4)?,
        port: port as u16,
        uuid: row.get(6)?,
        security: row.get(7)?,
        transport: row.get(8)?,
        flow: row.get(9)?,
        created_at,
        updated_at,
    })
}

fn parse_datetime(value: String) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(&value)
        .map(|datetime| datetime.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now())
}
