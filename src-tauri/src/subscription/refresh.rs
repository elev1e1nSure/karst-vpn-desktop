use uuid::Uuid;

use crate::db::servers::{self, NewServer};
use crate::db::subscriptions::{self, SubscriptionRecord};
use crate::db::DbPool;
use crate::error::{AppError, AppResult};
use crate::subscription::decode::decode_subscription;
use crate::subscription::fetch::fetch_subscription;
use crate::vless::model::VlessLink;
use crate::vless::parser::parse_subscription_body;

#[derive(Debug, Clone)]
pub struct ImportSummary {
    pub subscription_id: String,
    pub imported: usize,
    pub failed: usize,
    pub error: Option<String>,
}

pub async fn refresh(
    pool: DbPool,
    client: reqwest::Client,
    sub_id: String,
) -> AppResult<ImportSummary> {
    let subscription = get_subscription(&pool, &sub_id)?;
    let fetched = match fetch_subscription(&client, &subscription.url).await {
        Ok(fetched) => fetched,
        Err(error) => {
            set_refresh_error(&pool, &sub_id, &error.to_string())?;
            return Ok(ImportSummary {
                subscription_id: sub_id,
                imported: 0,
                failed: 0,
                error: Some(error.to_string()),
            });
        }
    };

    let decoded = decode_subscription(&fetched.body);
    let batch = parse_subscription_body(&decoded);
    let imported = batch.links.len();
    let failed = batch.failures.len();

    if imported == 0 {
        let error = if failed == 0 {
            "subscription contained no VLESS links".to_string()
        } else {
            format!("subscription contained no valid VLESS links ({failed} parse failures)")
        };
        set_refresh_error(&pool, &sub_id, &error)?;
        return Ok(ImportSummary {
            subscription_id: sub_id,
            imported,
            failed,
            error: Some(error),
        });
    }

    {
        let mut guard = lock_pool(&pool)?;
        let transaction = guard.transaction()?;
        servers::delete_servers_for_subscription(&transaction, &sub_id)?;
        for link in &batch.links {
            servers::insert_server(&transaction, &server_from_link(&sub_id, link))?;
        }
        subscriptions::update_subscription_metadata(&transaction, &sub_id, &fetched.metadata)?;
        transaction.commit()?;
    }

    Ok(ImportSummary {
        subscription_id: sub_id,
        imported,
        failed,
        error: None,
    })
}

pub async fn refresh_all(pool: DbPool, client: reqwest::Client) -> AppResult<Vec<ImportSummary>> {
    let subscriptions = {
        let guard = lock_pool(&pool)?;
        subscriptions::list_subscriptions(&guard)?
    };

    let mut summaries = Vec::with_capacity(subscriptions.len());
    for subscription in subscriptions {
        let subscription_id = subscription.id;
        match refresh(pool.clone(), client.clone(), subscription_id.clone()).await {
            Ok(summary) => summaries.push(summary),
            Err(error) => {
                let message = error.to_string();
                let _ = set_refresh_error(&pool, &subscription_id, &message);
                summaries.push(ImportSummary {
                    subscription_id,
                    imported: 0,
                    failed: 0,
                    error: Some(message),
                });
            }
        }
    }
    Ok(summaries)
}

fn get_subscription(pool: &DbPool, sub_id: &str) -> AppResult<SubscriptionRecord> {
    let guard = lock_pool(pool)?;
    subscriptions::get_subscription(&guard, sub_id)
}

fn set_refresh_error(pool: &DbPool, sub_id: &str, error: &str) -> AppResult<()> {
    let guard = lock_pool(pool)?;
    subscriptions::set_refresh_error(&guard, sub_id, Some(error))?;
    Ok(())
}

fn server_from_link(subscription_id: &str, link: &VlessLink) -> NewServer {
    NewServer {
        id: Uuid::new_v4().to_string(),
        subscription_id: Some(subscription_id.to_string()),
        name: link.name.clone(),
        vless_uri: link.raw.clone(),
        host: link.host.clone(),
        port: link.port,
        uuid: link.id.clone(),
        security: link.security.label().to_string(),
        transport: link.transport.label().to_string(),
        flow: link.flow.as_ref().map(|flow| flow.label().to_string()),
    }
}

fn lock_pool(
    pool: &DbPool,
) -> AppResult<std::sync::MutexGuard<'_, rusqlite::Connection>> {
    pool.lock()
        .map_err(|_| AppError::Database(rusqlite::Error::InvalidQuery))
}
