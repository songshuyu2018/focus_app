import { Button, Popconfirm, message } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";

function DebugPage() {
  const handleClear = async () => {
    try {
      await invoke("clear_all_data");
      message.success("所有数据已清除");
    } catch (e: any) { message.error("清除失败: " + e); }
  };

  return (
    <div className="panel">
      <h2>调试</h2>
      <Popconfirm
        title="清除所有数据"
        description="此操作将删除所有任务、时间线、标签、提醒数据，不可恢复！"
        onConfirm={handleClear}
        okText="确认清除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <Button type="primary" danger icon={<DeleteOutlined />}>
          清除所有数据
        </Button>
      </Popconfirm>
    </div>
  );
}

export default DebugPage;
