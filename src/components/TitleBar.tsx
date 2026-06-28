import { Button } from "antd";
import { LineOutlined, CloseOutlined } from "@ant-design/icons";
import { getCurrentWindow } from "@tauri-apps/api/window";

function TitleBar() {
  const handleMinimize = () => {
    getCurrentWindow().minimize();
  };

  const handleClose = () => {
    getCurrentWindow().close();
  };

  return (
    <div className="titlebar" data-tauri-drag-region>
      <span className="titlebar-title">Hello Tauri</span>
      <div className="titlebar-controls" data-tauri-drag-region="false">
        <Button
          type="text"
          size="small"
          icon={<LineOutlined />}
          onClick={handleMinimize}
        />
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          onClick={handleClose}
        />
      </div>
    </div>
  );
}

export default TitleBar;
