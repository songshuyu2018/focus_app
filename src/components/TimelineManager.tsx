import { useState, useEffect, useCallback } from "react";
import {
  Button, Input, Select, List, message, Space, Card,
  Statistic, Row, Col, TimePicker, Tag, Modal, Form,
} from "antd";
import {
  PlayCircleOutlined, StopOutlined, SettingOutlined,
} from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";
import dayjs from "dayjs";

// ---- types ----
interface TimelineEvent {
  id: string; date: string; mode: string;
  start_time: string; end_time: string | null;
  task_id: string | null; task_title: string | null;
  meeting_notes: string | null;
  meeting_task_id: string | null; created_at: string;
}
interface TimelineSettings {
  id: string; date: string;
  start_time: string; end_time: string;
}
interface TodayStats {
  task_minutes: number; meeting_minutes: number;
  rest_minutes: number; focused_task_count: number;
  current_mode: string | null;
}

const modeOptions = [
  { value: "task", label: "任务" },
  { value: "meeting", label: "会议" },
  { value: "rest", label: "休息" },
];
const modeColor: Record<string, string> = {
  task: "blue", meeting: "orange", rest: "green", complete: "purple",
};

interface TaskItem { id: string; title: string; }

function TimelineManager() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [stats, setStats] = useState<TodayStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [taskList, setTaskList] = useState<TaskItem[]>([]);

  // start mode
  const [startOpen, setStartOpen] = useState(false);
  const [startForm] = Form.useForm();
  const selectedMode = Form.useWatch("mode", startForm);

  // settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsForm] = Form.useForm();

  // report
  const [reportOpen, setReportOpen] = useState(false);
  const [reportContent, setReportContent] = useState("");

  const loadTasks = async () => {
    try {
      const result = await invoke<TaskItem[]>("list_tasks", {
        params: { sort_by: "created_at", sort_order: "desc" },
      });
      setTaskList(result);
    } catch (_) {}
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [e, s] = await Promise.all([
        invoke<TimelineEvent[]>("get_today_timeline"),
        invoke<TodayStats>("get_today_stats"),
      ]);
      setEvents(e);
      setStats(s);
    } catch (e: any) { message.error("加载失败: " + e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { loadTasks(); }, []);

  // 每 30 秒自动刷新统计和时间线
  useEffect(() => {
    const timer = setInterval(() => { loadAll(); }, 30_000);
    return () => clearInterval(timer);
  }, [loadAll]);

  // ---- start mode ----
  const openStart = async () => {
    startForm.resetFields();
    startForm.setFieldsValue({ mode: "task" });
    await loadTasks();
    setStartOpen(true);
  };

  const handleStart = async () => {
    const v = await startForm.validateFields();
    try {
      await invoke("start_timeline_event", {
        params: {
          mode: v.mode,
          task_id: v.task_id || null,
          meeting_notes: v.meeting_notes || null,
          meeting_task_id: v.meeting_task_id || null,
        },
      });
      message.success(`已进入 ${modeOptions.find((m) => m.value === v.mode)?.label} 模式`);
      setStartOpen(false);
      loadAll();
    } catch (e: any) { message.error("切换失败: " + e); }
  };


  // ---- end current ----
  const handleEnd = async () => {
    try {
      const result = await invoke<TimelineEvent | null>("end_current_event");
      if (result) {
        message.success("已结束当前事件");
      } else {
        message.warning("没有进行中的事件");
      }
      loadAll();
    } catch (e: any) { message.error("操作失败: " + e); }
  };

  // ---- settings ----
  const openSettings = async () => {
    const today = dayjs().format("YYYY-MM-DD");
    try {
      const s = await invoke<TimelineSettings | null>("get_timeline_settings", { date: today });
      settingsForm.setFieldsValue({
        start_time: s ? dayjs(s.start_time, "HH:mm") : dayjs("09:00", "HH:mm"),
        end_time: s ? dayjs(s.end_time, "HH:mm") : dayjs("18:00", "HH:mm"),
      });
    } catch (_) {
      settingsForm.setFieldsValue({
        start_time: dayjs("09:00", "HH:mm"),
        end_time: dayjs("18:00", "HH:mm"),
      });
    }
    setSettingsOpen(true);
  };

  const handleSaveSettings = async () => {
    const v = await settingsForm.validateFields();
    const today = dayjs().format("YYYY-MM-DD");
    try {
      await invoke("set_timeline_settings", {
        date: today,
        startTime: v.start_time.format("HH:mm"),
        endTime: v.end_time.format("HH:mm"),
      });
      message.success("时间线设置已保存");
      setSettingsOpen(false);
    } catch (e: any) { message.error("保存失败: " + e); }
  };

  // ---- report ----
  const handleGenerateReport = async () => {
    const today = dayjs().format("YYYY-MM-DD");
    try {
      const md = await invoke<string>("generate_report_by_date", {
        startDate: today,
        endDate: today,
      });
      setReportContent(md);
      setReportOpen(true);
    } catch (e: any) { message.error("生成报告失败: " + e); }
  };

  const modeLabel = (m: string) => {
    if (m === "complete") return "完成";
    return modeOptions.find((o) => o.value === m)?.label || m;
  };

  const fmtTime = (iso: string) => iso.slice(11, 16);

  return (
    <div className="panel">
      <h2>时间线管理</h2>

      {/* stats */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card size="small">
              <Statistic title="专注任务" value={stats.task_minutes} suffix="分钟" />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="会议" value={stats.meeting_minutes} suffix="分钟" />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="休息" value={stats.rest_minutes} suffix="分钟" />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="投入任务数" value={stats.focused_task_count} suffix="个" />
            </Card>
          </Col>
        </Row>
      )}

      {/* current mode indicator */}
      <Tag color={modeColor[stats?.current_mode || "rest"]} style={{ marginBottom: 12, padding: "4px 12px", fontSize: 14 }}>
        当前: {modeLabel(stats?.current_mode || "rest")}
      </Tag>

      {/* actions */}
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlayCircleOutlined />} onClick={openStart}>
          开始新事件
        </Button>
        <Button icon={<StopOutlined />} onClick={handleEnd}>
          结束当前事件
        </Button>
        <Button icon={<SettingOutlined />} onClick={openSettings}>
          时间线设置
        </Button>
        <Button type="primary" onClick={handleGenerateReport}>
          导出每日报告
        </Button>
      </Space>

      {/* timeline */}
      <List
        loading={loading}
        dataSource={events}
        locale={{ emptyText: "当日无事件记录" }}
        renderItem={(event) => (
          <List.Item>
            <List.Item.Meta
              avatar={
                <Tag color={modeColor[event.mode]}>{modeLabel(event.mode)}</Tag>
              }
              title={
                event.mode === "complete" ? (
                  <span style={{ color: "#a07dff" }}>任务完成</span>
                ) : (
                  <Space>
                    <span>{fmtTime(event.start_time)}</span>
                    <span>→</span>
                    <span>{event.end_time ? fmtTime(event.end_time) : "进行中"}</span>
                  </Space>
                )
              }
              description={
                <Space>
                  {event.task_title && <span>任务: {event.task_title}</span>}
                  {event.meeting_notes && <span>备注: {event.meeting_notes}</span>}
                </Space>
              }
            />
          </List.Item>
        )}
      />

      {/* start event modal */}
      <Modal
        title="开始新事件"
        open={startOpen}
        onOk={handleStart}
        onCancel={() => setStartOpen(false)}
        okText="开始"
        cancelText="取消"
      >
        <Form form={startForm} layout="vertical">
          <Form.Item name="mode" label="模式" rules={[{ required: true }]}>
            <Select options={modeOptions} />
          </Form.Item>
          {selectedMode === "task" && (
            <Form.Item name="task_id" label="选择任务" rules={[{ required: true, message: "请选择任务" }]}>
              <Select
                showSearch
                placeholder="搜索并选择任务"
                filterOption={(input, option) =>
                  (option?.label as string ?? "").toLowerCase().includes(input.toLowerCase())
                }
                options={taskList.map((t) => ({ value: t.id, label: t.title }))}
              />
            </Form.Item>
          )}
          {selectedMode === "meeting" && (
            <>
              <Form.Item name="meeting_notes" label="会议内容">
                <Input.TextArea rows={2} />
              </Form.Item>
              <Form.Item name="meeting_task_id" label="关联任务">
                <Select
                  allowClear
                  showSearch
                  placeholder="选择关联任务（可选）"
                  filterOption={(input, option) =>
                    (option?.label as string ?? "").toLowerCase().includes(input.toLowerCase())
                  }
                  options={taskList.map((t) => ({ value: t.id, label: t.title }))}
                />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>

      {/* settings modal */}
      <Modal
        title="时间线设置"
        open={settingsOpen}
        onOk={handleSaveSettings}
        onCancel={() => setSettingsOpen(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={settingsForm} layout="vertical">
          <Form.Item name="start_time" label="开始时间" rules={[{ required: true }]}>
            <TimePicker format="HH:mm" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="end_time" label="结束时间" rules={[{ required: true }]}>
            <TimePicker format="HH:mm" style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* report modal */}
      <Modal
        title="每日报告"
        open={reportOpen}
        onCancel={() => setReportOpen(false)}
        footer={[
          <Button key="copy" onClick={() => {
            navigator.clipboard.writeText(reportContent);
            message.success("已复制到剪贴板");
          }}>复制</Button>,
          <Button key="close" type="primary" onClick={() => setReportOpen(false)}>关闭</Button>,
        ]}
        width={700}
      >
        <div style={{
          background: "#1f1f1f", border: "1px solid #434343", borderRadius: 6,
          padding: 16, maxHeight: 500, overflow: "auto", whiteSpace: "pre-wrap",
          fontFamily: "monospace", fontSize: 13, lineHeight: "1.6",
          color: "rgba(255,255,255,0.85)",
        }}>
          {reportContent}
        </div>
      </Modal>
    </div>
  );
}

export default TimelineManager;
