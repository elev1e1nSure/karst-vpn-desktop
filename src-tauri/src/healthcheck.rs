use std::time::{Duration, Instant};

use tokio::net::TcpStream;

use crate::error::{AppError, AppResult};

pub async fn tcp_check(host: &str, port: u16, timeout: Duration) -> AppResult<()> {
    match tokio::time::timeout(timeout, TcpStream::connect((host, port))).await {
        Ok(Ok(_stream)) => Ok(()),
        Ok(Err(error)) => Err(AppError::Connection(format!(
            "server {host}:{port} unreachable: {error}"
        ))),
        Err(_) => Err(AppError::Connection(format!(
            "server {host}:{port} unreachable: timed out"
        ))),
    }
}

/// Resolves the server to `ip_cidr` literals for sing-box routing rules. Returns an empty vec on
/// resolution failure: the caller pairs this with a process-name rule that works regardless.
pub async fn resolve_server_cidrs(host: &str, port: u16) -> Vec<String> {
    let Ok(addresses) = tokio::net::lookup_host((host, port)).await else {
        return Vec::new();
    };

    let mut cidrs: Vec<String> = addresses
        .map(|address| match address.ip() {
            std::net::IpAddr::V4(ip) => format!("{ip}/32"),
            std::net::IpAddr::V6(ip) => format!("{ip}/128"),
        })
        .collect();
    cidrs.sort();
    cidrs.dedup();
    cidrs
}

/// TCP-connect latency in milliseconds; `None` if the server didn't respond in time.
pub async fn measure_latency(host: &str, port: u16, timeout: Duration) -> Option<u64> {
    let start = Instant::now();
    match tokio::time::timeout(timeout, TcpStream::connect((host, port))).await {
        Ok(Ok(_stream)) => Some(start.elapsed().as_millis() as u64),
        _ => None,
    }
}
