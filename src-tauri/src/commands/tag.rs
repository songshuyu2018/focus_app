use crate::error::AppError;
use crate::models::Tag;
use crate::{now_iso, AppState};
use uuid::Uuid;

#[tauri::command]
pub fn create_tag(name: String, state: tauri::State<AppState>) -> Result<Tag, AppError> {
    let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;
    let id = Uuid::new_v4().to_string();
    let created_at = now_iso();

    db.execute(
        "INSERT INTO tags (id, name, created_at) VALUES (?1, ?2, ?3)",
        rusqlite::params![id, name, created_at],
    )
    .map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            AppError::Duplicate(format!("标签名已存在: {}", name))
        } else {
            AppError::from(e)
        }
    })?;

    Ok(Tag {
        id,
        name,
        created_at,
    })
}

#[tauri::command]
pub fn delete_tag(id: String, state: tauri::State<AppState>) -> Result<(), AppError> {
    let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;
    let affected = db.execute("DELETE FROM tags WHERE id = ?1", rusqlite::params![id])?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("标签不存在: {}", id)));
    }
    Ok(())
}

#[tauri::command]
pub fn list_tags(
    search: Option<String>,
    state: tauri::State<AppState>,
) -> Result<Vec<Tag>, AppError> {
    let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;

    let (sql, params): (String, Vec<String>) = if let Some(keyword) = search {
        (
            "SELECT id, name, created_at FROM tags WHERE name LIKE ?1 ORDER BY created_at DESC"
                .to_string(),
            vec![format!("%{}%", keyword)],
        )
    } else {
        (
            "SELECT id, name, created_at FROM tags ORDER BY created_at DESC".to_string(),
            vec![],
        )
    };

    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        params.iter().map(|p| p as &dyn rusqlite::types::ToSql).collect();

    let mut stmt = db.prepare(&sql)?;
    let tags = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(tags)
}
