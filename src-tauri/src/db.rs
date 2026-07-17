use rusqlite::Connection;

pub fn initialize(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS tags (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL UNIQUE,
            created_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id                      TEXT PRIMARY KEY,
            title                   TEXT NOT NULL,
            description             TEXT NOT NULL DEFAULT '',
            priority                TEXT NOT NULL CHECK(priority IN ('high','medium','low')),
            progress                INTEGER NOT NULL DEFAULT 0 CHECK(progress >= 0 AND progress <= 100),
            planned_date            TEXT,
            start_time              TEXT NOT NULL,
            actual_completion_time  TEXT,
            created_at              TEXT NOT NULL,
            updated_at              TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS task_tags (
            task_id  TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            tag_id   TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (task_id, tag_id)
        );

        CREATE TABLE IF NOT EXISTS progress_logs (
            id            TEXT PRIMARY KEY,
            task_id       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            timestamp     TEXT NOT NULL,
            description   TEXT NOT NULL,
            progress      INTEGER NOT NULL CHECK(progress >= 0 AND progress <= 100)
        );

        CREATE INDEX IF NOT EXISTS idx_progress_logs_task
            ON progress_logs(task_id, timestamp);

        CREATE TABLE IF NOT EXISTS timeline_settings (
            id          TEXT PRIMARY KEY,
            date        TEXT NOT NULL UNIQUE,
            start_time  TEXT NOT NULL,
            end_time    TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS timeline_events (
            id              TEXT PRIMARY KEY,
            date            TEXT NOT NULL,
            mode            TEXT NOT NULL CHECK(mode IN ('task','meeting','rest','complete')),
            start_time      TEXT NOT NULL,
            end_time        TEXT,
            task_id         TEXT REFERENCES tasks(id) ON DELETE SET NULL,
            task_title      TEXT,
            meeting_notes   TEXT,
            meeting_minutes TEXT,
            meeting_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
            created_at      TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_timeline_events_date
            ON timeline_events(date);

        CREATE TABLE IF NOT EXISTS ai_servers (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            host        TEXT NOT NULL,
            port        INTEGER NOT NULL,
            username    TEXT NOT NULL,
            auth_type   TEXT NOT NULL,
            password    TEXT,
            key_path    TEXT
        );

        CREATE TABLE IF NOT EXISTS water_reminders (
            id      TEXT PRIMARY KEY,
            data    TEXT NOT NULL
        );
        ",
    )?;

    // 迁移：添加 task_title 列 + 更新 CHECK 约束
    migrate_timeline_events(conn)?;

    Ok(())
}

fn migrate_timeline_events(conn: &Connection) -> Result<(), rusqlite::Error> {
    // 尝试添加 task_title 列（如果已存在则忽略错误）
    let _ = conn.execute("ALTER TABLE timeline_events ADD COLUMN task_title TEXT", []);
    // 添加 meeting_minutes 列
    let _ = conn.execute("ALTER TABLE timeline_events ADD COLUMN meeting_minutes TEXT", []);

    // 尝试插入一条 complete 模式来检测约束是否已更新
    let test_ok = conn
        .execute(
            "INSERT INTO timeline_events (id, date, mode, start_time, end_time, created_at)
             VALUES ('_migration_test', '2000-01-01', 'complete', '2000-01-01T00:00:00', '2000-01-01T00:00:00', '2000-01-01T00:00:00')",
            [],
        )
        .is_ok();

    if test_ok {
        // 约束正确，删除测试行
        conn.execute("DELETE FROM timeline_events WHERE id = '_migration_test'", [])?;
        return Ok(());
    }

    // 约束需要更新：重建表（保留 task_title 列）
    conn.execute_batch(
        "
        CREATE TABLE timeline_events_new (
            id              TEXT PRIMARY KEY,
            date            TEXT NOT NULL,
            mode            TEXT NOT NULL CHECK(mode IN ('task','meeting','rest','complete')),
            start_time      TEXT NOT NULL,
            end_time        TEXT,
            task_id         TEXT REFERENCES tasks(id) ON DELETE SET NULL,
            task_title      TEXT,
            meeting_notes   TEXT,
            meeting_minutes TEXT,
            meeting_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
            created_at      TEXT NOT NULL
        );

        INSERT INTO timeline_events_new
            (id, date, mode, start_time, end_time, task_id, task_title, meeting_notes, meeting_minutes, meeting_task_id, created_at)
            SELECT id, date, mode, start_time, end_time, task_id, task_title, meeting_notes, meeting_minutes, meeting_task_id, created_at
            FROM timeline_events;

        DROP TABLE timeline_events;

        ALTER TABLE timeline_events_new RENAME TO timeline_events;

        CREATE INDEX IF NOT EXISTS idx_timeline_events_date
            ON timeline_events(date);
        ",
    )?;

    Ok(())
}
