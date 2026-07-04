mod commands;
mod db;
mod error;
mod models;

use rusqlite::Connection;
use std::sync::Mutex;
use tauri::Manager;

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
