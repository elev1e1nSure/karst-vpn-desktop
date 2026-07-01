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

    let connection = Connection::open(path)?;
    schema::run_migrations(&connection)?;
    Ok(Arc::new(Mutex::new(connection)))
}
