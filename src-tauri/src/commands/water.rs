use crate::AppState;
use crate::error::AppError;
use tauri::Manager;

#[tauri::command]
pub async fn toggle_floating_window(
    app: tauri::AppHandle,
) -> Result<bool, AppError> {
    use tauri::WebviewWindowBuilder;

    // 如果已存在则关闭
    if let Some(w) = app.get_webview_window("floating-bar") {
        let _ = w.close();
        return Ok(false);
    }

    // 创建新窗口
    let window = WebviewWindowBuilder::new(
        &app,
        "floating-bar",
        tauri::WebviewUrl::App("/?floating=1".into()),
    )
    .inner_size(280.0, 80.0)
    .position(0.0, 0.0)
    .decorations(false)
    .always_on_top(true)
    .resizable(false)
    .skip_taskbar(true)
    .transparent(true)
    .shadow(false)
    .title("快捷操作")
    .build()
    .map_err(|e| AppError::Database(e.to_string()))?;

    // 透明 webview 背景
    let _ = window.set_background_color(Some(tauri::webview::Color(0, 0, 0, 0)));

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Graphics::Dwm::{
            DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWM_WINDOW_CORNER_PREFERENCE,
        };
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE,
        };
        use windows::Win32::Foundation::HWND;
        if let Ok(hwnd) = window.hwnd() {
            let hwnd = HWND(hwnd.0);
            let preference = DWM_WINDOW_CORNER_PREFERENCE(1); // DWMWCP_DONOTROUND
            unsafe {
                let _ = DwmSetWindowAttribute(
                    hwnd,
                    DWMWA_WINDOW_CORNER_PREFERENCE,
                    &preference as *const _ as *const _,
                    std::mem::size_of::<DWM_WINDOW_CORNER_PREFERENCE>() as u32,
                );
                // 置顶窗口，覆盖任务栏
                SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE);
            }
        }
    }

    Ok(true)
}

#[tauri::command]
pub fn clear_all_data(
    state: tauri::State<AppState>,
) -> Result<(), AppError> {
    let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;
    db.execute_batch(
        "DELETE FROM progress_logs;
         DELETE FROM task_tags;
         DELETE FROM timeline_events;
         DELETE FROM timeline_settings;
         DELETE FROM water_reminders;
         DELETE FROM tasks;
         DELETE FROM tags;",
    )?;
    Ok(())
}

#[tauri::command]
pub fn save_water_reminders(
    data: String,
    state: tauri::State<AppState>,
) -> Result<(), AppError> {
    let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;
    db.execute(
        "INSERT INTO water_reminders (id, data) VALUES ('singleton', ?1)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data",
        rusqlite::params![data],
    )?;
    Ok(())
}

#[tauri::command]
pub fn load_water_reminders(
    state: tauri::State<AppState>,
) -> Result<String, AppError> {
    let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;
    let result: Result<String, _> = db.query_row(
        "SELECT data FROM water_reminders WHERE id = 'singleton'",
        [],
        |row| row.get(0),
    );
    match result {
        Ok(data) => Ok(data),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok("[]".to_string()),
        Err(e) => Err(AppError::from(e)),
    }
}
