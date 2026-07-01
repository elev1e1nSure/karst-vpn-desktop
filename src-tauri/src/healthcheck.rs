use std::time::Duration;

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
