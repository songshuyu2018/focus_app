mod commands;
mod db;
mod error;
mod models;
mod ssh;
mod ws_relay;

use rusqlite::Connection;
use std::sync::Mutex;
use tauri::Manager;
use crate::ssh::SshTunnel;

pub struct AppState {
    pub db: Mutex<Connection>,
}

fn now_iso() -> String {
    chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().expect("failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir).expect("failed to create app data dir");
            let db_path = app_data_dir.join("focus.db");

            let conn = Connection::open(&db_path)
                .unwrap_or_else(|e| panic!("无法打开数据库 {}: {}", db_path.display(), e));
            db::initialize(&conn).expect("数据库初始化失败");

            app.manage(AppState {
                db: Mutex::new(conn),
            });
            app.manage(commands::ai_watch::TunnelStore::new());
            app.manage(ws_relay::WsRelay::new());

            // 后台定时检查喝水提醒
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    let mut last_minute = String::new();
                    loop {
                        std::thread::sleep(std::time::Duration::from_secs(2));
                        let now = chrono::Local::now().format("%H:%M").to_string();
                        if now == last_minute { continue; }
                        last_minute = now.clone();
                        let db_state = handle.state::<AppState>();
                        let db = db_state.db.lock().unwrap();
                        let raw: Result<String, _> = db.query_row(
                            "SELECT data FROM water_reminders WHERE id = 'singleton'",
                            [],
                            |row| row.get(0),
                        );
                        drop(db);
                        if let Ok(raw) = raw {
                            if let Ok(reminders) = serde_json::from_str::<Vec<serde_json::Value>>(&raw) {
                                for r in &reminders {
                                    if r["time"].as_str() == Some(&now) {
                                        if handle.get_webview_window("water-reminder").is_none() {
                                            let _ = tauri::WebviewWindowBuilder::new(
                                                &handle,
                                                "water-reminder",
                                                tauri::WebviewUrl::App(format!("/?reminder={}", &now).into()),
                                            )
                                            .fullscreen(true)
                                            .always_on_top(true)
                                            .title("提醒")
                                            .build();
                                        }
                                        break;
                                    }
                                }
                            }
                        }
                    }
                });
            }

            // 主窗口关闭时关闭悬浮窗 + 监控窗口 + 清理 SSH 隧道
            if let Some(main) = app.get_webview_window("main") {
                let handle = app.handle().clone();
                main.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                        if let Some(fw) = handle.get_webview_window("floating-bar") {
                            let _ = fw.close();
                        }
                        // 关闭所有监控窗口
                        for (label, w) in handle.webview_windows() {
                            if label.starts_with("monitor-") {
                                let _ = w.close();
                            }
                        }
                        // 清理所有 SSH 隧道
                        if let Some(store) = handle.try_state::<commands::ai_watch::TunnelStore>() {
                            if let Ok(mut tunnels) = store.tunnels.lock() {
                                for (_, mut t) in tunnels.drain() {
                                    t.close();
                                }
                            }
                        }
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::tag::create_tag,
            commands::tag::delete_tag,
            commands::tag::list_tags,
            commands::task::create_task,
            commands::task::update_task,
            commands::task::delete_task,
            commands::task::complete_task,
            commands::task::add_progress,
            commands::task::get_task,
            commands::task::list_tasks,
            commands::timeline::set_timeline_settings,
            commands::timeline::get_timeline_settings,
            commands::timeline::start_timeline_event,
            commands::timeline::update_timeline_event,
            commands::timeline::end_current_event,
            commands::timeline::get_current_event,
            commands::timeline::get_today_timeline,
            commands::timeline::get_today_stats,
            commands::report::generate_report_by_date,
            commands::report::generate_report_by_tag,
            commands::water::save_water_reminders,
            commands::water::load_water_reminders,
            commands::water::toggle_floating_window,
            commands::water::save_floating_position,
            commands::water::get_floating_position,
            commands::water::save_titlebar_config,
            commands::water::load_titlebar_config,
            commands::water::check_water_reminder,
            commands::water::clear_all_data,
            commands::ai_watch::list_servers,
            commands::ai_watch::add_server,
            commands::ai_watch::update_server,
            commands::ai_watch::delete_server,
            commands::ai_watch::connect_server,
            commands::ai_watch::disconnect_server,
            commands::ai_watch::get_tunnel_info,
            commands::ai_watch::get_server_port,
            commands::ai_watch::list_sessions,
            commands::ai_watch::discover_sessions,
            commands::ai_watch::get_session,
            commands::ai_watch::poll_session_state,
            commands::ai_watch::get_tunnel_port_for_session,
            commands::ai_watch::respond_session_permission,
            commands::ai_watch::start_pty_session,
            commands::ai_watch::open_monitor_window,
            commands::ai_watch::fix_monitor_transparent,
            commands::ai_watch::close_all_monitors,
            commands::ai_watch::close_monitor_window,
            ws_relay::start_monitor_ws,
            ws_relay::stop_monitor_ws,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
