use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use chrono::Utc;
use url::Url;

use crate::error::{AppError, AppResult};

const APP_LOG_FILE: &str = "app.log";
const SINGBOX_LOG_FILE: &str = "sing-box.log";
const SINGBOX_ROTATED_LOG_FILE: &str = "sing-box.log.1";
const MAX_APP_LOG_BYTES: u64 = 512 * 1024;
const MAX_LIST_BYTES: u64 = 256 * 1024;
const MAX_LINES: usize = 500;

pub struct AppLog {
    app_data_dir: PathBuf,
    lock: Mutex<()>,
}

#[derive(Debug, Clone)]
pub struct LogEntry {
    pub source: String,
    pub message: String,
}

impl AppLog {
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self {
            app_data_dir,
            lock: Mutex::new(()),
        }
    }

    pub fn info(&self, message: impl AsRef<str>) {
        let _ = self.write("info", message.as_ref());
    }

    pub fn warn(&self, message: impl AsRef<str>) {
        let _ = self.write("warn", message.as_ref());
    }

    pub fn error(&self, message: impl AsRef<str>) {
        let _ = self.write("error", message.as_ref());
    }

    pub fn list(&self) -> AppResult<Vec<LogEntry>> {
        let _guard = self.lock()?;
        let mut entries = Vec::new();

        self.extend_file(
            &mut entries,
            "sing-box.1",
            &self.app_data_dir.join(SINGBOX_ROTATED_LOG_FILE),
        )?;
        self.extend_file(
            &mut entries,
            "sing-box",
            &self.app_data_dir.join(SINGBOX_LOG_FILE),
        )?;
        self.extend_file(&mut entries, "app", &self.path())?;

        if entries.len() > MAX_LINES {
            entries = entries.split_off(entries.len() - MAX_LINES);
        }

        Ok(entries)
    }

    pub fn clear(&self) -> AppResult<()> {
        let _guard = self.lock()?;
        for path in [
            self.path(),
            self.app_data_dir.join(SINGBOX_LOG_FILE),
            self.app_data_dir.join(SINGBOX_ROTATED_LOG_FILE),
        ] {
            match fs::remove_file(path) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(AppError::Io(error)),
            }
        }
        Ok(())
    }

    fn write(&self, level: &str, message: &str) -> AppResult<()> {
        let _guard = self.lock()?;
        fs::create_dir_all(&self.app_data_dir)?;
        self.rotate_if_needed()?;

        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.path())?;
        writeln!(
            file,
            "[{}] [{}] {}",
            Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
            level,
            message.replace(['\r', '\n'], " ")
        )?;
        Ok(())
    }

    fn extend_file(&self, entries: &mut Vec<LogEntry>, source: &str, path: &Path) -> AppResult<()> {
        let text = match read_tail(path, MAX_LIST_BYTES) {
            Ok(text) => text,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(error) => return Err(AppError::Io(error)),
        };

        if text.is_empty() {
            return Ok(());
        }

        for line in text.lines().map(str::trim).filter(|line| !line.is_empty()) {
            entries.push(LogEntry {
                source: source.to_string(),
                message: line.to_string(),
            });
        }
        Ok(())
    }

    fn rotate_if_needed(&self) -> AppResult<()> {
        let path = self.path();
        let metadata = match fs::metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(error) => return Err(AppError::Io(error)),
        };

        if metadata.len() <= MAX_APP_LOG_BYTES {
            return Ok(());
        }

        fs::write(path, "")?;
        Ok(())
    }

    fn path(&self) -> PathBuf {
        self.app_data_dir.join(APP_LOG_FILE)
    }

    fn lock(&self) -> AppResult<std::sync::MutexGuard<'_, ()>> {
        self.lock
            .lock()
            .map_err(|_| AppError::Internal("app log lock poisoned".to_string()))
    }
}

pub fn redact_url(raw: &str) -> String {
    match Url::parse(raw) {
        Ok(url) => {
            let host = url.host_str().unwrap_or("unknown-host");
            let port = url
                .port()
                .map(|value| format!(":{value}"))
                .unwrap_or_default();
            format!("{}://{}{}", url.scheme(), host, port)
        }
        Err(_) => "invalid-url".to_string(),
    }
}

fn read_tail(path: &Path, max_bytes: u64) -> std::io::Result<String> {
    let mut file = fs::File::open(path)?;
    let len = file.metadata()?.len();
    if len > max_bytes {
        use std::io::Seek;
        file.seek(std::io::SeekFrom::Start(len - max_bytes))?;
    }

    let mut bytes = Vec::new();
    use std::io::Read;
    file.read_to_end(&mut bytes)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}
