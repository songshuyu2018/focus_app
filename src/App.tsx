import { useState, useEffect } from "react";
import { ConfigProvider, theme, Layout, Menu } from "antd";
import {
  HomeOutlined, UnorderedListOutlined,
  FileTextOutlined, SettingOutlined,
  CoffeeOutlined,
} from "@ant-design/icons";
import { getCurrentWindow } from "@tauri-apps/api/window";
import TitleBar from "./components/TitleBar";
import HomePage from "./pages/HomePage";
import TaskPage from "./pages/TaskPage";
import ReportPage from "./pages/ReportPage";
import DebugPage from "./pages/DebugPage";
import WaterPage from "./pages/WaterPage";
import FloatingBar from "./pages/FloatingBar";
import "./App.css";

const { Sider, Content } = Layout;

const menuItems = [
  { key: "home", icon: <HomeOutlined />, label: "首页" },
  { key: "tasks", icon: <UnorderedListOutlined />, label: "任务管理" },
  { key: "report", icon: <FileTextOutlined />, label: "报告生成" },
  { key: "water", icon: <CoffeeOutlined />, label: "喝水助手" },
  { key: "debug", icon: <SettingOutlined />, label: "设置" },
];

const pageMap: Record<string, React.ReactNode> = {
  home: <HomePage />,
  tasks: <TaskPage />,
  report: <ReportPage />,
  water: <WaterPage />,
  debug: <DebugPage />,
};

function ReminderWindow() {
  const params = new URLSearchParams(window.location.search);
  const reminderTime = params.get("reminder") || "";

  // 从 localStorage 读取提醒配置，按时间查找匹配项
  let reminderContent = "该喝水啦！";
  let reminderIcon = "/emoji/1f379_热带水果饮料.png";
  try {
    const raw = localStorage.getItem("__reminder_data");
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        const match = list.find((r: any) => r.time === reminderTime);
        if (match) {
          reminderContent = match.content || reminderContent;
          reminderIcon = match.icon || reminderIcon;
        }
      } else {
        // 兼容旧格式
        reminderContent = list.content || reminderContent;
        reminderIcon = list.icon || reminderIcon;
      }
    }
  } catch {}

  useEffect(() => {
    const timer = setTimeout(() => getCurrentWindow().close(), 30_000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      onClick={() => getCurrentWindow().close()}
      style={{
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        height: "100vh", cursor: "pointer", userSelect: "none",
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
      }}
    >
      <img src={reminderIcon} alt="" style={{ width: 200, height: 200, marginBottom: 24, objectFit: "contain" }} />
      <div style={{ fontSize: 56, fontWeight: 700, color: "#4fc3f7", marginBottom: 16 }}>{reminderContent}</div>
      <div style={{ fontSize: 28, color: "rgba(255,255,255,0.65)" }}>现在时间：{reminderTime}</div>
      <div style={{ fontSize: 18, color: "rgba(255,255,255,0.35)", marginTop: 48 }}>点击屏幕任意位置关闭</div>
    </div>
  );
}

function App() {
  const [activeKey, setActiveKey] = useState("home");
  const [collapsed, setCollapsed] = useState(true);

  const params = new URLSearchParams(window.location.search);
  if (params.get("reminder")) {
    return <ReminderWindow />;
  }
  if (params.get("floating") !== null) {
    return (
      <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: { colorPrimary: "#722ed1" } }}>
        <FloatingBar />
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: { colorPrimary: "#722ed1" },
      }}
      modal={{ mask: { blur: false } }}
      drawer={{ mask: { blur: false } }}
    >
      <div className="app-container">
        <TitleBar />
        <Layout style={{ flex: 1, overflow: "hidden", width: "100%" }}>
          <Sider
            collapsible
            collapsed={collapsed}
            collapsedWidth={64}
            onCollapse={setCollapsed}
            theme="dark"
            width={220}
            style={{ borderRight: "none" }}
          >
            <Menu
              mode="inline"
              theme="dark"
              selectedKeys={[activeKey]}
              onClick={({ key }) => setActiveKey(key)}
              items={menuItems}
              style={{ borderInlineEnd: "none" }}
            />
          </Sider>
          <Content style={{ padding: "0 24px 24px", overflow: "auto" }}>
            {pageMap[activeKey]}
          </Content>
        </Layout>
      </div>
    </ConfigProvider>
  );
}

export default App;
