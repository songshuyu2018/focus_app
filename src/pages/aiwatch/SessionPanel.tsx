import { useEffect, useState } from "react";
import { List, Button, Tag, message, Empty } from "antd";
import { EyeOutlined, ScanOutlined } from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";

interface SessionState {
  id: string; name: string; status: string;
  working_directory: string; pid: number | null;
  cc_session_id: string; started_at: string | null;
}

const statusColor: Record<string, string> = {
  idle: "default", thinking: "processing", executing: "blue",
  waiting_permission: "warning", dormant: "default", disconnected: "error",
};
const statusLabel: Record<string, string> = {
  idle: "空闲", thinking: "思考中", executing: "执行中",
  waiting_permission: "等待授权", dormant: "休眠", disconnected: "已断开",
};

interface Props {
  serverId: string | null;
}

export default function SessionPanel({ serverId }: Props) {
  const [sessions, setSessions] = useState<SessionState[]>([]);

  const fetchSessions = async () => {
    if (!serverId) return;
    try {
      const list = await invoke<SessionState[]>("list_sessions", { serverId });
      setSessions(list);
      // 同步所有会话名称到 localStorage，供监控窗读取
      for (const s of list) {
        localStorage.setItem(`__monitor_name_${s.id}`, s.name || s.id.slice(0, 8));
      }
    } catch {}
  };

  const load = () => fetchSessions();

  useEffect(() => { load(); }, [serverId]);

  // 每 3 秒自动刷新，每 10 秒自动发现
  useEffect(() => {
    if (!serverId) return;
    const loadTimer = setInterval(fetchSessions, 3000);
    const discoverTimer = setInterval(() => {
      invoke("discover_sessions", { serverId }).catch(() => {});
    }, 10000);
    return () => { clearInterval(loadTimer); clearInterval(discoverTimer); };
  }, [serverId]);

  const handleDiscover = async () => {
    if (!serverId) return;
    try {
      await invoke("discover_sessions", { serverId });
      message.success("发现完成");
      load();
    } catch (e: any) { message.error(e); }
  };

  const handleOpenMonitor = async (session: SessionState) => {
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const label = `monitor-${session.id}`;
      const existing = await WebviewWindow.getByLabel(label);
      if (existing) {
        existing.setTitle(`别摸鱼 - ${session.name || session.id.slice(0, 8)}`);
        existing.setAlwaysOnTop(true);
        existing.show();
        existing.setFocus();
        // 通过 localStorage 通知悬浮窗更新名称
        localStorage.setItem(`__monitor_name_${session.id}`, session.name || session.id.slice(0, 8));
        return;
      }
      const name = encodeURIComponent(session.name || session.id.slice(0, 8));
      new WebviewWindow(label, {
        url: `/?ai_monitor=${serverId}&session=${session.id}&name=${name}`,
        title: `别摸鱼 - ${session.name}`,
        width: 380, height: 136,
        decorations: false,
        alwaysOnTop: true,
        resizable: false,
        skipTaskbar: true,
        transparent: true,
        shadow: false,
      });
      setTimeout(() => invoke("fix_monitor_transparent", { label }).catch(() => {}), 300);
    } catch (e: any) { message.error(e); }
  };

  if (!serverId) return <Empty description="请先连接服务器" image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <strong>Claude 会话列表</strong>
        <div style={{ display: "flex", gap: 4 }}>
          <Button size="small" icon={<ScanOutlined />} onClick={handleDiscover}>发现</Button>
        </div>
      </div>

      <List
        dataSource={sessions}
        locale={{ emptyText: "暂无会话" }}
        renderItem={(s) => (
          <List.Item
            actions={[
              <Button size="small" icon={<EyeOutlined />}
                onClick={() => handleOpenMonitor(s)}>监控</Button>,
            ]}
          >
            <List.Item.Meta
              title={
                <span>{s.name || s.id.slice(0, 8)}
                  <Tag color={statusColor[s.status] || "default"} style={{ marginLeft: 8 }}>
                    {statusLabel[s.status] || s.status}
                  </Tag>
                </span>
              }
              description={
                <span style={{ fontSize: 11 }}>
                  {s.working_directory && `${s.working_directory} · `}
                  PID: {s.pid || "-"}
                </span>
              }
            />
          </List.Item>
        )}
      />
    </div>
  );
}
