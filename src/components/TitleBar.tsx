import { useState, useEffect, memo, useCallback } from "react";
import { Button } from "antd";
import { LineOutlined, CloseOutlined } from "@ant-design/icons";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import dayjs from "dayjs";

interface TitleBarItem {
  time: string; icon: string; text: string;
}

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

const DEFAULT_CONFIG: TitleBarItem[] = [
  { time: "06:00", icon: "/emoji/1f31e_微笑的太阳.png", text: "上午好！迎着晨光全力以赴，愿你今日万事顺意。" },
  { time: "12:00", icon: "/emoji/1f35c_面条.png", text: "中午好，停下忙碌稍作休憩，好好吃饭养足精神。" },
  { time: "14:00", icon: "/emoji/2615_热饮.png", text: "下午好，调整状态继续前行，坚持终会遇见惊喜。" },
  { time: "18:00", icon: "/emoji/2728_闪亮.png", text: "晚上好，为今日努力的自己点赞，所有付出皆有收获。" },
  { time: "23:00", icon: "/emoji/1f4a4_睡着.png", text: "夜深了，放下疲惫早点休息，好好善待辛苦的自己。" },
];

function matchConfig(totalMin: number, cfg: TitleBarItem[]): TitleBarItem {
  const sorted = [...cfg].sort((a, b) => toMinutes(b.time) - toMinutes(a.time));
  return sorted.find((c) => totalMin >= toMinutes(c.time)) || sorted[0];
}

function TitleBar() {
  const [data, setData] = useState(() => {
    const def = matchConfig(dayjs().hour() * 60 + dayjs().minute(), DEFAULT_CONFIG);
    return { text: def.text, emoji: def.icon };
  });
  const [customConfig, setCustomConfig] = useState<TitleBarItem[] | null>(null);

  const loadConfig = useCallback(() => {
    invoke<string>("load_titlebar_config").then((raw) => {
      try {
        const arr = JSON.parse(raw) as TitleBarItem[];
        setCustomConfig(arr.length > 0 ? arr : null);
      } catch {}
    }).catch(() => {});
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // 监听配置变更事件
  useEffect(() => {
    const handler = () => loadConfig();
    window.addEventListener("titlebar-config-changed", handler);
    return () => window.removeEventListener("titlebar-config-changed", handler);
  }, [loadConfig]);

  const getGreeting = useCallback(() => {
    const totalMin = dayjs().hour() * 60 + dayjs().minute();
    const cfg = customConfig || DEFAULT_CONFIG;
    const match = matchConfig(totalMin, cfg);
    return { text: match.text, emoji: match.icon };
  }, [customConfig]);

  useEffect(() => {
    setData(getGreeting());
    const timer = setInterval(() => setData(getGreeting()), 1_000);
    return () => clearInterval(timer);
  }, [getGreeting]);

  return (
    <div className="titlebar" data-tauri-drag-region>
      <span className="titlebar-title">
        <img src={data.emoji} alt="" className="titlebar-emoji" />
        {data.text}
      </span>
      <div className="titlebar-controls" data-tauri-drag-region="false">
        <Button
          type="text"
          size="small"
          icon={<LineOutlined />}
          onClick={() => getCurrentWindow().minimize()}
        />
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          onClick={() => getCurrentWindow().close()}
        />
      </div>
    </div>
  );
}

export default memo(TitleBar);
