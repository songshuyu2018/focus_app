use crate::AppState;
use crate::error::AppError;

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
