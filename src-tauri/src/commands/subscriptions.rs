use tauri::State;
use uuid::Uuid;

use crate::app_log::{self, redact_url, AppLog};
use crate::db;
use crate::db::subscriptions::{self, NewSubscription};
use crate::db::DbPool;
use crate::dto::{ImportSummaryDto, SubscriptionDto};
use crate::error::AppResult;
use crate::subscription::refresh::{refresh, refresh_all};

#[tauri::command]
pub fn list_subscriptions(pool: State<'_, DbPool>) -> AppResult<Vec<SubscriptionDto>> {
    let guard = db::lock_pool(pool.inner())?;
    subscriptions::list_subscriptions(&guard)
        .map(|records| records.into_iter().map(SubscriptionDto::from).collect())
}

#[tauri::command]
pub async fn add_subscription(
    pool: State<'_, DbPool>,
    client: State<'_, reqwest::Client>,
    logs: State<'_, AppLog>,
    url: String,
    name: Option<String>,
) -> AppResult<ImportSummaryDto> {
    logs.info(
        app_log::Category::Net,
        format!("subscription add requested url={}", redact_url(&url)),
    );
    let id = Uuid::new_v4().to_string();
    let subscription = NewSubscription {
        id: id.clone(),
        url,
        name: name.unwrap_or_else(|| "Subscription".to_string()),
    };
    {
        let guard = db::lock_pool(pool.inner())?;
        subscriptions::insert_subscription(&guard, &subscription)?;
    }

    let result = refresh(pool.inner().clone(), client.inner().clone(), id, &*logs)
        .await
        .map(ImportSummaryDto::from);
    match &result {
        Ok(summary) if summary.error.is_none() => logs.info(
            app_log::Category::Net,
            format!(
                "subscription import finished id={} imported={} failed={}",
                summary.subscription_id, summary.imported, summary.failed
            ),
        ),
        Ok(summary) => logs.warn(
            app_log::Category::Net,
            format!(
                "subscription import completed with error id={} imported={} failed={}",
                summary.subscription_id, summary.imported, summary.failed
            ),
        ),
        Err(error) => logs.error(
            app_log::Category::Net,
            format!("subscription import failed kind={}", error.kind()),
        ),
    }
    result
}

#[tauri::command]
pub async fn refresh_subscription(
    pool: State<'_, DbPool>,
    client: State<'_, reqwest::Client>,
    logs: State<'_, AppLog>,
    subscription_id: String,
) -> AppResult<ImportSummaryDto> {
    logs.info(
        app_log::Category::Net,
        format!("subscription refresh requested id={subscription_id}"),
    );
    let result = refresh(
        pool.inner().clone(),
        client.inner().clone(),
        subscription_id,
        &*logs,
    )
    .await
    .map(ImportSummaryDto::from);
    match &result {
        Ok(summary) => logs.info(
            app_log::Category::Net,
            format!(
                "subscription refresh finished id={} imported={} failed={} has_error={}",
                summary.subscription_id,
                summary.imported,
                summary.failed,
                summary.error.is_some()
            ),
        ),
        Err(error) => logs.error(
            app_log::Category::Net,
            format!("subscription refresh failed kind={}", error.kind()),
        ),
    }
    result
}

#[tauri::command]
pub async fn refresh_all_subscriptions(
    pool: State<'_, DbPool>,
    client: State<'_, reqwest::Client>,
    logs: State<'_, AppLog>,
) -> AppResult<Vec<ImportSummaryDto>> {
    logs.info(app_log::Category::Net, "subscription refresh all requested");
    let result = refresh_all(pool.inner().clone(), client.inner().clone(), &*logs)
        .await
        .map(|items| {
            items
                .into_iter()
                .map(ImportSummaryDto::from)
                .collect::<Vec<_>>()
        });
    match &result {
        Ok(items) => logs.info(
            app_log::Category::Net,
            format!("subscription refresh all finished count={}", items.len()),
        ),
        Err(error) => logs.error(
            app_log::Category::Net,
            format!("subscription refresh all failed kind={}", error.kind()),
        ),
    }
    result
}

#[tauri::command]
pub fn delete_subscription(
    pool: State<'_, DbPool>,
    logs: State<'_, AppLog>,
    subscription_id: String,
) -> AppResult<bool> {
    let guard = db::lock_pool(pool.inner())?;
    let result = subscriptions::delete_subscription(&guard, &subscription_id);
    match &result {
        Ok(deleted) => logs.info(
            app_log::Category::Net,
            format!("subscription delete requested id={subscription_id} deleted={deleted}"),
        ),
        Err(error) => logs.error(
            app_log::Category::Net,
            format!(
                "subscription delete failed kind={} message={error}",
                error.kind()
            ),
        ),
    }
    result
}
