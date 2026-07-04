import { useState, useEffect, memo } from "react";
import { Button } from "antd";
import { LineOutlined, CloseOutlined } from "@ant-design/icons";
import { getCurrentWindow } from "@tauri-apps/api/window";
import dayjs from "dayjs";

function getGreetingData(): { text: string; emoji: string } {
  const hour = dayjs().hour();
  if (hour >= 6 && hour < 12) return { text: "上午好！迎着晨光全力以赴，愿你今日万事顺意。", emoji: "/emoji/1f31e_微笑的太阳.png" };
  if (hour >= 12 && hour < 14) return { text: "中午好，停下忙碌稍作休憩，好好吃饭养足精神。", emoji: "/emoji/1f35c_面条.png" };
  if (hour >= 14 && hour < 18) return { text: "下午好，调整状态继续前行，坚持终会遇见惊喜。", emoji: "/emoji/2615_热饮.png" };
  if (hour >= 18 && hour < 23) return { text: "晚上好，为今日努力的自己点赞，所有付出皆有收获。", emoji: "/emoji/2728_闪亮.png" };
  return { text: "夜深了，放下疲惫早点休息，好好善待辛苦的自己。", emoji: "/emoji/1f4a4_睡着.png" };
}

function TitleBar() {
  const [data, setData] = useState(getGreetingData);

  useEffect(() => {
    const timer = setInterval(() => setData(getGreetingData()), 60_000);
    return () => clearInterval(timer);
  }, []);

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
