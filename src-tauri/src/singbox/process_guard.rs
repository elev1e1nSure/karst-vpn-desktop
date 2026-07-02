use std::path::Path;

use crate::error::AppResult;

#[cfg(windows)]
mod platform {
    use std::ffi::OsString;
    use std::mem::size_of;
    use std::os::windows::ffi::OsStringExt;
    use std::path::{Path, PathBuf};
    use std::ptr;

    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, WAIT_OBJECT_0};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, TerminateProcess, WaitForSingleObject,
        PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SET_QUOTA, PROCESS_TERMINATE,
    };

    use crate::error::{AppError, AppResult};

    const SYNCHRONIZE_ACCESS: u32 = 0x0010_0000;
    const TERMINATION_TIMEOUT_MS: u32 = 5_000;

    pub struct ProcessGuard {
        _job: OwnedHandle,
    }

    impl ProcessGuard {
        pub fn attach(pid: u32) -> AppResult<Self> {
            let job = unsafe { CreateJobObjectW(ptr::null(), ptr::null()) };
            let job = OwnedHandle::new(job, "create sing-box job object")?;

            let mut information = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            information.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let configured = unsafe {
                SetInformationJobObject(
                    job.raw(),
                    JobObjectExtendedLimitInformation,
                    (&raw const information).cast(),
                    size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                )
            };
            if configured == 0 {
                return Err(last_error("configure sing-box job object"));
            }

            let process = open_process(pid, PROCESS_SET_QUOTA | PROCESS_TERMINATE)?;
            let assigned = unsafe { AssignProcessToJobObject(job.raw(), process.raw()) };
            if assigned == 0 {
                return Err(last_error("assign sing-box to job object"));
            }

            Ok(Self { _job: job })
        }
    }

    pub fn terminate_stale_process(pid: u32, expected_directory: &Path) -> AppResult<()> {
        let process = match open_process(
            pid,
            PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE | SYNCHRONIZE_ACCESS,
        ) {
            Ok(process) => process,
            Err(AppError::Io(error)) if error.raw_os_error() == Some(87) => return Ok(()),
            Err(error) => return Err(error),
        };

        let executable = process_image_path(process.raw())?;
        if !is_expected_singbox_executable(&executable, expected_directory) {
            return Ok(());
        }

        if unsafe { TerminateProcess(process.raw(), 1) } == 0 {
            return Err(last_error("terminate stale sing-box process"));
        }
        if unsafe { WaitForSingleObject(process.raw(), TERMINATION_TIMEOUT_MS) } != WAIT_OBJECT_0 {
            return Err(AppError::Singbox(
                "stale sing-box process did not terminate within 5 seconds".to_string(),
            ));
        }
        Ok(())
    }

    fn open_process(pid: u32, access: u32) -> AppResult<OwnedHandle> {
        let handle = unsafe { OpenProcess(access, 0, pid) };
        OwnedHandle::new(handle, "open sing-box process")
    }

    fn process_image_path(process: HANDLE) -> AppResult<PathBuf> {
        let mut buffer = vec![0u16; 32_768];
        let mut length = buffer.len() as u32;
        if unsafe { QueryFullProcessImageNameW(process, 0, buffer.as_mut_ptr(), &mut length) } == 0
        {
            return Err(last_error("inspect stale sing-box process"));
        }
        buffer.truncate(length as usize);
        Ok(PathBuf::from(OsString::from_wide(&buffer)))
    }

    fn is_expected_singbox_executable(path: &Path, expected_directory: &Path) -> bool {
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            return false;
        };
        let expected_parent = expected_directory.to_string_lossy();
        let actual_parent = path.parent().map(|parent| parent.to_string_lossy());
        actual_parent.is_some_and(|parent| parent.eq_ignore_ascii_case(&expected_parent))
            && matches!(
                name.to_ascii_lowercase().as_str(),
                "sing-box.exe" | "sing-box-x86_64-pc-windows-msvc.exe"
            )
    }

    fn last_error(context: &str) -> AppError {
        AppError::Io(std::io::Error::other(format!(
            "{context}: {}",
            std::io::Error::last_os_error()
        )))
    }

    struct OwnedHandle(HANDLE);

    // Kernel handles remain valid across threads; ownership still stays unique in this wrapper.
    unsafe impl Send for OwnedHandle {}

    impl OwnedHandle {
        fn new(handle: HANDLE, context: &str) -> AppResult<Self> {
            if handle.is_null() {
                return Err(last_error(context));
            }
            Ok(Self(handle))
        }

        fn raw(&self) -> HANDLE {
            self.0
        }
    }

    impl Drop for OwnedHandle {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
}

#[cfg(not(windows))]
mod platform {
    use crate::error::AppResult;

    pub struct ProcessGuard;

    impl ProcessGuard {
        pub fn attach(_pid: u32) -> AppResult<Self> {
            Ok(Self)
        }
    }

    pub fn terminate_stale_process(
        _pid: u32,
        _expected_directory: &std::path::Path,
    ) -> AppResult<()> {
        Ok(())
    }
}

pub use platform::ProcessGuard;

pub fn recover_stale_process(pid_path: &Path, expected_directory: &Path) -> AppResult<()> {
    let pid = match std::fs::read_to_string(pid_path) {
        Ok(value) => match value.trim().parse::<u32>() {
            Ok(pid) => pid,
            Err(_) => {
                std::fs::remove_file(pid_path)?;
                return Ok(());
            }
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.into()),
    };

    platform::terminate_stale_process(pid, expected_directory)?;
    match std::fs::remove_file(pid_path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}
