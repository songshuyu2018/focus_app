import { useEffect, useState, useCallback } from "react";
import { Radio, message } from "antd";
import { invoke } from "@tauri-apps/api/core";

function FloatingBar() {
  const [mode, setMode] = useState<string>("");

  const loadData = useCallback(() => {
    try {
      const raw = localStorage.getItem("__floating_mode");
      if (raw) setMode(raw);
    } catch {}
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `html, body, #root { background: transparent !important; }`;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  useEffect(() => {
    const timer = setInterval(loadData, 5_000);
    return () => clearInterval(timer);
  }, [loadData]);

  useEffect(() => {
    const onStorage = () => loadData();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [loadData]);

  const handleModeChange = async (m: string) => {
    if (m === mode) return;
    try {
      if (mode) {
        await invoke("end_current_event");
      }
      await invoke("start_timeline_event", {
        params: {
          mode: m,
          task_id: null,
          meeting_notes: null,
          meeting_task_id: null,
        },
      });
      localStorage.setItem("__floating_mode", m);
      setMode(m);
      message.success(`已切换到${m === "task" ? "专注" : m === "meeting" ? "会议" : "休息"}模式`);
      if (m === "rest") localStorage.setItem("__floating_celebration", "/emoji/1f929_好崇拜哦.png");
      localStorage.setItem("__floating_refresh", Date.now().toString());
    } catch (e: any) { message.error(e); }
  };

  return (
    <div
      data-tauri-drag-region
      style={{
        height: "100vh", display: "flex",
        alignItems: "center", justifyContent: "center",
        userSelect: "none",
      }}
    >
      <div data-tauri-drag-region="false">
        <Radio.Group
          value={mode}
          optionType="button"
          buttonStyle="solid"
          size="small"
          onChange={(e) => handleModeChange(e.target.value)}
        >
          <Radio.Button
            value="task"
            style={mode === "task" ? {
              background: "linear-gradient(135deg, #52c41a, #1677ff)",
              borderColor: "transparent", color: "#fff", fontWeight: 600,
            } : undefined}
          >专注</Radio.Button>
          <Radio.Button
            value="meeting"
            style={mode === "meeting" ? {
              background: "linear-gradient(135deg, #fa8c16, #f5222d)",
              borderColor: "transparent", color: "#fff", fontWeight: 600,
            } : undefined}
          >会议</Radio.Button>
          <Radio.Button
            value="rest"
            style={mode === "rest" ? {
              background: "linear-gradient(135deg, #1677ff, #722ed1)",
              borderColor: "transparent", color: "#fff", fontWeight: 600,
            } : undefined}
          >休息</Radio.Button>
        </Radio.Group>
      </div>
    </div>
  );
}

export default FloatingBar;
