use std::collections::HashMap;
use std::sync::Mutex;
use futures_util::StreamExt;
use tauri::Emitter;
use tokio_tungstenite::connect_async;

pub struct WsRelay {
    pub tasks: Mutex<HashMap<String, tokio::task::JoinHandle<()>>>,
}

impl WsRelay {
    pub fn new() -> Self {
        Self { tasks: Mutex::new(HashMap::new()) }
    }
}

#[tauri::command]
pub async fn start_monitor_ws(
    app: tauri::AppHandle,
    relay: tauri::State<'_, WsRelay>,
    server_id: String,
    session_id: String,
    local_port: u16,
) -> Result<(), String> {
    let key = format!("{}-{}", server_id, session_id);
    {
        let mut tasks = relay.tasks.lock().unwrap();
        if let Some(handle) = tasks.remove(&key) {
            handle.abort();
        }
    }

    let url = format!("ws://127.0.0.1:{}/api/ws/sessions/{}", local_port, session_id);
    let ws = connect_async(&url).await.map_err(|e| format!("WebSocket 连接失败: {}", e))?;

    let (_, mut read) = ws.0.split();
    let app_handle = app.clone();
    let key_clone = key.clone();
    let event_name = format!("monitor:state:{}", session_id);

    let handle = tokio::spawn(async move {
        while let Some(msg) = read.next().await {
            match msg {
                Ok(tokio_tungstenite::tungstenite::Message::Text(text)) => {
                    let _ = app_handle.emit(&event_name, &text);
                }
                Ok(tokio_tungstenite::tungstenite::Message::Close(_)) => break,
                _ => {}
            }
        }
    });

    relay.tasks.lock().unwrap().insert(key_clone, handle);
    Ok(())
}

#[tauri::command]
pub fn stop_monitor_ws(
    relay: tauri::State<'_, WsRelay>,
    server_id: String,
    session_id: String,
) -> Result<(), String> {
    let key = format!("{}-{}", server_id, session_id);
    if let Some(handle) = relay.tasks.lock().unwrap().remove(&key) {
        handle.abort();
    }
    Ok(())
}
