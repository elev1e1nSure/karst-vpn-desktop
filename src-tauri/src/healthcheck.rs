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

/// TCP-connect latency in milliseconds; `None` if the server didn't respond in time.
pub async fn measure_latency(host: &str, port: u16, timeout: Duration) -> Option<u64> {
    let start = Instant::now();
    match tokio::time::timeout(timeout, TcpStream::connect((host, port))).await {
        Ok(Ok(_stream)) => Some(start.elapsed().as_millis() as u64),
        _ => None,
    }
}
