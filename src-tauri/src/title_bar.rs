#[cfg(windows)]
pub fn set_dark_caption(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    use std::ffi::c_void;

    use windows_sys::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_CAPTION_COLOR};

    // COLORREF uses BGR byte order; this is #141312 in RGB.
    const CAPTION_COLOR: u32 = 0x0012_1314;
    let caption_color = CAPTION_COLOR;
    let hwnd = window.hwnd()?;
    let result = unsafe {
        DwmSetWindowAttribute(
            hwnd.0,
            DWMWA_CAPTION_COLOR as u32,
            &caption_color as *const u32 as *const c_void,
            std::mem::size_of_val(&caption_color) as u32,
        )
    };

    if result < 0 {
        return Err(std::io::Error::from_raw_os_error(result).into());
    }

    Ok(())
}

#[cfg(not(windows))]
pub fn set_dark_caption(_window: &tauri::WebviewWindow) -> tauri::Result<()> {
    Ok(())
}
