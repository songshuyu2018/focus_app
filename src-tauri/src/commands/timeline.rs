use crate::{now_iso, AppState};
use crate::error::AppError;
use crate::models::{StartTimelineEventParams, TimelineEvent, TimelineSettings, TodayStats};
use chrono::Local;
use rusqlite::params;
use uuid::Uuid;

#[tauri::command]
pub fn set_timeline_settings(
    date: String,
    start_time: String,
    end_time: String,
    state: tauri::State<AppState>,
) -> Result<TimelineSettings, AppError> {
    let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;
    let id = Uuid::new_v4().to_string();

    db.execute(
        "INSERT INTO timeline_settings (id, date, start_time, end_time) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(date) DO UPDATE SET start_time = excluded.start_time, end_time = excluded.end_time",
        params![id, date, start_time, end_time],
    )?;

    // 读取刚写入的记录
    let settings = db.query_row(
        "SELECT id, date, start_time, end_time FROM timeline_settings WHERE date = ?1",
        params![date],
        |row| {
            Ok(TimelineSettings {
                id: row.get(0)?,
                date: row.get(1)?,
                start_time: row.get(2)?,
                end_time: row.get(3)?,
            })
        },
    )?;

    Ok(settings)
}

#[tauri::command]
pub fn get_timeline_settings(
    date: String,
    state: tauri::State<AppState>,
) -> Result<Option<TimelineSettings>, AppError> {
    let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;

    let result = db.query_row(
        "SELECT id, date, start_time, end_time FROM timeline_settings WHERE date = ?1",
        params![date],
        |row| {
            Ok(TimelineSettings {
                id: row.get(0)?,
                date: row.get(1)?,
                start_time: row.get(2)?,
                end_time: row.get(3)?,
            })
        },
    );

    match result {
        Ok(settings) => Ok(Some(settings)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::from(e)),
    }
}

#[tauri::command]
pub fn start_timeline_event(
    params: StartTimelineEventParams,
    state: tauri::State<AppState>,
) -> Result<TimelineEvent, AppError> {
    let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;
    let now = now_iso();
    let today = Local::now().format("%Y-%m-%d").to_string();

    if params.mode == "task" && params.task_id.is_none() {
        return Err(AppError::Validation(
            "进入任务模式必须指定 task_id".to_string(),
        ));
    }

    // 结束当前进行中的事件
    db.execute(
        "UPDATE timeline_events SET end_time = ?1 WHERE end_time IS NULL AND date = ?2",
        params![now, today],
    )?;

    // 查询任务标题快照
    let task_title: Option<String> = if let Some(ref tid) = params.task_id {
        db.query_row(
            "SELECT title FROM tasks WHERE id = ?1",
            params![tid],
            |row| row.get(0),
        )
        .ok()
    } else {
        None
    };

    let id = Uuid::new_v4().to_string();
    db.execute(
        "INSERT INTO timeline_events (id, date, mode, start_time, end_time, task_id, task_title, meeting_notes, meeting_task_id, created_at) VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6, ?7, ?8, ?9)",
        params![
            id,
            today,
            params.mode,
            now,
            params.task_id,
            task_title,
            params.meeting_notes,
            params.meeting_task_id,
            now,
        ],
    )?;

    Ok(TimelineEvent {
        id,
        date: today,
        mode: params.mode,
        start_time: now.clone(),
        end_time: None,
        task_id: params.task_id,
        task_title,
        meeting_notes: params.meeting_notes,
        meeting_task_id: params.meeting_task_id,
        created_at: now,
    })
}

#[tauri::command]
pub fn update_timeline_event(
    id: String,
    meeting_notes: Option<String>,
    meeting_task_id: Option<String>,
    state: tauri::State<AppState>,
) -> Result<TimelineEvent, AppError> {
    let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;

    let affected = db.execute(
        "UPDATE timeline_events SET meeting_notes = ?1, meeting_task_id = ?2 WHERE id = ?3",
        params![meeting_notes, meeting_task_id, id],
    )?;

    if affected == 0 {
        return Err(AppError::NotFound(format!("事件不存在: {}", id)));
    }

    let event = db.query_row(
        "SELECT id, date, mode, start_time, end_time, task_id, task_title, meeting_notes, meeting_task_id, created_at FROM timeline_events WHERE id = ?1",
        params![id],
        |row| {
            Ok(TimelineEvent {
                id: row.get(0)?,
                date: row.get(1)?,
                mode: row.get(2)?,
                start_time: row.get(3)?,
                end_time: row.get(4)?,
                task_id: row.get(5)?,
                task_title: row.get(6)?,
                meeting_notes: row.get(7)?,
                meeting_task_id: row.get(8)?,
                created_at: row.get(9)?,
            })
        },
    )?;

    Ok(event)
}

#[tauri::command]
pub fn end_current_event(
    state: tauri::State<AppState>,
) -> Result<Option<TimelineEvent>, AppError> {
    let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;
    let now = now_iso();
    let today = Local::now().format("%Y-%m-%d").to_string();

    let affected = db.execute(
        "UPDATE timeline_events SET end_time = ?1 WHERE end_time IS NULL AND date = ?2",
        params![now, today],
    )?;

    if affected == 0 {
        return Ok(None);
    }

    // 读取刚结束的事件
    let event = db.query_row(
        "SELECT id, date, mode, start_time, end_time, task_id, task_title, meeting_notes, meeting_task_id, created_at FROM timeline_events WHERE end_time = ?1 AND date = ?2 ORDER BY start_time DESC LIMIT 1",
        params![now, today],
        |row| {
            Ok(TimelineEvent {
                id: row.get(0)?,
                date: row.get(1)?,
                mode: row.get(2)?,
                start_time: row.get(3)?,
                end_time: row.get(4)?,
                task_id: row.get(5)?,
                task_title: row.get(6)?,
                meeting_notes: row.get(7)?,
                meeting_task_id: row.get(8)?,
                created_at: row.get(9)?,
            })
        },
    )?;

    Ok(Some(event))
}

#[tauri::command]
pub fn get_current_event(
    state: tauri::State<AppState>,
) -> Result<Option<TimelineEvent>, AppError> {
    let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;

    let today = Local::now().format("%Y-%m-%d").to_string();

    let result = db.query_row(
        "SELECT id, date, mode, start_time, end_time, task_id, task_title, meeting_notes, meeting_task_id, created_at FROM timeline_events WHERE end_time IS NULL AND date = ?1 ORDER BY start_time DESC LIMIT 1",
        params![today],
        |row| {
            Ok(TimelineEvent {
                id: row.get(0)?,
                date: row.get(1)?,
                mode: row.get(2)?,
                start_time: row.get(3)?,
                end_time: row.get(4)?,
                task_id: row.get(5)?,
                task_title: row.get(6)?,
                meeting_notes: row.get(7)?,
                meeting_task_id: row.get(8)?,
                created_at: row.get(9)?,
            })
        },
    );

    match result {
        Ok(event) => Ok(Some(event)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::from(e)),
    }
}

#[tauri::command]
pub fn get_today_timeline(
    state: tauri::State<AppState>,
) -> Result<Vec<TimelineEvent>, AppError> {
    let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;
    let today = Local::now().format("%Y-%m-%d").to_string();

    let mut stmt = db.prepare(
        "SELECT id, date, mode, start_time, end_time, task_id, task_title, meeting_notes, meeting_task_id, created_at FROM timeline_events WHERE date = ?1 ORDER BY start_time ASC",
    )?;

    let events = stmt
        .query_map(params![today], |row| {
            Ok(TimelineEvent {
                id: row.get(0)?,
                date: row.get(1)?,
                mode: row.get(2)?,
                start_time: row.get(3)?,
                end_time: row.get(4)?,
                task_id: row.get(5)?,
                task_title: row.get(6)?,
                meeting_notes: row.get(7)?,
                meeting_task_id: row.get(8)?,
                created_at: row.get(9)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(events)
}

#[tauri::command]
pub fn get_today_stats(
    state: tauri::State<AppState>,
) -> Result<TodayStats, AppError> {
    let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;
    let today = Local::now().format("%Y-%m-%d").to_string();
    let now = now_iso();

    // 计算各模式时长（分钟）。
    // 已结束事件：用 end_time - start_time
    // 进行中事件：用 now - start_time
    // SQLite 中，ISO 8601 格式的时间字符串可直接用 strftime 计算差值（秒）
    let mut stmt = db.prepare(
        "SELECT mode, SUM(
            (strftime('%s', COALESCE(end_time, ?1)) - strftime('%s', start_time)) / 60
        ) as total_minutes
        FROM timeline_events
        WHERE date = ?2
        GROUP BY mode",
    )?;

    let mut task_minutes: u64 = 0;
    let mut meeting_minutes: u64 = 0;
    let mut rest_minutes: u64 = 0;

    let rows = stmt.query_map(params![now, today], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;

    for row in rows {
        let (mode, minutes) = row?;
        let minutes = minutes.max(0) as u64;
        match mode.as_str() {
            "task" => task_minutes = minutes,
            "meeting" => meeting_minutes = minutes,
            "rest" => rest_minutes = minutes,
            _ => {}
        }
    }

    // 当日投入的聚焦任务数（去重 task_id）
    let focused_count: u64 = db.query_row(
        "SELECT COUNT(DISTINCT task_id) FROM timeline_events WHERE date = ?1 AND mode = 'task' AND task_id IS NOT NULL",
        params![today],
        |row| row.get(0),
    )?;

    // 当前模式
    let current_mode: Option<String> = db
        .query_row(
            "SELECT mode FROM timeline_events WHERE end_time IS NULL AND date = ?1 ORDER BY start_time DESC LIMIT 1",
            params![today],
            |row| row.get(0),
        )
        .ok();

    Ok(TodayStats {
        task_minutes,
        meeting_minutes,
        rest_minutes,
        focused_task_count: focused_count,
        current_mode,
    })
}
