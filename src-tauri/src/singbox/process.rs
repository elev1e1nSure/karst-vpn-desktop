use std::path::{Path, PathBuf};

use chrono::Utc;
use serde_json::Value;
use tauri::AppHandle;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::io::AsyncWriteExt;
use tokio::sync::watch;
use tokio::task::JoinHandle;

use crate::error::{AppError, AppResult};

use super::process_guard::{self, ProcessGuard};

const LOG_FILE: &str = "sing-box.log";
const ROTATED_LOG_FILE: &str = "sing-box.log.1";
const PID_FILE: &str = "sing-box.pid";
const MAX_LOG_BYTES: u64 = 1024 * 1024;
const STARTUP_STABILITY_DELAY: std::time::Duration = std::time::Duration::from_millis(750);

#[derive(Debug, Clone)]
pub struct ProcessExit {
    pub message: String,
}

pub struct SingboxProcess {
    child: Option<CommandChild>,
    log_task: JoinHandle<()>,
    exit: watch::Receiver<Option<ProcessExit>>,
    pid_path: PathBuf,
    _guard: ProcessGuard,
}

impl SingboxProcess {
    pub async fn spawn(app: &AppHandle, config: &Value, app_data_dir: &Path) -> AppResult<Self> {
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
        let pid = child.pid();
        let guard = match ProcessGuard::attach(pid) {
            Ok(guard) => guard,
            Err(error) => {
                let _ = child.kill();
                return Err(error);
            }
        };
        let pid_path = app_data_dir.join(PID_FILE);
        tokio::fs::write(&pid_path, pid.to_string()).await?;

        let (exit_tx, exit_rx) = watch::channel(None);
        let task_pid_path = pid_path.clone();
        let log_task = tokio::spawn(async move {
            let mut observed_exit = false;
            while let Some(event) = receiver.recv().await {
                let exit = match &event {
                    CommandEvent::Terminated(payload) => Some(ProcessExit {
                        message: format!(
                            "sing-box terminated code={:?} signal={:?}",
                            payload.code, payload.signal
                        ),
                    }),
                    _ => None,
                };
                let line = format_event(&event);
                let _ = append_log(&log_path, line.as_bytes()).await;
                if let Some(exit) = exit {
                    observed_exit = true;
                    let _ = tokio::fs::remove_file(&task_pid_path).await;
                    exit_tx.send_replace(Some(exit));
                }
            }
            if !observed_exit {
                let _ = tokio::fs::remove_file(&task_pid_path).await;
                exit_tx.send_replace(Some(ProcessExit {
                    message: "sing-box event stream closed unexpectedly".to_string(),
                }));
            }
        });

        Ok(Self {
            child: Some(child),
            log_task,
            exit: exit_rx,
            pid_path,
            _guard: guard,
        })
    }

    pub fn exit_receiver(&self) -> watch::Receiver<Option<ProcessExit>> {
        self.exit.clone()
    }

    pub async fn ensure_stable(&mut self) -> AppResult<()> {
        if let Some(exit) = self.exit.borrow().clone() {
            return Err(AppError::Singbox(exit.message));
        }

        tokio::select! {
            _ = tokio::time::sleep(STARTUP_STABILITY_DELAY) => Ok(()),
            changed = self.exit.changed() => {
                changed.map_err(|_| AppError::Singbox("sing-box exit monitor closed during startup".to_string()))?;
                let message = self.exit.borrow().as_ref()
                    .map(|exit| exit.message.clone())
                    .unwrap_or_else(|| "sing-box terminated during startup".to_string());
                Err(AppError::Singbox(message))
            }
        }
    }

    pub async fn stop(&mut self) -> AppResult<()> {
        if let Some(child) = self.child.take() {
            child
                .kill()
                .map_err(|error| AppError::Singbox(error.to_string()))?;

            self.wait_for_exit().await?;
        }
        self.log_task.abort();
        remove_pid_file(&self.pid_path)?;
        Ok(())
    }

    pub fn terminate_now(&mut self) -> AppResult<()> {
        if let Some(child) = self.child.take() {
            child
                .kill()
                .map_err(|error| AppError::Singbox(error.to_string()))?;
        }
        self.log_task.abort();
        remove_pid_file(&self.pid_path)?;
        Ok(())
    }

    async fn wait_for_exit(&mut self) -> AppResult<()> {
        if self.exit.borrow().is_some() {
            return Ok(());
        }
        tokio::time::timeout(std::time::Duration::from_secs(5), self.exit.changed())
            .await
            .map_err(|_| {
                AppError::Singbox("sing-box did not terminate within 5 seconds".to_string())
            })?
            .map_err(|_| {
                AppError::Singbox("sing-box exit monitor closed unexpectedly".to_string())
            })?;
        Ok(())
    }
}

impl Drop for SingboxProcess {
    fn drop(&mut self) {
        let _ = self.terminate_now();
    }
}

pub fn recover_stale_process(app_data_dir: &Path) -> AppResult<()> {
    process_guard::recover_stale_process(&app_data_dir.join(PID_FILE), &sidecar_working_dir()?)
}

fn remove_pid_file(path: &Path) -> AppResult<()> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
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

    Ok(path)
}

fn format_event(event: &CommandEvent) -> String {
    let timestamp = Utc::now().format("%Y-%m-%d %H:%M:%S%.3f");
    match event {
        CommandEvent::Stdout(bytes) => {
            let text = String::from_utf8_lossy(bytes);
            format!(
                "[{}] [DEBUG] [CORE] stdout: {}",
                timestamp,
                text.trim_end()
            )
        }
        CommandEvent::Stderr(bytes) => {
            let text = String::from_utf8_lossy(bytes);
            format!(
                "[{}] [DEBUG] [CORE] stderr: {}",
                timestamp,
                text.trim_end()
            )
        }
        CommandEvent::Error(error) => {
            format!(
                "[{}] [ERROR] [CORE] shell-error: {}",
                timestamp, error
            )
        }
        CommandEvent::Terminated(payload) => {
            format!(
                "[{}] [INFO] [CORE] terminated code={:?} signal={:?}",
                timestamp, payload.code, payload.signal
            )
        }
        _ => String::new(),
    }
}

async fn append_log(path: &Path, bytes: &[u8]) -> AppResult<()> {
    rotate_log_if_needed(path).await?;
    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .await?;
    file.write_all(bytes).await?;
    file.write_all(b"\n").await?;
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
