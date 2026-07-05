use serde::{Deserialize, Serialize};

// ===== 标签 =====

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

// ===== 任务 =====

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: String,
    pub priority: String,
    pub progress: u8,
    pub planned_date: Option<String>,
    pub start_time: String,
    pub actual_completion_time: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub tags: Vec<Tag>,
    pub progress_logs: Vec<ProgressLog>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TaskSummary {
    pub id: String,
    pub title: String,
    pub description: String,
    pub priority: String,
    pub progress: u8,
    pub planned_date: Option<String>,
    pub start_time: String,
    pub actual_completion_time: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub tags: Vec<Tag>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTaskParams {
    pub title: String,
    pub description: Option<String>,
    pub priority: Option<String>,
    pub planned_date: Option<String>,
    pub tag_ids: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTaskParams {
    pub id: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub priority: Option<String>,
    pub planned_date: Option<String>,
    pub tag_ids: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct ListTasksParams {
    pub search: Option<String>,
    pub tag_ids: Option<Vec<String>>,
    pub priority: Option<String>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
}

// ===== 进展日志 =====

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProgressLog {
    pub id: String,
    pub task_id: String,
    pub timestamp: String,
    pub description: String,
    pub progress: u8,
}

#[derive(Debug, Deserialize)]
pub struct AddProgressParams {
    pub task_id: String,
    pub description: String,
    pub progress: u8,
}

// ===== 时间线设置 =====

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TimelineSettings {
    pub id: String,
    pub date: String,
    pub start_time: String,
    pub end_time: String,
}

// ===== 时间线事件 =====

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TimelineEvent {
    pub id: String,
    pub date: String,
    pub mode: String,
    pub start_time: String,
    pub end_time: Option<String>,
    pub task_id: Option<String>,
    pub task_title: Option<String>,
    pub meeting_notes: Option<String>,
    pub meeting_minutes: Option<String>,
    pub meeting_task_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct StartTimelineEventParams {
    pub mode: String,
    pub task_id: Option<String>,
    pub meeting_notes: Option<String>,
    pub meeting_task_id: Option<String>,
}

// ===== 统计 =====

#[derive(Debug, Serialize, Clone)]
pub struct TodayStats {
    pub task_minutes: u64,
    pub meeting_minutes: u64,
    pub rest_minutes: u64,
    pub focused_task_count: u64,
    pub current_mode: Option<String>,
}
