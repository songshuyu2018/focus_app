use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{Manager, State, WebviewWindowBuilder, WebviewUrl};

use crate::AppState;
use crate::models::{
    ApiResponse, AuthType, DiscoverResult, ServerConfig, SessionState, TunnelInfo,
};
use crate::ssh::process_tunnel::ProcessTunnel;
use crate::ssh::SshTunnel;

// ── Stores ──────────────────────────────────────────

pub struct TunnelStore {
    pub tunnels: Mutex<HashMap<String, ProcessTunnel>>,
    pub next_port: Mutex<u16>,
}

impl TunnelStore {
    pub fn new() -> Self {
        Self {
            tunnels: Mutex::new(HashMap::new()),
            next_port: Mutex::new(18900),
        }
    }
}

fn lock_err<T>(r: std::sync::LockResult<T>) -> Result<T, String> {
    r.map_err(|e| format!("锁获取失败: {}", e))
}

// ── Server Commands ─────────────────────────────────

fn server_from_row(row: &rusqlite::Row) -> rusqlite::Result<ServerConfig> {
    let auth_type_str: String = row.get(5)?;
    Ok(ServerConfig {
        id: row.get(0)?,
        name: row.get(1)?,
        host: row.get(2)?,
        port: row.get(3)?,
        username: row.get(4)?,
        auth_type: match auth_type_str.as_str() {
            "key" => AuthType::Key,
            _ => AuthType::Password,
        },
        password: row.get(6)?,
        key_path: row.get(7)?,
    })
}

#[tauri::command]
pub fn list_servers(state: State<AppState>) -> Result<Vec<ServerConfig>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT id, name, host, port, username, auth_type, password, key_path FROM ai_servers")
        .map_err(|e| e.to_string())?;
    let servers = stmt
        .query_map([], server_from_row)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(servers)
}

#[tauri::command]
pub fn add_server(state: State<AppState>, config: ServerConfig) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let auth_str = match config.auth_type { AuthType::Key => "key", AuthType::Password => "password" };
    db.execute(
        "INSERT INTO ai_servers (id, name, host, port, username, auth_type, password, key_path) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        rusqlite::params![config.id, config.name, config.host, config.port, config.username, auth_str, config.password, config.key_path],
    ).map_err(|e| format!("添加失败: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn update_server(state: State<AppState>, config: ServerConfig) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let auth_str = match config.auth_type { AuthType::Key => "key", AuthType::Password => "password" };
    db.execute(
        "UPDATE ai_servers SET name=?2, host=?3, port=?4, username=?5, auth_type=?6, password=?7, key_path=?8 WHERE id=?1",
        rusqlite::params![config.id, config.name, config.host, config.port, config.username, auth_str, config.password, config.key_path],
    ).map_err(|e| format!("更新失败: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn delete_server(state: State<AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM ai_servers WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Tunnel Commands ─────────────────────────────────

fn get_available_port(next_port: &Mutex<u16>) -> Result<u16, String> {
    let mut counter = lock_err(next_port.lock())?;
    let start = *counter;
    loop {
        let p = *counter;
        *counter += 1;
        if *counter > 19999 {
            *counter = 18900;
        }
        if port_is_available(p) {
            return Ok(p);
        }
        if *counter == start {
            return Err("无法找到可用端口 (18900-19999)".into());
        }
    }
}

fn port_is_available(port: u16) -> bool {
    use std::net::{SocketAddrV4, TcpListener};
    use std::net::Ipv4Addr;
    let addr = SocketAddrV4::new(Ipv4Addr::new(127, 0, 0, 1), port);
    TcpListener::bind(addr).is_ok()
}

#[tauri::command]
pub fn connect_server(
    state: State<AppState>,
    tunnel_store: State<TunnelStore>,
    server_id: String,
) -> Result<u16, String> {
    if lock_err(tunnel_store.tunnels.lock())?.contains_key(&server_id) {
        return Err("该服务器已连接".into());
    }

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let config = db.query_row(
        "SELECT id, name, host, port, username, auth_type, password, key_path FROM ai_servers WHERE id = ?1",
        rusqlite::params![server_id],
        server_from_row,
    ).map_err(|e| format!("服务器不存在: {}", e))?;

    let local_port = get_available_port(&tunnel_store.next_port)?;
    let tunnel = crate::ssh::build_tunnel(&config, local_port)?;

    lock_err(tunnel_store.tunnels.lock())?.insert(server_id.clone(), tunnel);
    Ok(local_port)
}

#[tauri::command]
pub fn disconnect_server(
    tunnel_store: State<TunnelStore>,
    server_id: String,
) -> Result<(), String> {
    let mut tunnels = lock_err(tunnel_store.tunnels.lock())?;
    if let Some(mut tunnel) = tunnels.remove(&server_id) {
        tunnel.close();
    }
    Ok(())
}

#[tauri::command]
pub fn get_tunnel_info(tunnel_store: State<TunnelStore>) -> Vec<TunnelInfo> {
    let mut tunnels = tunnel_store.tunnels.lock().unwrap_or_else(|e| e.into_inner());
    let mut infos = Vec::new();
    for (server_id, tunnel) in tunnels.iter_mut() {
        infos.push(TunnelInfo {
            server_id: server_id.clone(),
            local_port: tunnel.local_port(),
            connected: tunnel.is_alive(),
        });
    }
    infos
}

#[tauri::command]
pub fn get_server_port(
    tunnel_store: State<TunnelStore>,
    server_id: String,
) -> Result<u16, String> {
    let tunnels = lock_err(tunnel_store.tunnels.lock())?;
    let tunnel = tunnels.get(&server_id).ok_or("隧道不存在")?;
    Ok(tunnel.local_port())
}

// ── Session API Helpers ────────────────────────────

fn get_port(tunnel_store: &TunnelStore, server_id: &str) -> Result<u16, String> {
    let tunnels = tunnel_store.tunnels.lock()
        .map_err(|e| format!("锁获取失败: {}", e))?;
    let tunnel = tunnels.get(server_id).ok_or("SSH 隧道不存在")?;
    Ok(tunnel.local_port())
}

async fn api_get<T: serde::de::DeserializeOwned>(port: u16, path: &str) -> Result<T, String> {
    let url = format!("http://127.0.0.1:{}{}", port, path);
    let body = reqwest::get(&url)
        .await
        .map_err(|e| format!("请求失败: {}", e))?
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {}", e))?;
    serde_json::from_str(&body).map_err(|e| format!("解析响应失败: {}", e))
}

async fn api_post<T: serde::de::DeserializeOwned>(port: u16, path: &str, body: &str) -> Result<T, String> {
    let url = format!("http://127.0.0.1:{}{}", port, path);
    let resp = reqwest::Client::new()
        .post(&url)
        .header("Content-Type", "application/json")
        .body(body.to_string())
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;
    let text = resp.text().await.map_err(|e| format!("读取响应失败: {}", e))?;
    serde_json::from_str(&text).map_err(|e| format!("解析响应失败: {}", e))
}

fn urlencode(s: &str) -> String {
    let mut result = String::new();
    for byte in s.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => {
                result.push(byte as char);
            }
            _ => {
                result.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    result
}

// ── Session Commands ───────────────────────────────

#[tauri::command]
pub async fn list_sessions(
    tunnel_store: State<'_, TunnelStore>,
    server_id: String,
) -> Result<Vec<SessionState>, String> {
    api_get(get_port(&tunnel_store, &server_id)?, "/api/sessions").await
}

#[tauri::command]
pub async fn discover_sessions(
    tunnel_store: State<'_, TunnelStore>,
    server_id: String,
) -> Result<DiscoverResult, String> {
    api_get(get_port(&tunnel_store, &server_id)?, "/api/sessions/discover").await
}

#[tauri::command]
pub async fn get_session(
    tunnel_store: State<'_, TunnelStore>,
    server_id: String,
    session_id: String,
) -> Result<SessionState, String> {
    api_get(get_port(&tunnel_store, &server_id)?, &format!("/api/sessions/{}", session_id)).await
}

#[tauri::command]
pub async fn get_tunnel_port_for_session(
    tunnel_store: State<'_, TunnelStore>,
    server_id: String,
) -> Result<u16, String> {
    get_port(&tunnel_store, &server_id)
}

#[tauri::command]
pub async fn poll_session_state(
    tunnel_store: State<'_, TunnelStore>,
    server_id: String,
    session_id: String,
) -> Result<SessionState, String> {
    get_session(tunnel_store, server_id, session_id).await
}

#[tauri::command]
pub async fn respond_session_permission(
    tunnel_store: State<'_, TunnelStore>,
    server_id: String,
    session_id: String,
    choice: String,
) -> Result<ApiResponse, String> {
    let port = get_port(&tunnel_store, &server_id)?;
    let path = format!("/api/sessions/{}/permission", session_id);
    let body = serde_json::json!({ "choice": choice }).to_string();
    api_post(port, &path, &body).await
}

#[tauri::command]
pub async fn start_pty_session(
    tunnel_store: State<'_, TunnelStore>,
    server_id: String,
    name: String,
    working_directory: String,
) -> Result<SessionState, String> {
    let port = get_port(&tunnel_store, &server_id)?;
    let path = format!(
        "/api/sessions?name={}&working_directory={}&start_pty=true",
        urlencode(&name), urlencode(&working_directory)
    );
    api_post(port, &path, "{}").await
}

// ── Monitor Window Commands ────────────────────────

#[tauri::command]
pub async fn open_monitor_window(
    app: tauri::AppHandle,
    server_id: String,
    session_id: String,
    session_name: String,
) -> Result<(), String> {
    let label = format!("monitor-{}", session_id);

    // 已存在则复用
    if let Some(window) = app.get_webview_window(&label) {
        window.set_always_on_top(true).ok();
        window.show().ok();
        window.set_focus().ok();
        return Ok(());
    }

    let url = format!("/?ai_monitor={}&session={}&name={}",
        server_id, session_id,
        urlencode(&session_name),
    );
    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title(format!("别摸鱼 - {}", session_name))
        .inner_size(380.0, 100.0)
        .decorations(false)
        .always_on_top(true)
        .resizable(false)
        .skip_taskbar(true)
        .transparent(true)
        .shadow(false)
        .build()
        .map_err(|e| format!("创建窗口失败: {}", e))?;

    let _ = window.set_background_color(Some(tauri::webview::Color(0, 0, 0, 0)));
    window.set_always_on_top(true).ok();
    window.set_focus().ok();

    Ok(())
}

#[tauri::command]
pub fn fix_monitor_transparent(app: tauri::AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.set_background_color(Some(tauri::webview::Color(0, 0, 0, 0)));
    }
    Ok(())
}

#[tauri::command]
pub fn close_all_monitors(app: tauri::AppHandle) -> Result<(), String> {
    for (label, window) in app.webview_windows() {
        if label.starts_with("monitor-") {
            let _ = window.close();
        }
    }
    Ok(())
}

#[tauri::command]
pub fn close_monitor_window(app: tauri::AppHandle, session_id: String) -> Result<(), String> {
    let label = format!("monitor-{}", session_id);
    if let Some(window) = app.get_webview_window(&label) {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}
