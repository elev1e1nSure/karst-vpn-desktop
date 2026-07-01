use std::sync::{Arc, Mutex};
use std::time::Duration;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::async_runtime::JoinHandle;
use tokio::sync::watch;

use crate::db::lock_pool;
use crate::db::settings::{
    self, AUTO_REFRESH_AUTO, AUTO_REFRESH_EVERY_HOURS, AUTO_REFRESH_OFF,
};
use crate::db::subscriptions;
use crate::db::DbPool;
use crate::error::{AppError, AppResult};
use crate::subscription::refresh::refresh_all;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum AutoRefreshMode {
    Off,
    Auto,
    EveryHours,
}

pub struct ScheduleHandle {
    sender: watch::Sender<()>,
    task: Arc<Mutex<Option<JoinHandle<()>>>>,
}

impl ScheduleHandle {
    pub fn notify_settings_changed(&self) {
        let _ = self.sender.send(());
    }
}

impl Drop for ScheduleHandle {
    fn drop(&mut self) {
        if let Ok(mut task) = self.task.lock() {
            if let Some(task) = task.take() {
                task.abort();
            }
        }
    }
}

pub fn spawn(pool: DbPool, client: reqwest::Client) -> ScheduleHandle {
    let (sender, receiver) = watch::channel(());
    let task = tauri::async_runtime::spawn(run_scheduler(pool, client, receiver));

    ScheduleHandle {
        sender,
        task: Arc::new(Mutex::new(Some(task))),
    }
}

async fn run_scheduler(
    pool: DbPool,
    client: reqwest::Client,
    mut receiver: watch::Receiver<()>,
) {
    loop {
        let delay = match next_delay(&pool) {
            Ok(Some(delay)) => delay,
            Ok(None) => {
                if receiver.changed().await.is_err() {
                    break;
                }
                continue;
            }
            Err(_) => Duration::from_secs(60 * 60),
        };

        tokio::select! {
            changed = receiver.changed() => {
                if changed.is_err() {
                    break;
                }
            }
            _ = tokio::time::sleep(delay) => {
                let _ = refresh_all(pool.clone(), client.clone()).await;
            }
        }
    }
}

fn next_delay(pool: &DbPool) -> AppResult<Option<Duration>> {
    let guard = lock_pool(pool)?;
    let mode = settings::get_auto_refresh_mode(&guard)?;

    match mode.as_str() {
        AUTO_REFRESH_OFF => Ok(None),
        AUTO_REFRESH_EVERY_HOURS => {
            let hours = settings::get_auto_refresh_hours(&guard)?;
            Ok(Some(Duration::from_secs(hours * 60 * 60)))
        }
        AUTO_REFRESH_AUTO => {
            let subscriptions = subscriptions::list_subscriptions(&guard)?;
            let now = Utc::now();
            let mut min_seconds = 24 * 60 * 60;

            for subscription in subscriptions {
                if let Some(hours) = subscription.profile_update_interval_hours {
                    let interval_seconds = hours.max(1) * 60 * 60;
                    let ttl_seconds = subscription
                        .last_refresh_at
                        .map(|last| {
                            let due_at = last + chrono::Duration::seconds(interval_seconds as i64);
                            (due_at - now).num_seconds().max(60) as u64
                        })
                        .unwrap_or(interval_seconds);
                    min_seconds = min_seconds.min(ttl_seconds);
                }
            }

            Ok(Some(Duration::from_secs(min_seconds)))
        }
        _ => Err(AppError::InvalidInput(format!(
            "invalid auto refresh mode: {mode}"
        ))),
    }
}
