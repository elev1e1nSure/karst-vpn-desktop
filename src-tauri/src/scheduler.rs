use std::sync::{Arc, Mutex};
use std::time::Duration;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Manager};
use tokio::sync::watch;

use crate::app_log::{self, AppLog};
use crate::connection::manager::{ConnectionManager, ConnectionStatus};
use crate::db::lock_pool;
use crate::db::settings;
use crate::db::subscriptions::{self, SubscriptionRecord};
use crate::db::DbPool;
use crate::error::{AppError, AppResult};
use crate::subscription::refresh::refresh;

pub const MIN_REFRESH_HOURS: u64 = 1;
pub const MAX_REFRESH_HOURS: u64 = 24 * 365;
pub const DEFAULT_REFRESH_HOURS: u64 = 24;
const RETRY_DELAY_SECONDS: u64 = 15 * 60;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum AutoRefreshMode {
    Off,
    Auto,
    EveryHours,
}

impl AutoRefreshMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Off => "off",
            Self::Auto => "auto",
            Self::EveryHours => "every_hours",
        }
    }
}

impl TryFrom<&str> for AutoRefreshMode {
    type Error = AppError;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "off" => Ok(Self::Off),
            "auto" => Ok(Self::Auto),
            "every_hours" => Ok(Self::EveryHours),
            _ => Err(AppError::InvalidInput(format!(
                "invalid auto refresh mode: {value}"
            ))),
        }
    }
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

pub fn spawn(pool: DbPool, client: reqwest::Client, app: AppHandle) -> ScheduleHandle {
    let (sender, receiver) = watch::channel(());
    let task = tauri::async_runtime::spawn(run_scheduler(pool, client, app, receiver));

    ScheduleHandle {
        sender,
        task: Arc::new(Mutex::new(Some(task))),
    }
}

async fn run_scheduler(
    pool: DbPool,
    client: reqwest::Client,
    app: AppHandle,
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
            Err(error) => {
                app.state::<AppLog>().error(
                    app_log::Category::Service,
                    format!(
                        "subscription scheduler failed kind={} message={error}",
                        error.kind()
                    ),
                );
                Duration::from_secs(60 * 60)
            }
        };

        tokio::select! {
            changed = receiver.changed() => {
                if changed.is_err() {
                    break;
                }
            }
            _ = tokio::time::sleep(delay) => {
                if let Err(error) = refresh_due(pool.clone(), client.clone(), &app).await {
                    app.state::<AppLog>().error(
                        app_log::Category::Service,
                        format!(
                            "scheduled subscription refresh failed kind={} message={error}",
                            error.kind()
                        ),
                    );
                }
            }
        }
    }
}

fn next_delay(pool: &DbPool) -> AppResult<Option<Duration>> {
    let guard = lock_pool(pool)?;
    let mode = settings::get_auto_refresh_mode(&guard)?;

    match mode {
        AutoRefreshMode::Off => Ok(None),
        AutoRefreshMode::EveryHours | AutoRefreshMode::Auto => {
            let subscriptions = subscriptions::list_subscriptions(&guard)?;
            let configured_hours = settings::get_auto_refresh_hours(&guard)?;
            let now = Utc::now();
            let min_seconds = subscriptions
                .iter()
                .map(|subscription| {
                    seconds_until_due(subscription, &mode, configured_hours, now)
                })
                .min()
                .unwrap_or(DEFAULT_REFRESH_HOURS * 60 * 60)
                .max(60);
            Ok(Some(Duration::from_secs(min_seconds)))
        }
    }
}

async fn refresh_due(pool: DbPool, client: reqwest::Client, app: &AppHandle) -> AppResult<()> {
    let due_ids = {
        let guard = lock_pool(&pool)?;
        let mode = settings::get_auto_refresh_mode(&guard)?;
        if mode == AutoRefreshMode::Off {
            return Ok(());
        }
        let configured_hours = settings::get_auto_refresh_hours(&guard)?;
        let now = Utc::now();
        subscriptions::list_subscriptions(&guard)?
            .into_iter()
            .filter(|subscription| {
                seconds_until_due(subscription, &mode, configured_hours, now) == 0
            })
            .map(|subscription| subscription.id)
            .collect::<Vec<_>>()
    };

    if due_ids.is_empty() {
        return Ok(());
    }

    let vpn_connected = matches!(
        app.state::<ConnectionManager>().status(),
        Ok(ConnectionStatus::Connected { .. })
    );
    if vpn_connected {
        app.state::<AppLog>().info(
            app_log::Category::Net,
            "skipping subscription refresh while VPN is connected",
        );
        return Ok(());
    }

    for subscription_id in due_ids {
        let logs = app.state::<AppLog>();
        match refresh(pool.clone(), client.clone(), subscription_id.clone(), &*logs).await {
            Ok(summary) if summary.error.is_none() => app.state::<AppLog>().info(
                app_log::Category::Net,
                format!(
                    "scheduled subscription refresh finished id={} imported={} failed={}",
                    summary.subscription_id, summary.imported, summary.failed
                ),
            ),
            Ok(summary) => app.state::<AppLog>().warn(
                app_log::Category::Net,
                format!(
                    "scheduled subscription refresh completed with error id={} error={}",
                    summary.subscription_id,
                    summary.error.as_deref().unwrap_or("unknown")
                ),
            ),
            Err(error) => app.state::<AppLog>().error(
                app_log::Category::Net,
                format!(
                    "scheduled subscription refresh failed id={subscription_id} kind={} message={error}",
                    error.kind()
                ),
            ),
        }
    }
    Ok(())
}

fn seconds_until_due(
    subscription: &SubscriptionRecord,
    mode: &AutoRefreshMode,
    configured_hours: u64,
    now: chrono::DateTime<Utc>,
) -> u64 {
    let interval_seconds = match mode {
        AutoRefreshMode::Off => return u64::MAX,
        AutoRefreshMode::EveryHours => hours_to_seconds(configured_hours),
        AutoRefreshMode::Auto => hours_to_seconds(
            subscription
                .profile_update_interval_hours
                .unwrap_or(DEFAULT_REFRESH_HOURS),
        ),
    };
    let (last_attempt, delay_seconds) = if subscription.last_refresh_error.is_some() {
        (
            subscription.updated_at,
            RETRY_DELAY_SECONDS.min(interval_seconds),
        )
    } else {
        (
            subscription
                .last_refresh_at
                .unwrap_or(subscription.created_at),
            interval_seconds,
        )
    };
    let due_at = last_attempt + chrono::Duration::seconds(delay_seconds as i64);
    (due_at - now).num_seconds().max(0) as u64
}

pub fn normalize_refresh_hours(hours: u64) -> u64 {
    hours.clamp(MIN_REFRESH_HOURS, MAX_REFRESH_HOURS)
}

fn hours_to_seconds(hours: u64) -> u64 {
    normalize_refresh_hours(hours) * 60 * 60
}
