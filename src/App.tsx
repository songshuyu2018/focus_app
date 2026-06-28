import { ConfigProvider, theme } from "antd";
import TitleBar from "./components/TitleBar";
import "./App.css";

function App() {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
      }}
    >
      <div className="app-container">
        <TitleBar />
        <div className="app-content">
          <h1>Hello Tauri + Ant Design</h1>
          <p>无边框窗口 Demo</p>
        </div>
      </div>
    </ConfigProvider>
  );
}

export default App;
