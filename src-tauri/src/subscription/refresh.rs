use std::collections::HashSet;

use uuid::Uuid;

use crate::app_log::{self, AppLog};
use crate::db::servers::{self, NewServer};
use crate::db::subscriptions::{self, SubscriptionRecord};
use crate::db::{lock_pool, DbPool};
use crate::error::AppResult;
use crate::subscription::decode::decode_subscription;
use crate::subscription::fetch::fetch_subscription;
use crate::vless::model::VlessLink;
use crate::vless::parser::parse_subscription_body;
use crate::vless::xray_json::extract_vless_uris;

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
    logs: &AppLog,
) -> AppResult<ImportSummary> {
    let subscription = get_subscription(&pool, &sub_id)?;

    logs.info(
        app_log::Category::Net,
        format!(
            "fetching subscription id={} name={}",
            sub_id, subscription.name
        ),
    );
    let fetched = match fetch_subscription(&client, &subscription.url).await {
        Ok(fetched) => {
            logs.info(
                app_log::Category::Net,
                format!(
                    "subscription fetched id={} size={}",
                    sub_id,
                    fetched.body.len()
                ),
            );
            fetched
        }
        Err(error) => {
            logs.error(
                app_log::Category::Net,
                format!(
                    "subscription fetch failed id={sub_id} message={error}",
                ),
            );
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
    let source = match extract_vless_uris(&decoded) {
        Some(uris) => uris.join("\n"),
        None => decoded,
    };
    let batch = parse_subscription_body(&source);
    let mut seen = HashSet::new();
    let links = batch
        .links
        .iter()
        .filter(|link| seen.insert(link.raw.as_str()))
        .collect::<Vec<_>>();
    let imported = links.len();
    let failed = batch.failures.len();

    logs.info(
        app_log::Category::Link,
        format!(
            "subscription parsed id={sub_id} valid={imported} failed_parse={failed}",
        ),
    );

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
        for link in links {
            servers::insert_server(&transaction, &server_from_link(&sub_id, link))?;
        }
        subscriptions::update_subscription_metadata(&transaction, &sub_id, &fetched.metadata)?;
        transaction.commit()?;
    }

    logs.info(
        app_log::Category::Db,
        format!(
            "subscription servers updated id={sub_id} count={imported}",
        ),
    );

    Ok(ImportSummary {
        subscription_id: sub_id,
        imported,
        failed,
        error: None,
    })
}

pub async fn refresh_all(
    pool: DbPool,
    client: reqwest::Client,
    logs: &AppLog,
) -> AppResult<Vec<ImportSummary>> {
    let subscriptions = {
        let guard = lock_pool(&pool)?;
        subscriptions::list_subscriptions(&guard)?
    };

    logs.info(
        app_log::Category::Net,
        format!("refreshing {} subscriptions", subscriptions.len()),
    );

    let mut summaries = Vec::with_capacity(subscriptions.len());
    for subscription in subscriptions {
        let subscription_id = subscription.id;
        match refresh(pool.clone(), client.clone(), subscription_id.clone(), logs).await {
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
    let identity = format!("{subscription_id}\n{}", link.raw);
    NewServer {
        id: Uuid::new_v5(&Uuid::NAMESPACE_URL, identity.as_bytes()).to_string(),
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
