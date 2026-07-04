use crate::{now_iso, AppState};
use crate::error::AppError;
use crate::models::{
    AddProgressParams, CreateTaskParams, ListTasksParams, ProgressLog, Tag, Task, TaskSummary,
    UpdateTaskParams,
};
use rusqlite::params;
use uuid::Uuid;

const ALLOWED_SORT_FIELDS: &[&str] = &[
    "priority",
    "planned_date",
    "progress",
    "created_at",
    "updated_at",
];

fn validate_sort_by(field: &str) -> Result<&str, AppError> {
    if ALLOWED_SORT_FIELDS.contains(&field) {
        Ok(field)
    } else {
        Err(AppError::Validation(format!(
            "不允许的排序字段: {}",
            field
        )))
    }
}

fn get_tags_for_task(db: &rusqlite::Connection, task_id: &str) -> Result<Vec<Tag>, AppError> {
    let mut stmt =
        db.prepare("SELECT t.id, t.name, t.created_at FROM tags t INNER JOIN task_tags tt ON t.id = tt.tag_id WHERE tt.task_id = ?1")?;
    let tags = stmt
        .query_map(params![task_id], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(tags)
}

fn get_progress_logs_for_task(
    db: &rusqlite::Connection,
    task_id: &str,
    limit: usize,
) -> Result<Vec<ProgressLog>, AppError> {
    let mut stmt = db.prepare(
        "SELECT id, task_id, timestamp, description, progress FROM progress_logs WHERE task_id = ?1 ORDER BY timestamp DESC LIMIT ?2",
    )?;
    let logs = stmt
        .query_map(params![task_id, limit as i64], |row| {
            Ok(ProgressLog {
                id: row.get(0)?,
                task_id: row.get(1)?,
                timestamp: row.get(2)?,
                description: row.get(3)?,
                progress: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(logs)
}

fn set_task_tags(
    db: &rusqlite::Connection,
    task_id: &str,
    tag_ids: &[String],
) -> Result<(), AppError> {
    db.execute("DELETE FROM task_tags WHERE task_id = ?1", params![task_id])?;
    for tag_id in tag_ids {
        db.execute(
            "INSERT INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
            params![task_id, tag_id],
        )?;
    }
    Ok(())
}

#[tauri::command]
pub fn create_task(
    params: CreateTaskParams,
    state: tauri::State<AppState>,
) -> Result<Task, AppError> {
    let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;
    let id = Uuid::new_v4().to_string();
    let now = now_iso();
    let priority = params.priority.unwrap_or_else(|| "medium".to_string());
    if !["high", "medium", "low"].contains(&priority.as_str()) {
        return Err(AppError::Validation(format!(
            "无效的优先级: {}",
            priority
        )));
    }

    let title = params.title;
    let description = params.description.unwrap_or_default();
    let planned_date = params.planned_date;

    db.execute(
        "INSERT INTO tasks (id, title, description, priority, progress, planned_date, start_time, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, ?7, ?8)",
        params![
            id,
            title,
            description,
            priority,
            planned_date,
            now,
            now,
            now,
        ],
    )?;

    if let Some(ref tag_ids) = params.tag_ids {
        set_task_tags(&db, &id, tag_ids)?;
    }

    let tags = get_tags_for_task(&db, &id)?;

    Ok(Task {
        id,
        title,
        description,
        priority,
        progress: 0,
        planned_date,
        start_time: now.clone(),
        actual_completion_time: None,
        created_at: now.clone(),
        updated_at: now,
        tags,
        progress_logs: vec![],
    })
}

#[tauri::command]
pub fn update_task(
    params: UpdateTaskParams,
    state: tauri::State<AppState>,
) -> Result<Task, AppError> {
    let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;
    let now = now_iso();

    // 检查任务存在
    let mut stmt = db.prepare(
        "SELECT id, title, description, priority, progress, planned_date, start_time, actual_completion_time, created_at, updated_at FROM tasks WHERE id = ?1",
    )?;
    let task_exists = stmt.exists(params![params.id])?;
    if !task_exists {
        return Err(AppError::NotFound(format!(
            "任务不存在: {}",
            params.id
        )));
    }

    // 构建动态 UPDATE
    let mut updates: Vec<String> = vec!["updated_at = ?".to_string()];
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> =
        vec![Box::new(now.clone())];

    if let Some(ref title) = params.title {
        updates.push("title = ?".to_string());
        values.push(Box::new(title.clone()));
    }
    if let Some(ref description) = params.description {
        updates.push("description = ?".to_string());
        values.push(Box::new(description.clone()));
    }
    if let Some(ref priority) = params.priority {
        if !["high", "medium", "low"].contains(&priority.as_str()) {
            return Err(AppError::Validation(format!(
                "无效的优先级: {}",
                priority
            )));
        }
        updates.push("priority = ?".to_string());
        values.push(Box::new(priority.clone()));
    }
    if let Some(ref planned_date) = params.planned_date {
        updates.push("planned_date = ?".to_string());
        if planned_date.is_empty() {
            values.push(Box::new(None::<String>));
        } else {
            values.push(Box::new(planned_date.clone()));
        }
    }

    let set_clause = updates.join(", ");
    let sql = format!(
        "UPDATE tasks SET {} WHERE id = ?",
        set_clause
    );

    // Build final params with id at the end
    let mut final_params: Vec<Box<dyn rusqlite::types::ToSql>> = values;
    final_params.push(Box::new(params.id.clone()));

    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        final_params.iter().map(|p| p.as_ref()).collect();

    db.execute(&sql, param_refs.as_slice())?;

    // 更新标签
    if let Some(ref tag_ids) = params.tag_ids {
        set_task_tags(&db, &params.id, tag_ids)?;
    }

    get_task_by_id(&db, &params.id)
}

#[tauri::command]
pub fn delete_task(id: String, state: tauri::State<AppState>) -> Result<(), AppError> {
    let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;
    let affected = db.execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("任务不存在: {}", id)));
    }
    Ok(())
}

#[tauri::command]
pub fn complete_task(id: String, state: tauri::State<AppState>) -> Result<Task, AppError> {
    let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;
    let now = now_iso();
    let today = &now[..10]; // YYYY-MM-DD

    let task_exists = db
        .prepare("SELECT id FROM tasks WHERE id = ?1")?
        .exists(params![id])?;
    if !task_exists {
        return Err(AppError::NotFound(format!("任务不存在: {}", id)));
    }

    db.execute(
        "UPDATE tasks SET progress = 100, actual_completion_time = ?1, updated_at = ?2 WHERE id = ?3",
        params![now, now, id],
    )?;

    // 查询任务标题
    let task_title: Option<String> = db
        .query_row(
            "SELECT title FROM tasks WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .ok();

    // 结束该任务当前进行中的时间线事件
    db.execute(
        "UPDATE timeline_events SET end_time = ?1 WHERE end_time IS NULL AND task_id = ?2",
        params![now, id],
    )?;

    // 在时间线中插入完成事件
    let event_id = uuid::Uuid::new_v4().to_string();
    db.execute(
        "INSERT INTO timeline_events (id, date, mode, start_time, end_time, task_id, task_title, created_at)
         VALUES (?1, ?2, 'complete', ?3, ?4, ?5, ?6, ?7)",
        params![event_id, today, now, now, id, task_title, now],
    )?;

    get_task_by_id(&db, &id)
}

#[tauri::command]
pub fn add_progress(
    params: AddProgressParams,
    state: tauri::State<AppState>,
) -> Result<ProgressLog, AppError> {
    let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;
    let now = now_iso();

    if params.progress > 100 {
        return Err(AppError::Validation(
            "进度值必须在 0-100 之间".to_string(),
        ));
    }

    // 获取当前任务进度
    let current_progress: u8 = db
        .query_row(
            "SELECT progress FROM tasks WHERE id = ?1",
            params![params.task_id],
            |row| row.get(0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound(format!("任务不存在: {}", params.task_id))
            }
            other => AppError::from(other),
        })?;

    let id = Uuid::new_v4().to_string();
    db.execute(
        "INSERT INTO progress_logs (id, task_id, timestamp, description, progress) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, params.task_id, now, params.description, params.progress],
    )?;

    // 更新任务进度（只升不降）
    if params.progress > current_progress {
        db.execute(
            "UPDATE tasks SET progress = ?1, updated_at = ?2 WHERE id = ?3",
            params![params.progress, now, params.task_id],
        )?;
    }

    // 如果进度达到100且未设置完成时间，自动标记完成
    if params.progress == 100 {
        let has_completion: Option<String> = db
            .query_row(
                "SELECT actual_completion_time FROM tasks WHERE id = ?1",
                params![params.task_id],
                |row| row.get(0),
            )
            .ok();
        if has_completion.is_none() {
            db.execute(
                "UPDATE tasks SET actual_completion_time = ?1 WHERE id = ?2",
                params![now, params.task_id],
            )?;
        }
    }

    Ok(ProgressLog {
        id,
        task_id: params.task_id,
        timestamp: now,
        description: params.description,
        progress: params.progress,
    })
}

#[tauri::command]
pub fn get_task(id: String, state: tauri::State<AppState>) -> Result<Task, AppError> {
    let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;
    get_task_by_id(&db, &id)
}

#[tauri::command]
pub fn list_tasks(
    params: ListTasksParams,
    state: tauri::State<AppState>,
) -> Result<Vec<TaskSummary>, AppError> {
    let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;

    let mut conditions: Vec<String> = vec![];
    let mut query_params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![];

    if let Some(ref keyword) = params.search {
        conditions.push(format!(
            "(t.title LIKE ?{} OR t.description LIKE ?{})",
            conditions.len() + 1,
            conditions.len() + 2
        ));
        let like = format!("%{}%", keyword);
        query_params.push(Box::new(like.clone()));
        query_params.push(Box::new(like));
    }

    if let Some(ref tag_ids) = params.tag_ids {
        if !tag_ids.is_empty() {
            let placeholders: Vec<String> = tag_ids
                .iter()
                .enumerate()
                .map(|(i, _)| format!("?{}", conditions.len() + i + 1))
                .collect();
            conditions.push(format!(
                "t.id IN (SELECT task_id FROM task_tags WHERE tag_id IN ({}))",
                placeholders.join(",")
            ));
            for tag_id in tag_ids {
                query_params.push(Box::new(tag_id.clone()));
            }
        }
    }

    if let Some(ref priority) = params.priority {
        conditions.push(format!("t.priority = ?{}", conditions.len() + 1));
        query_params.push(Box::new(priority.clone()));
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    let sort_by = params
        .sort_by
        .as_deref()
        .unwrap_or("created_at");
    validate_sort_by(sort_by)?;
    let sort_order = params
        .sort_order
        .as_deref()
        .unwrap_or("desc")
        .to_uppercase();
    if sort_order != "ASC" && sort_order != "DESC" {
        return Err(AppError::Validation(format!(
            "无效的排序方向: {}",
            sort_order
        )));
    }

    // 优先级需要按数值排序（high=3, medium=2, low=1）
    let order_by = if sort_by == "priority" {
        format!(
            "CASE t.priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 END {}",
            sort_order
        )
    } else {
        format!("t.{} {}", sort_by, sort_order)
    };

    let sql = format!(
        "SELECT t.id, t.title, t.description, t.priority, t.progress, t.planned_date, t.start_time, t.actual_completion_time, t.created_at, t.updated_at FROM tasks t {} ORDER BY {}",
        where_clause, order_by
    );

    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        query_params.iter().map(|p| p.as_ref()).collect();

    let mut stmt = db.prepare(&sql)?;
    let rows = stmt.query_map(param_refs.as_slice(), |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, u8>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, Option<String>>(7)?,
            row.get::<_, String>(8)?,
            row.get::<_, String>(9)?,
        ))
    })?;

    let mut result = vec![];
    for row in rows {
        let (
            id,
            title,
            description,
            priority,
            progress,
            planned_date,
            start_time,
            actual_completion_time,
            created_at,
            updated_at,
        ) = row?;
        let tags = get_tags_for_task(&db, &id)?;
        result.push(TaskSummary {
            id,
            title,
            description,
            priority,
            progress,
            planned_date,
            start_time,
            actual_completion_time,
            created_at,
            updated_at,
            tags,
        });
    }

    Ok(result)
}

fn get_task_by_id(db: &rusqlite::Connection, id: &str) -> Result<Task, AppError> {
    let task = db.query_row(
        "SELECT id, title, description, priority, progress, planned_date, start_time, actual_completion_time, created_at, updated_at FROM tasks WHERE id = ?1",
        params![id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, u8>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, String>(9)?,
            ))
        },
    ).map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
            AppError::NotFound(format!("任务不存在: {}", id))
        }
        other => AppError::from(other),
    })?;

    let tags = get_tags_for_task(db, id)?;
    let progress_logs = get_progress_logs_for_task(db, id, 20)?;

    Ok(Task {
        id: task.0,
        title: task.1,
        description: task.2,
        priority: task.3,
        progress: task.4,
        planned_date: task.5,
        start_time: task.6,
        actual_completion_time: task.7,
        created_at: task.8,
        updated_at: task.9,
        tags,
        progress_logs,
    })
}
