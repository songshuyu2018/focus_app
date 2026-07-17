import { useEffect, useState, useRef } from "react";
import { Tag, Button, message } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";

interface SessionState {
  id: string; name: string; status: string;
  thinking?: { text: string; progress?: string };
  permission_request?: { id: string; tool: string; description: string };
}

const statusLabel: Record<string, string> = {
  idle: "空闲", thinking: "思考中", executing: "执行中",
  waiting_permission: "等待授权", dormant: "休眠", disconnected: "已断开",
};

// 目录文件列表
const IDLE_IMAGES = ["/emoji/idle/1f375_热茶.png"];
const DIED_IMAGES = ["/emoji/died/1f47b_鬼.png"];
const STUCK_IMAGES = ["/emoji/stuck/1f512_合上的锁.png"];
const THINKING_01 = ["/emoji/thinking/01/1f914_想一想.png", "/emoji/thinking/01/1f914_想一想.png"];
const THINKING_02 = ["/emoji/thinking/02/1f600_嘿嘿.png", "/emoji/thinking/01/1f92f_爆炸头.png", "/emoji/thinking/02/1f60e_墨镜笑脸.png", "/emoji/thinking/02/1f615_困扰.png", "/emoji/thinking/02/1f62e_吃惊.png", "/emoji/thinking/02/1f632_震惊.png", "/emoji/thinking/02/1f928_挑眉.png", "/emoji/thinking/02/1f9d0_带单片眼镜的脸.png"];
const WORKING_01 = ["/emoji/working/01/1f916_机器人.png"];
const WORKING_02 = ["/emoji/working/02/1f62a_困.png", "/emoji/working/02/1f634_睡着了.png", "/emoji/working/02/1f928_挑眉.png"];
const WORKING_ALL = [...WORKING_01, ...WORKING_02];

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function MonitorWindow() {
  const params = new URLSearchParams(window.location.search);
  const serverId = params.get("ai_monitor") || "";
  const sessionId = params.get("session") || "";
  const sessionName = params.get("name") || sessionId.slice(0, 8);
  const [state, setState] = useState<SessionState | null>(null);
  const [emoji, setEmoji] = useState(IDLE_IMAGES[0]);
  const statusStartRef = useRef(Date.now());
  const lastStatusRef = useRef("");
  const portRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      const outer = scrollRef.current; // overflow:hidden 的容器
      if (!outer) return;
      const inner = outer.firstElementChild as HTMLElement | null;
      if (!inner) return;
      if (inner.scrollWidth > outer.clientWidth) {
        const dur = Math.max(inner.scrollWidth / 40, 5);
        inner.style.animation = `autoScroll ${dur}s linear infinite`;
      } else {
        inner.style.animation = "none";
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [state?.thinking?.text, state?.status]);

  // 状态变化时重置计时
  useEffect(() => {
    if (state && state.status !== lastStatusRef.current) {
      lastStatusRef.current = state.status;
      statusStartRef.current = Date.now();
      setElapsedSec(0);
    }
  }, [state]);

  // 思考/执行中每秒更新计时
  useEffect(() => {
    if (!state || (state.status !== "thinking" && state.status !== "executing")) {
      setElapsedSec(0);
      return;
    }
    const timer = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - statusStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [state?.status]);

  // 每 5s 更新图片
  useEffect(() => {
    const updateEmoji = () => {
      if (!state) return;
      const elapsed = (Date.now() - statusStartRef.current) / 1000;
      const s = state.status;

      if (s === "idle" || s === "dormant") {
        setEmoji(pickRandom(IDLE_IMAGES));
      } else if (s === "disconnected") {
        setEmoji(pickRandom(DIED_IMAGES));
      } else if (s === "waiting_permission") {
        setEmoji(pickRandom(STUCK_IMAGES));
      } else if (s === "thinking") {
        setEmoji(elapsed < 30 ? THINKING_01[0] : THINKING_01[1]);
        // 跳过前30s，10%概率随机切换 thinking/02，持续5s
        if (elapsed > 30 && Math.random() < 0.1) {
          setEmoji(pickRandom(THINKING_02));
          setTimeout(() => {
            const nowElapsed = (Date.now() - statusStartRef.current) / 1000;
            setEmoji(nowElapsed < 30 ? THINKING_01[0] : THINKING_01[1]);
          }, 5000);
        }
      } else if (s === "executing") {
        setEmoji(WORKING_01[0]);
        // 跳过前30s，每30s有30%概率随机切换
        if (elapsed >30 && Math.floor(elapsed / 30) !== Math.floor((elapsed - 5) / 30) && Math.random() < 0.3) {
          setEmoji(pickRandom(WORKING_ALL));
          setTimeout(() => setEmoji(WORKING_01[0]), 5000);
        }
      }
    };

    updateEmoji();
    const timer = setInterval(updateEmoji, 5000);
    return () => clearInterval(timer);
  }, [state]);

  // 透明背景 + 禁用文本选择 + 滚动动画
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      html, body, #root { background: transparent !important; }
      * { user-select: none !important; -webkit-user-select: none !important; }
      @keyframes autoScroll {
        0% { transform: translateX(0); }
        100% { transform: translateX(-100%); }
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      html, body, #root { background: transparent !important; }
      * { user-select: none !important; -webkit-user-select: none !important; }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // 非交互区域拖拽窗口
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("button, .ant-btn, .ant-tag, input, a, [data-no-drag]")) return;
      getCurrentWindow().startDragging();
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, []);

  // WebSocket + 轮询
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const init = async () => {
      try {
        portRef.current = await invoke<number>("get_tunnel_port_for_session", { serverId });
        const eventName = `monitor:state:${sessionId}`;
        unlisten = await listen<string>(eventName, (e) => {
          try { setState(JSON.parse(e.payload)); } catch {}
        });
        await invoke("start_monitor_ws", { serverId, sessionId, localPort: portRef.current });
      } catch {}
    };
    init();
    const pollTimer = setInterval(async () => {
      try { setState(await invoke<SessionState>("poll_session_state", { serverId, sessionId })); } catch {}
    }, 3000);
    return () => {
      unlisten?.();
      clearInterval(pollTimer);
      invoke("stop_monitor_ws", { serverId, sessionId }).catch(() => {});
    };
  }, []);

  const handleRespond = async (choice: string) => {
    try { await invoke("respond_session_permission", { serverId, sessionId, choice }); }
    catch (e: any) { message.error(e); }
  };

  return (
    <div data-tauri-drag-region style={{
      background: state?.status === "waiting_permission"
        ? "rgba(80, 0, 0, 0.8)"
        : "rgba(20,20,20,0.95)",
      padding: "10px 12px", userSelect: "none",
      cursor: "grab", borderRadius: 12, overflow: "hidden",
    }}>
      {/* 标题栏 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.85)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 10, height: 10, borderRadius: "50%", display: "inline-block", flexShrink: 0,
            background:
              state?.status === "idle" || state?.status === "dormant" ? "#faad14" :
              state?.status === "thinking" || state?.status === "executing" ? "#52c41a" :
              state?.status === "waiting_permission" ? "#f5222d" :
              state?.status === "disconnected" ? "#888" : "#faad14",
          }} />
          {decodeURIComponent(sessionName)}
        </span>
        <Button type="text" size="small" icon={<CloseOutlined />}
          data-tauri-drag-region="false"
          onClick={() => getCurrentWindow().close()} />
      </div>

      {/* 主体：左侧图片 + 右侧信息 */}
      <div style={{ flex: 1, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <img src={emoji} alt="" style={{
          width: 60, height: 60, objectFit: "contain", flexShrink: 0,
        }} />

        <div style={{ flex: 1, overflow: "auto" }}>
          {state && (
            <>
              <div style={{ marginBottom: 6 }}>
                <Tag color={
                  state.status === "idle" || state.status === "dormant" ? "gold" :
                  state.status === "thinking" || state.status === "executing" ? "success" :
                  state.status === "waiting_permission" ? "error" :
                  state.status === "disconnected" ? "default" : "default"
                }>{statusLabel[state.status] || state.status}
                  {(state.status === "thinking" || state.status === "executing") && ` (${elapsedSec}s)`}
                </Tag>
              </div>

              <div ref={scrollRef} style={{
                fontSize: 12, color: "rgba(255,255,255)", marginBottom: 6,
                background: "rgba(255,255,255,0.06)", borderRadius: 4,
                padding: "6px 8px", overflow: "hidden", whiteSpace: "nowrap",
              }}>
                <div style={{
                  display: "inline-block", whiteSpace: "nowrap",
                }}>
                {(state.status === "idle" || state.status === "dormant") && (
                  <span style={{ color: "rgb(255, 255, 255)" }}>等待用户的指令</span>
                )}
                {state.status === "waiting_permission" && (
                  <span style={{ color: "rgb(255, 255, 255)" }}>请在cmd窗口授权</span>
                )}
                {state.status === "disconnected" && (
                  <span style={{ color: "rgb(255, 255, 255)" }}>会话已结束</span>
                )}
                {(state.status === "thinking" || state.status === "executing") && state.thinking && (
                  <span>{state.thinking.text}{state.thinking.progress ? ` (${state.thinking.progress})` : ""}</span>
                )}
                </div>
              </div>

              {state.permission_request && (
                <div style={{ background: "rgba(250,173,20,0.15)", borderRadius: 4, padding: 8 }}>
                  <div style={{ fontSize: 12, color: "#faad14", marginBottom: 4 }}>
                    权限请求: {state.permission_request.tool}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>
                    {state.permission_request.description}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <Button size="small" type="primary" onClick={() => handleRespond("allow")}>允许</Button>
                    <Button size="small" danger onClick={() => handleRespond("deny")}>拒绝</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
