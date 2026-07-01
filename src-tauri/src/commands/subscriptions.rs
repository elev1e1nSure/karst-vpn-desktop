use tauri::State;
use uuid::Uuid;

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
    url: String,
    name: Option<String>,
) -> AppResult<ImportSummaryDto> {
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

    refresh(pool.inner().clone(), client.inner().clone(), id)
        .await
        .map(ImportSummaryDto::from)
}

#[tauri::command]
pub async fn refresh_subscription(
    pool: State<'_, DbPool>,
    client: State<'_, reqwest::Client>,
    subscription_id: String,
) -> AppResult<ImportSummaryDto> {
    refresh(
        pool.inner().clone(),
        client.inner().clone(),
        subscription_id,
    )
    .await
    .map(ImportSummaryDto::from)
}

#[tauri::command]
pub async fn refresh_all_subscriptions(
    pool: State<'_, DbPool>,
    client: State<'_, reqwest::Client>,
) -> AppResult<Vec<ImportSummaryDto>> {
    refresh_all(pool.inner().clone(), client.inner().clone())
        .await
        .map(|items| items.into_iter().map(ImportSummaryDto::from).collect())
}

#[tauri::command]
pub fn delete_subscription(pool: State<'_, DbPool>, subscription_id: String) -> AppResult<bool> {
    let guard = db::lock_pool(pool.inner())?;
    subscriptions::delete_subscription(&guard, &subscription_id)
}
