use std::sync::{Arc, Mutex};

use rusqlite::Connection;

use crate::error::{AppError, AppResult};

pub mod schema;
pub mod servers;
pub mod settings;
pub mod subscriptions;

pub type DbPool = Arc<Mutex<Connection>>;

pub fn lock_pool(pool: &DbPool) -> AppResult<std::sync::MutexGuard<'_, Connection>> {
    pool.lock()
        .map_err(|_| AppError::Internal("db mutex poisoned".to_string()))
}

pub fn open(path: &std::path::Path) -> AppResult<DbPool> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    match try_open(path) {
        Ok(pool) => Ok(pool),
        Err(open_error) => {
            let backup = path.with_file_name(format!(
                "karst.sqlite3.corrupt.{}",
                chrono::Utc::now().format("%Y%m%d_%H%M%S")
            ));
            let _ = std::fs::rename(path, &backup);
            match try_open(path) {
                Ok(pool) => Ok(pool),
                Err(error) => Err(AppError::Internal(format!(
                    "database recreated after corruption (original error: {open_error}), but fresh open also failed: {error}",
                ))),
            }
        }
    }
}

fn try_open(path: &std::path::Path) -> AppResult<DbPool> {
    let connection = Connection::open(path)?;
    connection.pragma_update(None, "journal_mode", "WAL")?;
    connection.pragma_update(None, "busy_timeout", "5000")?;
    schema::run_migrations(&connection)?;
    Ok(Arc::new(Mutex::new(connection)))
}
