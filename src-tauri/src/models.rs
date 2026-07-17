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

// ===== AI 监工 =====

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AuthType {
    Password,
    Key,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerConfig {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: AuthType,
    #[serde(skip_serializing)]
    pub password: Option<String>,
    pub key_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelInfo {
    pub server_id: String,
    pub local_port: u16,
    pub connected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionRequest {
    pub id: String,
    pub tool: String,
    pub description: String,
    #[serde(default)]
    pub arguments: serde_json::Value,
    #[serde(default)]
    pub options: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThinkingInfo {
    pub text: String,
    pub progress: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionState {
    pub id: String,
    pub name: String,
    pub status: String,
    #[serde(default)]
    pub working_directory: String,
    pub pid: Option<u32>,
    #[serde(default)]
    pub can_remote_confirm: bool,
    #[serde(default)]
    pub cc_session_id: String,
    pub permission_request: Option<PermissionRequest>,
    pub thinking: Option<ThinkingInfo>,
    pub started_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverResult {
    pub discovered: u32,
    pub added: u32,
    #[serde(default)]
    pub sessions: Vec<SessionState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiResponse {
    #[serde(default)]
    pub ok: bool,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
}
