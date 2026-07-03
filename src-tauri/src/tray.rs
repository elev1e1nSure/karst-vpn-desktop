use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};

use crate::app_log::{self, AppLog};
use crate::connection::manager::{ConnectionManager, ConnectionStatus};

const MENU_OPEN: &str = "open";
const MENU_DISCONNECT: &str = "disconnect";
const MENU_QUIT: &str = "quit";

pub struct TrayController {
    _icon: TrayIcon<Wry>,
    disconnect: MenuItem<Wry>,
    open: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

pub fn create(app: &AppHandle) -> tauri::Result<TrayController> {
    let open = MenuItem::with_id(app, MENU_OPEN, "Открыть Karst VPN", true, None::<&str>)?;
    let disconnect =
        MenuItem::with_id(app, MENU_DISCONNECT, "Отключить VPN", false, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, MENU_QUIT, "Выйти", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &disconnect, &separator, &quit])?;

    let mut builder = TrayIconBuilder::new()
        .tooltip("Karst VPN")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            MENU_OPEN => show_main_window(app),
            MENU_DISCONNECT => disconnect_tunnel(app),
            MENU_QUIT => crate::lifecycle::request_exit(app, 0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    let icon = builder.build(app)?;

    Ok(TrayController {
        _icon: icon,
        disconnect,
        open,
        quit,
    })
}

pub fn show_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        app.state::<AppLog>().error(
            app_log::Category::Service,
            "main window is unavailable",
        );
        return;
    };

    if let Err(error) = window.unminimize() {
        app.state::<AppLog>().error(
            app_log::Category::Service,
            format!("failed to unminimize main window: {error}"),
        );
    }
    if let Err(error) = window.show() {
        app.state::<AppLog>().error(
            app_log::Category::Service,
            format!("failed to show main window: {error}"),
        );
        return;
    }
    if let Err(error) = window.set_focus() {
        app.state::<AppLog>().error(
            app_log::Category::Service,
            format!("failed to focus main window: {error}"),
        );
    }
}

pub fn update_connection_status(app: &AppHandle, status: &ConnectionStatus) {
    let Some(controller) = app.try_state::<TrayController>() else {
        return;
    };
    let can_disconnect = matches!(
        status,
        ConnectionStatus::Connecting { .. } | ConnectionStatus::Connected { .. }
    );
    if let Err(error) = controller.disconnect.set_enabled(can_disconnect) {
        app.state::<AppLog>().error(
            app_log::Category::Service,
            format!("failed to update tray disconnect action: {error}"),
        );
    }
}

pub fn set_shutting_down(app: &AppHandle) {
    let Some(controller) = app.try_state::<TrayController>() else {
        return;
    };
    let _ = controller.disconnect.set_enabled(false);
    let _ = controller.open.set_enabled(false);
    let _ = controller.quit.set_enabled(false);
}

fn disconnect_tunnel(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let logs = app.state::<AppLog>();
        logs.info(app_log::Category::Vpn, "tray disconnect requested");
        let manager = app.state::<ConnectionManager>();
        if let Err(error) = manager.disconnect(&app).await {
            logs.error(
                app_log::Category::Vpn,
                format!(
                    "tray disconnect failed kind={} message={error}",
                    error.kind()
                ),
            );
        }
    });
}
