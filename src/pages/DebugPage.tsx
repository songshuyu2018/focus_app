import { useState, useEffect } from "react";
import { Button, Popconfirm, message, Card, Table, Modal, Input, Select, TimePicker } from "antd";
import { DeleteOutlined, PlusOutlined, EditOutlined, UploadOutlined } from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";
import dayjs from "dayjs";
import { EMOJI_IMAGES } from "../emojiList";

interface TitleBarItem {
  time: string; icon: string; text: string;
}

const DEFAULT_CONFIG: TitleBarItem[] = [
  { time: "06:00", icon: "/emoji/1f31e_微笑的太阳.png", text: "上午好！迎着晨光全力以赴，愿你今日万事顺意。" },
  { time: "12:00", icon: "/emoji/1f35c_面条.png", text: "中午好，停下忙碌稍作休憩，好好吃饭养足精神。" },
  { time: "14:00", icon: "/emoji/2615_热饮.png", text: "下午好，调整状态继续前行，坚持终会遇见惊喜。" },
  { time: "18:00", icon: "/emoji/2728_闪亮.png", text: "晚上好，为今日努力的自己点赞，所有付出皆有收获。" },
  { time: "23:00", icon: "/emoji/1f4a4_睡着.png", text: "夜深了，放下疲惫早点休息，好好善待辛苦的自己。" },
];

function DebugPage() {
  const [config, setConfig] = useState<TitleBarItem[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editIcon, setEditIcon] = useState("");
  const [editText, setEditText] = useState("");
  const [editTime, setEditTime] = useState(dayjs("06:00", "HH:mm"));

  useEffect(() => {
    invoke<string>("load_titlebar_config").then((raw) => {
      try {
        const arr = JSON.parse(raw) as TitleBarItem[];
        setConfig(arr.length > 0 ? arr : [...DEFAULT_CONFIG]);
      } catch { setConfig([...DEFAULT_CONFIG]); }
    }).catch(() => { setConfig([...DEFAULT_CONFIG]); });
  }, []);

  const save = async (cfg: TitleBarItem[]) => {
    setConfig(cfg);
    try {
      await invoke("save_titlebar_config", { data: JSON.stringify(cfg) });
    } catch (e: any) { message.error("保存失败: " + e); }
  };

  const addRow = () => {
    setEditIndex(null);
    setEditTime(dayjs("06:00", "HH:mm"));
    setEditIcon(EMOJI_IMAGES[0]);
    setEditText("");
    setEditOpen(true);
  };

  const editRow = (item: TitleBarItem) => {
    setEditIndex(config.findIndex((r) => r.time === item.time));
    setEditTime(dayjs(item.time, "HH:mm"));
    setEditIcon(item.icon);
    setEditText(item.text);
    setEditOpen(true);
  };

  const deleteRow = (item: TitleBarItem) => {
    save(config.filter((r) => r.time !== item.time));
    window.dispatchEvent(new Event("titlebar-config-changed"));
  };

  const handleEditSave = () => {
    const row: TitleBarItem = { time: editTime.format("HH:mm"), icon: editIcon, text: editText };
    // 检查重复时间
    if (editIndex === null && config.some((r) => r.time === row.time)) {
      message.warning("该时间已存在");
      return;
    }
    const updated = editIndex !== null
      ? config.map((r, i) => i === editIndex ? row : r)
      : [...config, row];
    save(updated);
    window.dispatchEvent(new Event("titlebar-config-changed"));
    setEditOpen(false);
  };

  const resetDefault = () => {
    save([...DEFAULT_CONFIG]);
    window.dispatchEvent(new Event("titlebar-config-changed"));
  };

  const handleClear = async () => {
    try {
      await invoke("clear_all_data");
      message.success("所有数据已清除");
    } catch (e: any) { message.error("清除失败: " + e); }
  };

  return (
    <div className="panel">
      <h2>设置</h2>

      <Card title="标题栏配置" size="small" style={{ marginBottom: 16, width: "100%" }}>
        <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
          <Button icon={<PlusOutlined />} onClick={addRow}>添加时段</Button>
          <Button onClick={resetDefault}>恢复默认</Button>
        </div>
        <Table
          dataSource={[...config].sort((a, b) => a.time.localeCompare(b.time)).map((r, i) => ({ ...r, key: i }))}
          pagination={false}
          columns={[
            { title: "开始时间", dataIndex: "time", width: 100 },
            {
              title: "图标", dataIndex: "icon", width: 60,
              render: (icon: string) => <img src={icon} alt="" style={{ width: 28, height: 28 }} />,
            },
            { title: "文字", dataIndex: "text", ellipsis: true },
            {
              title: "操作", width: 100,
              render: (_: unknown, item: TitleBarItem & { key: number }) => (
                <div style={{ display: "flex", gap: 4 }}>
                  <Button size="small" icon={<EditOutlined />} onClick={() => editRow(item)} />
                  <Popconfirm title="确认删除？" onConfirm={() => deleteRow(item)}
                    disabled={config.length <= 1}>
                    <Button size="small" danger icon={<DeleteOutlined />} disabled={config.length <= 1} />
                  </Popconfirm>
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Card title="数据管理" size="small" style={{ width: "100%", marginBottom: 16 }}>
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
      </Card>

      <Card title="关于" size="small" style={{ width: "100%" }}>
        <div style={{ color: "rgba(255,255,255,0.85)", lineHeight: 1.8 }}>
          <div><strong>Focus</strong> v0.2.0</div>
          <div style={{ color: "rgba(255,255,255,0.45)" }}>Developed by deepseek & songshuyu</div>
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, marginTop: 8 }}>
            Tauri 2.0 + React 18 + Ant Design 6.x
          </div>
        </div>
      </Card>

      <Modal
        title={editIndex !== null ? "编辑时段" : "添加时段"}
        open={editOpen}
        onOk={handleEditSave}
        onCancel={() => setEditOpen(false)}
        okText="保存"
        cancelText="取消"
      >
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 12 }}>开始时间</label>
          <TimePicker
            value={editTime}
            onChange={(v) => setEditTime(v ?? dayjs("06:00", "HH:mm"))}
            format="HH:mm"
            minuteStep={5}
            style={{ width: 140 }}
          />
          <span style={{ marginLeft: 8, fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
            从该时间开始直到下一个时段
          </span>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 12 }}>图标</label>
          <Select
            value={EMOJI_IMAGES.includes(editIcon) ? editIcon : undefined}
            onChange={(v) => setEditIcon(v)}
            placeholder="选择预设图标"
            allowClear
            style={{ width: "100%", marginBottom: 8 }}
            options={EMOJI_IMAGES.map((path) => ({
              value: path,
              label: (
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <img src={path} alt="" style={{ width: 24, height: 24 }} />
                  {path.split("/").pop()?.replace(".png", "").replace(/^[a-f0-9]+_/, "")}
                </span>
              ),
            }))}
          />
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <Input value={editIcon} onChange={(e) => setEditIcon(e.target.value)} placeholder="或输入自定义图片路径/URL" />
            <input type="file" accept="image/*" style={{ display: "none" }} id="titlebar-icon-input"
              onClick={(e) => { (e.target as HTMLInputElement).value = ""; }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = () => setEditIcon(reader.result as string);
                  reader.readAsDataURL(file);
                }
              }}
            />
            <Button icon={<UploadOutlined />} onClick={() => document.getElementById("titlebar-icon-input")?.click()}>
              选择文件
            </Button>
          </div>
          <div style={{ textAlign: "center" }}>
            <img src={editIcon} alt="" style={{ width: 48, height: 48, objectFit: "contain" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          </div>
        </div>
        <div>
          <label style={{ display: "block", marginBottom: 4, fontSize: 12 }}>文字</label>
          <Input value={editText} onChange={(e) => setEditText(e.target.value)} placeholder="提示文字" />
        </div>
      </Modal>
    </div>
  );
}

export default DebugPage;
