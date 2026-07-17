import { useEffect, useState } from "react";
import { Card, Button, Space, Tag, Popconfirm, message, Empty } from "antd";
import { PlusOutlined, DeleteOutlined, LinkOutlined, DisconnectOutlined } from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";
import ServerFormModal from "./ServerFormModal";

interface ServerConfig {
  id: string; name: string; host: string; port: number;
  username: string; authType: "password" | "key";
}
interface TunnelInfo { server_id: string; local_port: number; connected: boolean; }

interface Props {
  onSelect: (serverId: string) => void;
  activeId: string | null;
}

export default function ServerPanel({ onSelect, activeId }: Props) {
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [tunnels, setTunnels] = useState<TunnelInfo[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<ServerConfig | null>(null);

  const loadServers = async () => {
    try {
      setServers(await invoke<ServerConfig[]>("list_servers"));
    } catch (e: any) { message.error(e); }
  };

  const loadTunnels = async () => {
    try {
      setTunnels(await invoke<TunnelInfo[]>("get_tunnel_info"));
    } catch (_) {}
  };

  useEffect(() => { loadServers(); loadTunnels(); }, []);
  useEffect(() => {
    const t = setInterval(loadTunnels, 5000);
    return () => clearInterval(t);
  }, []);

  const isConnected = (id: string) => tunnels.some((t) => t.server_id === id && t.connected);

  const handleConnect = async (id: string) => {
    setConnecting(id);
    try {
      await invoke("connect_server", { serverId: id });
      message.success("已连接");
      loadTunnels();
      onSelect(id);
    } catch (e: any) { message.error(e); }
    setConnecting(null);
  };

  const handleDisconnect = async (id: string) => {
    try {
      await invoke("disconnect_server", { serverId: id });
      await invoke("close_all_monitors");
      if (id === activeId) onSelect("");
      message.success("已断开");
      loadTunnels();
    } catch (e: any) { message.error(e); }
  };

  const handleDelete = async (id: string) => {
    try {
      if (isConnected(id)) {
        await invoke("disconnect_server", { serverId: id });
        await invoke("close_all_monitors");
      }
      await invoke("delete_server", { id });
      if (id === activeId) onSelect("");
      loadServers();
      loadTunnels();
    } catch (e: any) { message.error(e); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <strong>服务器列表</strong>
        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => {
          setEditingServer(null);
          setModalOpen(true);
        }}>添加</Button>
      </div>

      {servers.length === 0 ? (
        <Empty description="暂无服务器" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Space direction="vertical" style={{ width: "100%" }}>
          {servers.map((s) => {
            const connected = isConnected(s.id);
            return (
              <Card
                key={s.id}
                size="small"
                hoverable
                style={{
                  cursor: connected ? "pointer" : "default",
                  background: activeId === s.id ? "rgba(114, 46, 209, 0.15)" : undefined,
                }}
                onClick={() => connected && onSelect(s.id)}
              >
                <div style={{ fontSize: 13, fontWeight: 500 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", margin: "2px 0" }}>
                  {s.username}@{s.host}:{s.port}
                </div>
                <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <Tag color={s.authType === "key" ? "blue" : "orange"}>
                    {s.authType === "key" ? "系统公钥" : "密码"}
                  </Tag>
                  {connected && <Tag color="green">已连接</Tag>}
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
                  {connected ? (
                    <Button size="small" danger icon={<DisconnectOutlined />}
                      onClick={(e) => { e.stopPropagation(); handleDisconnect(s.id); }}>断开</Button>
                  ) : (
                    <Button size="small" type="primary" icon={<LinkOutlined />}
                      loading={connecting === s.id}
                      onClick={(e) => { e.stopPropagation(); handleConnect(s.id); }}>连接</Button>
                  )}
                  <Popconfirm title="确定删除？" onConfirm={() => handleDelete(s.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </div>
              </Card>
            );
          })}
        </Space>
      )}

      <ServerFormModal open={modalOpen} server={editingServer} onClose={() => {
        setModalOpen(false);
        loadServers();
      }} />
    </div>
  );
}
