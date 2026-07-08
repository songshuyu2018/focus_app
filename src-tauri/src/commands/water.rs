use crate::AppState;
use crate::error::AppError;
use tauri::Manager;

#[tauri::command]
pub async fn toggle_floating_window(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<bool, AppError> {
    use tauri::WebviewWindowBuilder;

    // 如果已存在则关闭（先保存位置）
    if let Some(w) = app.get_webview_window("floating-bar") {
        if let Ok(pos) = w.outer_position() {
            let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;
            let data = serde_json::json!({"x": pos.x, "y": pos.y}).to_string();
            let _ = db.execute(
                "INSERT INTO water_reminders (id, data) VALUES ('floating_pos', ?1)
                 ON CONFLICT(id) DO UPDATE SET data = excluded.data",
                rusqlite::params![data],
            );
        }
        let _ = w.close();
        return Ok(false);
    }

    // 从 DB 读取上次保存的位置
    let saved_pos: Option<(i32, i32)> = {
        let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;
        db.query_row(
            "SELECT data FROM water_reminders WHERE id = 'floating_pos'",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .and_then(|data| {
            serde_json::from_str::<serde_json::Value>(&data).ok()
                .and_then(|v| {
                    Some((v["x"].as_i64()? as i32, v["y"].as_i64()? as i32))
                })
        })
    };

    // 创建新窗口
    let window = WebviewWindowBuilder::new(
        &app,
        "floating-bar",
        tauri::WebviewUrl::App("/?floating=1".into()),
    )
    .inner_size(280.0, 80.0)
    .decorations(false)
    .always_on_top(true)
    .resizable(false)
    .skip_taskbar(true)
    .transparent(true)
    .shadow(false)
    .title("快捷操作")
    .build()
    .map_err(|e| AppError::Database(e.to_string()))?;

    // 恢复上次保存的位置
    if let Some((x, y)) = saved_pos {
        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
    }

    // 透明 webview 背景
    let _ = window.set_background_color(Some(tauri::webview::Color(0, 0, 0, 0)));

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Graphics::Dwm::{
            DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWM_WINDOW_CORNER_PREFERENCE,
        };
        use windows::Win32::Foundation::HWND;
        if let Ok(hwnd) = window.hwnd() {
            let hwnd = HWND(hwnd.0);
            let preference = DWM_WINDOW_CORNER_PREFERENCE(1);
            unsafe {
                let _ = DwmSetWindowAttribute(
                    hwnd,
                    DWMWA_WINDOW_CORNER_PREFERENCE,
                    &preference as *const _ as *const _,
                    std::mem::size_of::<DWM_WINDOW_CORNER_PREFERENCE>() as u32,
                );
            }
        }
    }

    Ok(true)
}

#[tauri::command]
pub fn save_floating_position(
    x: i32,
    y: i32,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;
    let data = serde_json::json!({"x": x, "y": y}).to_string();
    db.execute(
        "INSERT INTO water_reminders (id, data) VALUES ('floating_pos', ?1)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data",
        rusqlite::params![data],
    )?;
    Ok(())
}

#[derive(serde::Serialize)]
pub struct FloatingPosition {
    pub x: f64,
    pub y: f64,
}

#[tauri::command]
pub fn get_floating_position(
    state: tauri::State<'_, AppState>,
) -> Result<Option<FloatingPosition>, AppError> {
    let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;
    let result = db.query_row(
        "SELECT data FROM water_reminders WHERE id = 'floating_pos'",
        [],
        |row| row.get::<_, String>(0),
    );
    match result {
        Ok(data) => {
            let v: serde_json::Value = serde_json::from_str(&data)
                .map_err(|e| AppError::Database(e.to_string()))?;
            Ok(Some(FloatingPosition {
                x: v["x"].as_f64().unwrap_or(0.0),
                y: v["y"].as_f64().unwrap_or(0.0),
            }))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::from(e)),
    }
}

#[tauri::command]
pub fn save_titlebar_config(
    data: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;
    db.execute(
        "INSERT INTO water_reminders (id, data) VALUES ('titlebar_config', ?1)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data",
        rusqlite::params![data],
    )?;
    Ok(())
}

#[tauri::command]
pub fn load_titlebar_config(
    state: tauri::State<'_, AppState>,
) -> Result<String, AppError> {
    let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;
    let result = db.query_row(
        "SELECT data FROM water_reminders WHERE id = 'titlebar_config'",
        [],
        |row| row.get::<_, String>(0),
    );
    match result {
        Ok(data) => Ok(data),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok("[]".to_string()),
        Err(e) => Err(AppError::from(e)),
    }
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
pub fn check_water_reminder(
    state: tauri::State<'_, AppState>,
) -> Result<bool, AppError> {
    let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;
    let raw: String = db.query_row(
        "SELECT data FROM water_reminders WHERE id = 'singleton'",
        [],
        |row| row.get(0),
    ).unwrap_or_else(|_| "[]".to_string());
    drop(db);

    let now = chrono::Local::now().format("%H:%M").to_string();
    if let Ok(reminders) = serde_json::from_str::<Vec<serde_json::Value>>(&raw) {
        for r in reminders {
            if r["time"].as_str() == Some(&now) {
                return Ok(true);
            }
        }
    }
    Ok(false)
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
