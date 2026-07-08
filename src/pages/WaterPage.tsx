import { useState, useEffect } from "react";
import { Button, TimePicker, Popconfirm, message, Modal, Input, Select, Table } from "antd";
import { PlusOutlined, DeleteOutlined, EditOutlined, UploadOutlined } from "@ant-design/icons";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import dayjs from "dayjs";
import { EMOJI_IMAGES } from "../emojiList";

const DEFAULT_ICON = "/emoji/1f379_热带水果饮料.png";

interface Reminder {
  time: string;
  content: string;
  icon: string;
}

async function loadReminders(): Promise<Reminder[]> {
  try {
    const raw = await invoke<string>("load_water_reminders");
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

async function saveReminders(list: Reminder[]) {
  try {
    await invoke("save_water_reminders", { data: JSON.stringify(list) });
  } catch (e: any) { message.error("保存失败: " + e); }
}

function WaterPage() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [pickerValue, setPickerValue] = useState<dayjs.Dayjs | null>(null);

  useEffect(() => { loadReminders().then(setReminders); }, []);

  // edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editTime, setEditTime] = useState("");
  const [editContent, setEditContent] = useState("该喝水啦！");
  const [editIcon, setEditIcon] = useState(DEFAULT_ICON);

  const addTime = () => {
    if (!pickerValue) return;
    const t = pickerValue.format("HH:mm");
    if (reminders.some((r) => r.time === t)) { message.warning("该时间已存在"); return; }
    const updated = [...reminders, { time: t, content: "该喝水啦！", icon: DEFAULT_ICON }]
      .sort((a, b) => a.time.localeCompare(b.time));
    setReminders(updated);
    saveReminders(updated);
    setPickerValue(null);
  };

  const removeTime = (t: string) => {
    const updated = reminders.filter((r) => r.time !== t);
    setReminders(updated);
    saveReminders(updated);
  };

  const openEdit = (r: Reminder) => {
    setEditTime(r.time);
    setEditContent(r.content);
    setEditIcon(r.icon || DEFAULT_ICON);
    setEditOpen(true);
  };

  const handleEditSave = () => {
    const updated = reminders.map((r) =>
      r.time === editTime ? { ...r, content: editContent, icon: editIcon } : r
    );
    setReminders(updated);
    saveReminders(updated);
    setEditOpen(false);
  };

  // reminders 变化时全量同步到 localStorage
  useEffect(() => {
    localStorage.setItem("__reminder_data", JSON.stringify(reminders));
  }, [reminders]);

  return (
    <div className="panel">
      <h2>喝水助手</h2>

      <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <TimePicker
          value={pickerValue}
          onChange={setPickerValue}
          format="HH:mm"
          minuteStep={5}
          placeholder="选择提醒时间"
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={addTime}>添加</Button>
        <Button onClick={() => {
          const r = reminders.length >= 2 ? reminders[1] : reminders[0];
          if (!r) { message.warning("请先添加提醒时间"); return; }
          localStorage.setItem("__reminder_data", JSON.stringify({
            time: r.time, content: r.content, icon: r.icon,
          }));
          new WebviewWindow(`water-test-${Date.now()}`, {
            url: `/?reminder=${encodeURIComponent(r.time)}`,
            fullscreen: true,
            alwaysOnTop: true,
            title: "提醒测试",
          });
        }}>测试弹窗</Button>
      </div>

      <Table
        dataSource={reminders}
        rowKey="time"
        locale={{ emptyText: "暂无提醒时间" }}
        pagination={{ pageSize: 8, showSizeChanger: false }}
        columns={[
          {
            title: "图标", dataIndex: "icon", width: 60,
            render: (icon: string) => <img src={icon} alt="" style={{ width: 32, height: 32 }} />,
          },
          { title: "时间", dataIndex: "time", width: 100 },
          { title: "内容", dataIndex: "content" },
          {
            title: "操作", key: "actions", width: 100,
            render: (_: unknown, r: Reminder) => (
              <div style={{ display: "flex", gap: 4 }}>
                <Button type="text" icon={<EditOutlined />} size="small" onClick={() => openEdit(r)} />
                <Popconfirm title="确认删除？" onConfirm={() => removeTime(r.time)}>
                  <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                </Popconfirm>
              </div>
            ),
          },
        ]}
      />

      {/* edit modal */}
      <Modal
        title="编辑提醒"
        open={editOpen}
        onOk={handleEditSave}
        onCancel={() => setEditOpen(false)}
        okText="保存"
        cancelText="取消"
      >
        <div style={{ marginBottom: 16, color: "rgba(255,255,255,0.65)" }}>
          时间：{editTime}
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 4, color: "rgba(255,255,255,0.85)" }}>图标</label>
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
                  <img src={path} alt="" style={{ width: 28, height: 28 }} />
                  {path.split("/").pop()?.replace(".png", "").replace(/^[a-f0-9]+_/, "")}
                </span>
              ),
            }))}
          />
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <Input
              value={editIcon}
              onChange={(e) => setEditIcon(e.target.value)}
              placeholder="或输入自定义图片路径/URL"
            />
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              id="icon-file-input"
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
            <Button icon={<UploadOutlined />} onClick={() => document.getElementById("icon-file-input")?.click()}>
              选择文件
            </Button>
          </div>
          <div style={{ textAlign: "center" }}>
            <img src={editIcon} alt="" style={{ width: 64, height: 64, objectFit: "contain" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
        </div>
        <div>
          <label style={{ display: "block", marginBottom: 4, color: "rgba(255,255,255,0.85)" }}>提醒内容</label>
          <Input
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            placeholder="输入提醒内容"
          />
        </div>
      </Modal>
    </div>
  );
}

export default WaterPage;
