use crate::AppState;
use crate::error::AppError;
use crate::models::ProgressLog;
use rusqlite::params;

#[tauri::command]
pub fn generate_report_by_date(
    start_date: String,
    end_date: String,
    state: tauri::State<AppState>,
) -> Result<String, AppError> {
    let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;

    let date_range = if start_date == end_date {
        start_date.clone()
    } else {
        format!("{} ~ {}", start_date, end_date)
    };
    let mut report = format!("# 每日报告 - {}\n\n", date_range);

    // ---- 概览统计 ----
    let task_minutes: i64 = db
        .query_row(
            "SELECT COALESCE(SUM((strftime('%s', COALESCE(end_time, datetime('now', 'localtime'))) - strftime('%s', start_time)) / 60), 0)
             FROM timeline_events WHERE date >= ?1 AND date <= ?2 AND mode = 'task'",
            params![start_date, end_date],
            |row| row.get(0),
        )?;

    let meeting_minutes: i64 = db
        .query_row(
            "SELECT COALESCE(SUM((strftime('%s', COALESCE(end_time, datetime('now', 'localtime'))) - strftime('%s', start_time)) / 60), 0)
             FROM timeline_events WHERE date >= ?1 AND date <= ?2 AND mode = 'meeting'",
            params![start_date, end_date],
            |row| row.get(0),
        )?;

    // 当日完成的任务
    let mut completed_stmt = db.prepare(
        "SELECT DISTINCT t.title FROM tasks t
         INNER JOIN timeline_events te ON t.id = te.task_id
         WHERE te.date >= ?1 AND te.date <= ?2 AND te.mode = 'complete'",
    )?;
    let completed: Vec<String> = completed_stmt
        .query_map(params![start_date, end_date], |row| row.get(0))?
        .collect::<Result<Vec<_>, _>>()?;

    report.push_str("## 概览\n\n");
    report.push_str(&format!("- 专注时长：{} 分钟\n", task_minutes.max(0)));
    report.push_str(&format!("- 会议时长：{} 分钟\n", meeting_minutes.max(0)));
    if !completed.is_empty() {
        report.push_str(&format!("- 完成任务：{} 个（{}）\n", completed.len(), completed.join("、")));
    }
    report.push('\n');

    // ---- 任务详情（按任务分组） ----
    let mut task_stmt = db.prepare(
        "SELECT DISTINCT t.id, t.title, t.description, t.priority, t.progress,
                t.planned_date, t.start_time, t.actual_completion_time
         FROM tasks t
         INNER JOIN timeline_events te ON t.id = te.task_id
         WHERE te.date >= ?1 AND te.date <= ?2 AND te.mode IN ('task','complete')",
    )?;

    let tasks: Vec<(String, String, String, String, u8, Option<String>, String, Option<String>)> = task_stmt
        .query_map(params![start_date, end_date], |row| {
            Ok((
                row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?,
                row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    if !tasks.is_empty() {
        report.push_str("## 任务详情\n\n");
        for (task_id, title, description, priority, progress, planned_date, _start_time, actual_completion_time) in &tasks {
            // 该任务的投入时长
            let task_time: i64 = db.query_row(
                "SELECT COALESCE(SUM((strftime('%s', COALESCE(end_time, datetime('now', 'localtime'))) - strftime('%s', start_time)) / 60), 0)
                 FROM timeline_events WHERE task_id = ?1 AND date >= ?2 AND date <= ?3 AND mode IN ('task','complete')",
                params![task_id, start_date, end_date],
                |row| row.get(0),
            )?;

            report.push_str(&format!("### {}\n\n", title));
            report.push_str(&format!("- 投入时间：{} 分钟\n", task_time.max(0)));
            report.push_str(&format!("- 优先级：{}\n", priority));
            report.push_str(&format!("- 进度：{}%\n", progress));
            if let Some(pd) = planned_date {
                report.push_str(&format!("- 计划完成时间：{}\n", pd));
            }
            if !description.is_empty() {
                report.push_str(&format!("- 详情：{}\n", description));
            }
            if let Some(act) = actual_completion_time {
                report.push_str(&format!("- 实际完成时间：{}\n", &act[..act.len().min(10)]));
            }

            // 当日更新的进展
            let mut log_stmt = db.prepare(
                "SELECT timestamp, description, progress FROM progress_logs
                 WHERE task_id = ?1 AND substr(timestamp, 1, 10) >= ?2 AND substr(timestamp, 1, 10) <= ?3
                 ORDER BY timestamp ASC",
            )?;
            let logs: Vec<(String, String, u8)> = log_stmt
                .query_map(params![task_id, start_date, end_date], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
                .collect::<Result<Vec<_>, _>>()?;

            if !logs.is_empty() {
                report.push_str("\n**当日进展：**\n\n");
                report.push_str("| 时间 | 描述 | 进度 |\n");
                report.push_str("|------|------|------|\n");
                for (ts, desc, prog) in &logs {
                    report.push_str(&format!("| {} | {} | {}% |\n", &ts[..ts.len().min(16)], desc, prog));
                }
            }
            report.push_str("\n\n");
        }
    }

    // ---- 会议详情 ----
    let mut meeting_stmt = db.prepare(
        "SELECT start_time, COALESCE(end_time, datetime('now', 'localtime')), meeting_notes, meeting_task_id
         FROM timeline_events
         WHERE date >= ?1 AND date <= ?2 AND mode = 'meeting'
         ORDER BY start_time",
    )?;

    struct MeetingRow {
        start_time: String,
        end_time: String,
        notes: Option<String>,
        related_task_id: Option<String>,
    }

    let meetings: Vec<MeetingRow> = meeting_stmt
        .query_map(params![start_date, end_date], |row| {
            Ok(MeetingRow {
                start_time: row.get(0)?,
                end_time: row.get(1)?,
                notes: row.get(2)?,
                related_task_id: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let has_content = meetings.iter().any(|m| m.notes.is_some() || m.related_task_id.is_some());
    if has_content {
        report.push_str("## 会议\n\n");
        for m in &meetings {
            if m.notes.is_none() && m.related_task_id.is_none() {
                continue;
            }
            let start_ts: i64 = m.start_time[11..19].replace(':', "").parse().unwrap_or(0) as i64;
            let end_ts: i64 = m.end_time[11..19].replace(':', "").parse().unwrap_or(0) as i64;
            let duration = (end_ts - start_ts).max(0);

            let mut title = format!("{}", &m.start_time[11..16]);
            if let Some(ref n) = m.notes {
                title.push_str(&format!(" {}", n));
            }
            if let Some(ref tid) = m.related_task_id {
                let rel_title: Option<String> = db
                    .query_row("SELECT title FROM tasks WHERE id = ?1", params![tid], |row| row.get(0))
                    .ok();
                if let Some(rt) = rel_title {
                    title.push_str(&format!("（关联：{}）", rt));
                }
            }
            report.push_str(&format!("### {}\n\n", title));
            report.push_str(&format!("- 时长：{} 分钟\n", duration));
            report.push_str("\n");
        }
    }

    Ok(report)
}

#[tauri::command]
pub fn generate_report_by_tag(
    tag_id: String,
    state: tauri::State<AppState>,
) -> Result<String, AppError> {
    let db = state.db.lock().map_err(|e| AppError::Database(e.to_string()))?;

    // 获取标签信息
    let tag_name: String = db
        .query_row(
            "SELECT name FROM tags WHERE id = ?1",
            params![tag_id],
            |row| row.get(0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound(format!("标签不存在: {}", tag_id))
            }
            other => AppError::from(other),
        })?;

    let mut report = format!("# 标签报告 - {}\n\n", tag_name);

    // 获取该标签下所有任务
    let mut stmt = db.prepare(
        "SELECT t.id, t.title, t.description, t.priority, t.progress,
                t.planned_date, t.start_time, t.actual_completion_time, t.created_at, t.updated_at
         FROM tasks t
         INNER JOIN task_tags tt ON t.id = tt.task_id
         WHERE tt.tag_id = ?1
         ORDER BY t.created_at DESC",
    )?;

    let tasks: Vec<(String, String, String, String, u8, Option<String>, String, Option<String>, String, String)> = stmt
        .query_map(params![tag_id], |row| {
            Ok((
                row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?,
                row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?,
                row.get(8)?, row.get(9)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    if tasks.is_empty() {
        report.push_str("该标签下无任务。\n");
        return Ok(report);
    }

    report.push_str(&format!("## 相关任务数：{}\n\n", tasks.len()));

    for (
        task_id,
        title,
        description,
        priority,
        progress,
        planned_date,
        start_time,
        actual_completion_time,
        _created_at,
        _updated_at,
    ) in &tasks
    {
        report.push_str(&format!("### {}\n\n", title));
        report.push_str(&format!("- **ID**: {}\n", task_id));
        report.push_str(&format!("- **优先级**: {}\n", priority));
        report.push_str(&format!("- **进度**: {}%\n", progress));
        report.push_str(&format!("- **计划完成时间**: {}\n", planned_date.as_deref().unwrap_or("未设置")));
        report.push_str(&format!("- **开始时间**: {}\n", &start_time[..start_time.len().min(10)]));
        report.push_str(&format!(
            "- **实际完成时间**: {}\n",
            actual_completion_time
                .as_deref()
                .map(|t| &t[..t.len().min(10)])
                .unwrap_or("未完成")
        ));
        if !description.is_empty() {
            report.push_str(&format!("- **详情**: {}\n", description));
        }

        // 进展日志
        let mut log_stmt = db.prepare(
            "SELECT id, task_id, timestamp, description, progress FROM progress_logs
             WHERE task_id = ?1 ORDER BY timestamp ASC",
        )?;
        let logs: Vec<ProgressLog> = log_stmt
            .query_map(params![task_id], |row| {
                Ok(ProgressLog {
                    id: row.get(0)?,
                    task_id: row.get(1)?,
                    timestamp: row.get(2)?,
                    description: row.get(3)?,
                    progress: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        if !logs.is_empty() {
            report.push_str("\n**进展记录：**\n\n");
            report.push_str("| 时间 | 描述 | 进度 |\n");
            report.push_str("|------|------|------|\n");
            for log in &logs {
                report.push_str(&format!(
                    "| {} | {} | {}% |\n",
                    &log.timestamp[..log.timestamp.len().min(16)],
                    log.description,
                    log.progress
                ));
            }
        }

        report.push_str("\n---\n\n");
    }

    Ok(report)
}
