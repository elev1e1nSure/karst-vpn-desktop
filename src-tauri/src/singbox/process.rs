use std::path::{Path, PathBuf};

use serde_json::Value;
use tauri::AppHandle;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::io::AsyncWriteExt;
use tokio::task::JoinHandle;

use crate::error::{AppError, AppResult};

const LOG_FILE: &str = "sing-box.log";
const ROTATED_LOG_FILE: &str = "sing-box.log.1";
const MAX_LOG_BYTES: u64 = 1024 * 1024;

pub struct SingboxProcess {
    child: Option<CommandChild>,
    log_task: JoinHandle<()>,
}

impl SingboxProcess {
    pub async fn spawn(
        app: &AppHandle,
        config: &Value,
        app_data_dir: &Path,
    ) -> AppResult<Self> {
        tokio::fs::create_dir_all(app_data_dir).await?;
        let config_path = app_data_dir.join("sing-box-config.json");
        let config_bytes = serde_json::to_vec_pretty(config)?;
        tokio::fs::write(&config_path, config_bytes).await?;

        let log_path = app_data_dir.join(LOG_FILE);
        rotate_log_if_needed(&log_path).await?;

        let sidecar = app
            .shell()
            .sidecar("sing-box")
            .map_err(|error| AppError::Singbox(error.to_string()))?
            .args(["run", "-c"])
            .arg(&config_path)
            .current_dir(sidecar_working_dir()?);

        let (mut receiver, child) = sidecar
            .spawn()
            .map_err(|error| AppError::Singbox(error.to_string()))?;
        let log_task = tokio::spawn(async move {
            while let Some(event) = receiver.recv().await {
                let line = match event {
                    CommandEvent::Stdout(bytes) => prefixed_bytes("stdout", bytes),
                    CommandEvent::Stderr(bytes) => prefixed_bytes("stderr", bytes),
                    CommandEvent::Error(error) => format!("[shell-error] {error}\n").into_bytes(),
                    CommandEvent::Terminated(payload) => format!(
                        "[terminated] code={:?} signal={:?}\n",
                        payload.code, payload.signal
                    )
                    .into_bytes(),
                    _ => continue,
                };

                let _ = append_log(&log_path, &line).await;
            }
        });

        Ok(Self {
            child: Some(child),
            log_task,
        })
    }

    pub fn stop(&mut self) -> AppResult<()> {
        if let Some(child) = self.child.take() {
            child
                .kill()
                .map_err(|error| AppError::Singbox(error.to_string()))?;
        }
        self.log_task.abort();
        Ok(())
    }
}

impl Drop for SingboxProcess {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

fn sidecar_working_dir() -> AppResult<PathBuf> {
    let path = if cfg!(debug_assertions) {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries")
    } else {
        std::env::current_exe()?
            .parent()
            .ok_or_else(|| {
                AppError::Io(std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    "current executable has no parent directory",
                ))
            })?
            .to_path_buf()
    };

    // wintun.dll must be in the sidecar DLL search path when sing-box starts.
    Ok(path)
}

fn prefixed_bytes(prefix: &str, bytes: Vec<u8>) -> Vec<u8> {
    let mut output = format!("[{prefix}] ").into_bytes();
    output.extend(bytes);
    if !output.ends_with(b"\n") {
        output.push(b'\n');
    }
    output
}

async fn append_log(path: &Path, bytes: &[u8]) -> AppResult<()> {
    rotate_log_if_needed(path).await?;
    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .await?;
    file.write_all(bytes).await?;
    Ok(())
}

async fn rotate_log_if_needed(path: &Path) -> AppResult<()> {
    let metadata = match tokio::fs::metadata(path).await {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(AppError::Io(error)),
    };

    if metadata.len() <= MAX_LOG_BYTES {
        return Ok(());
    }

    let rotated = path.with_file_name(ROTATED_LOG_FILE);
    if tokio::fs::metadata(&rotated).await.is_ok() {
        tokio::fs::remove_file(&rotated).await?;
    }
    tokio::fs::rename(path, rotated).await?;
    Ok(())
}
