import { useEffect, useState, useMemo } from "react";
import { Card, Row, Col, Statistic, Timeline, Modal, Input, Select, Form, message, Button, TimePicker, DatePicker, Space, Popconfirm, InputNumber, Radio, BorderBeam} from "antd";
import {
  RocketOutlined, LikeOutlined, CoffeeOutlined,
  MessageOutlined, EditOutlined,
  PlayCircleOutlined, StopOutlined, SettingOutlined, ExportOutlined,
  BlockOutlined, PlusCircleOutlined, CheckCircleOutlined,
} from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";
import dayjs from "dayjs";

interface TodayStats {
  task_minutes: number; meeting_minutes: number;
  rest_minutes: number; focused_task_count: number;
  current_mode: string | null;
}
interface TimelineEvent {
  id: string; mode: string; start_time: string; end_time: string | null;
  task_id: string | null; task_title: string | null;
  meeting_notes: string | null; meeting_minutes: string | null; meeting_task_id: string | null;
  created_at: string;
}
interface TimelineSettings {
  id: string; date: string; start_time: string; end_time: string;
}

const barColorMap: Record<string, string> = {
  task: "#52c41a",
  meeting: "#fa8c16",
  rest: "#1677ff",
  complete: "#722ed1",
};

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

interface Segment {
  start: number; // minutes from midnight
  end: number;
  color: string;
  label: string;
}

function computeSegments(
  events: TimelineEvent[],
  settings: TimelineSettings | null,
  now: dayjs.Dayjs,
): { segments: Segment[]; effectiveEnd: string; isActive: boolean } {
  const startMin = settings ? timeToMinutes(settings.start_time) : 540; // 09:00
  const setEndMin = settings ? timeToMinutes(settings.end_time) : 1080; // 18:00
  const nowMin = now.hour() * 60 + now.minute();
  const midnightMin = 24 * 60;

  // 当前时间超出设置结束时间时，动态延伸至当前时间（不超过午夜）
  const effectiveEndMin = Math.min(Math.max(setEndMin, nowMin), midnightMin);
  const effectiveEnd = `${String(Math.floor(effectiveEndMin / 60)).padStart(2, "0")}:${String(effectiveEndMin % 60).padStart(2, "0")}`;

  // 如果还没到开始时间或已过午夜（第二天但未到开始时间），返回空
  if (nowMin >= midnightMin || nowMin < startMin) {
    // 已过午夜，展示从开始到结束的空条
    const totalMin = setEndMin - startMin;
    if (totalMin <= 0) return { segments: [], effectiveEnd: settings?.end_time || "18:00", isActive: false };
    return {
      segments: [{ start: startMin, end: setEndMin, color: "#434343", label: "" }],
      effectiveEnd: settings?.end_time || "18:00",
      isActive: false,
    };
  }

  const totalMin = effectiveEndMin - startMin;
  if (totalMin <= 0) return { segments: [], effectiveEnd, isActive: true };

  // 收集所有已定义的区间
  interface Interval {
    start: number;
    end: number;
    color: string;
  }
  const intervals: Interval[] = [];

  for (const e of events) {
    const es = timeToMinutes(e.start_time.slice(11, 16));
    const ee = e.end_time
      ? timeToMinutes(e.end_time.slice(11, 16))
      : Math.min(nowMin, effectiveEndMin);
    const color = barColorMap[e.mode] || "#434343";
    intervals.push({ start: Math.max(es, startMin), end: Math.min(ee, effectiveEndMin), color });
  }

  intervals.sort((a, b) => a.start - b.start);

  // 填充未定义的间隙，生成最终 segments
  const segments: Segment[] = [];
  let cursor = startMin;

  for (const iv of intervals) {
    if (iv.start > cursor) {
      // 间隙：过去部分蓝色，未来部分灰色
      if (cursor < nowMin) {
        segments.push({
          start: cursor,
          end: Math.min(nowMin, iv.start),
          color: "#1677ff",
          label: "",
        });
      }
      if (nowMin < iv.start) {
        const grayS = Math.max(cursor, nowMin);
        if (grayS < iv.start) {
          segments.push({ start: grayS, end: iv.start, color: "#434343", label: "" });
        }
      }
    }
    if (iv.end > cursor) {
      segments.push({
        start: Math.max(cursor, iv.start),
        end: iv.end,
        color: iv.color,
        label: "",
      });
      cursor = iv.end;
    }
  }

  // remaining after last interval: 过去部分蓝色，未来部分灰色
  if (cursor < effectiveEndMin) {
    if (cursor < nowMin) {
      segments.push({
        start: cursor,
        end: Math.min(nowMin, effectiveEndMin),
        color: "#1677ff",
        label: "",
      });
    }
    if (nowMin < effectiveEndMin && cursor < effectiveEndMin) {
      const grayStart = Math.max(cursor, nowMin);
      if (grayStart < effectiveEndMin) {
        segments.push({
          start: grayStart,
          end: effectiveEndMin,
          color: "#434343",
          label: "",
        });
      }
    }
  }

  return { segments, effectiveEnd, isActive: nowMin < midnightMin };
}

interface TaskItem { id: string; title: string; progress: number; }

function HomePage() {
  const [stats, setStats] = useState<TodayStats | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [settings, setSettings] = useState<TimelineSettings | null>(null);
  const [now, setNow] = useState(dayjs());
  const [taskList, setTaskList] = useState<TaskItem[]>([]);

  // meeting edit
  const [editOpen, setEditOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<TimelineEvent | null>(null);
  const [editForm] = Form.useForm();

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
  const [reportDate, setReportDate] = useState(dayjs());

  // 默认任务
  const [defaultTaskId, setDefaultTaskId] = useState<string | null>(
    () => localStorage.getItem("__default_task") || null
  );
  const updateDefaultTask = (id: string | null) => {
    setDefaultTaskId(id);
    if (id) localStorage.setItem("__default_task", id);
    else localStorage.removeItem("__default_task");
  };

  // quick progress modal (from timeline)
  const [quickProgressOpen, setQuickProgressOpen] = useState(false);
  const [quickProgressTaskId, setQuickProgressTaskId] = useState("");
  const [quickProgressForm] = Form.useForm();

  // celebration animation
  const [celebration, setCelebration] = useState<string | null>(null);
  const showCelebration = (img: string) => {
    setCelebration(img);
    setTimeout(() => setCelebration(null), 2500);
  };

  const loadAll = () => {
    invoke<TodayStats>("get_today_stats").then(setStats).catch(() => {});
    invoke<TimelineEvent[]>("get_today_timeline").then(setEvents).catch(() => {});
    const today = dayjs().format("YYYY-MM-DD");
    invoke<TimelineSettings | null>("get_timeline_settings", { date: today })
      .then((s) => setSettings(s))
      .catch(() => {});
    invoke<TaskItem[]>("list_tasks", { params: { sort_by: "created_at", sort_order: "desc" } })
      .then(setTaskList)
      .catch(() => {});
  };

  useEffect(() => { loadAll(); }, []);

  // 同步当前任务到悬浮窗
  useEffect(() => {
    if (events.length > 0) {
      const lastTaskEvent = [...events].reverse().find((e) => e.mode === "task");
      if (lastTaskEvent) {
        localStorage.setItem("__floating_task", JSON.stringify({
          id: lastTaskEvent.task_id || "",
          title: lastTaskEvent.task_title || "未知任务",
          time: lastTaskEvent.start_time.slice(11, 16),
        }));
      }
    }
  }, [events]);

  // 同步当前模式到悬浮窗
  useEffect(() => {
    const mode = stats?.current_mode || "";
    localStorage.setItem("__floating_mode", mode);
  }, [stats]);

  // 监听悬浮窗刷新事件
  useEffect(() => {
    const onStorage = () => {
      if (localStorage.getItem("__floating_refresh")) {
        const celeb = localStorage.getItem("__floating_celebration");
        if (celeb) { showCelebration(celeb); localStorage.removeItem("__floating_celebration"); }
        localStorage.removeItem("__floating_refresh");
        loadAll();
      }
      // 快速切换到某个任务
      const switchTaskId = localStorage.getItem("__floating_switch_task");
      if (switchTaskId) {
        localStorage.removeItem("__floating_switch_task");
        // 切换到任务管理页面
        const el = document.querySelector('[data-menu-id="tasks"]');
        if (el) (el as HTMLElement).click();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [loadAll]);

  // 悬浮窗开关
  const [floatingOpen, setFloatingOpen] = useState(false);
  const toggleFloating = async () => {
    try {
      const isOpen = await invoke<boolean>("toggle_floating_window");
      setFloatingOpen(isOpen);
    } catch (e: any) { message.error("操作失败: " + e); }
  };

  // 实时时钟
  useEffect(() => {
    const timer = setInterval(() => setNow(dayjs()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 每分钟刷新数据
  useEffect(() => {
    const timer = setInterval(() => {
      invoke<TodayStats>("get_today_stats").then(setStats).catch(() => {});
      invoke<TimelineEvent[]>("get_today_timeline").then(setEvents).catch(() => {});
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  // ---- quick progress ----
  const openQuickProgress = (taskId: string) => {
    setQuickProgressTaskId(taskId);
    const current = taskList.find((t) => t.id === taskId)?.progress || 0;
    quickProgressForm.setFieldsValue({ description: "", progress: current });
    setQuickProgressOpen(true);
  };

  const handleQuickProgress = async () => {
    const v = await quickProgressForm.validateFields();
    try {
      await invoke("add_progress", {
        params: { task_id: quickProgressTaskId, description: v.description, progress: v.progress },
      });
      message.success("进展已追加");
      showCelebration("/emoji/1f973_聚会笑脸.png");
      setQuickProgressOpen(false);
      loadAll();
    } catch (e: any) { message.error("追加失败: " + e); }
  };

  const handleQuickComplete = async (taskId: string) => {
    try {
      await invoke("complete_task", { id: taskId });
      if (taskId === defaultTaskId) updateDefaultTask(null);
      message.success("任务已标记完成");
      showCelebration("/emoji/1f4af_一百分.png");
      loadAll();
    } catch (e: any) { message.error("操作失败: " + e); }
  };

  // ---- meeting edit ----
  const openEditMeeting = (e: TimelineEvent) => {
    setEditEvent(e);
    editForm.setFieldsValue({
      meeting_notes: e.meeting_notes || "",
      meeting_minutes: e.meeting_minutes || "",
      meeting_task_id: e.meeting_task_id || undefined,
    });
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editEvent) return;
    const v = await editForm.validateFields();
    try {
      await invoke("update_timeline_event", {
        id: editEvent.id,
        meetingNotes: v.meeting_notes || null,
        meetingMinutes: v.meeting_minutes || null,
        meetingTaskId: v.meeting_task_id || null,
      });
      message.success("会议信息已更新");
      setEditOpen(false);
      loadAll();
    } catch (e: any) { message.error("更新失败: " + e); }
  };

  // ---- start mode ----
  const openStart = async () => {
    startForm.resetFields();
    startForm.setFieldsValue({ mode: "task" });
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
      if (v.mode === "rest") showCelebration("/emoji/1f929_好崇拜哦.png");
      if (v.mode === "task" && v.task_id) updateDefaultTask(v.task_id);
      message.success(`已进入${v.mode === "task" ? "任务" : v.mode === "meeting" ? "会议" : "休息"}模式`);
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
        localStorage.setItem("__floating_mode", "");
        localStorage.setItem("__floating_refresh", Date.now().toString());
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
      loadAll();
    } catch (e: any) { message.error("保存失败: " + e); }
  };

  // ---- report ----
  const handleGenerateReport = async () => {
    const d = reportDate.format("YYYY-MM-DD");
    try {
      const md = await invoke<string>("generate_report_by_date", {
        startDate: d,
        endDate: d,
      });
      setReportContent(md);
      setReportOpen(true);
    } catch (e: any) { message.error("生成报告失败: " + e); }
  };

  const getTimelineIcon = (mode: string) => {
    switch (mode) {
      case "task": return <RocketOutlined style={{ color: "#52c41a" }} />;
      case "complete": return <LikeOutlined style={{ color: "#722ed1" }} />;
      case "rest": return <CoffeeOutlined style={{ color: "#1677ff" }} />;
      case "meeting": return <MessageOutlined style={{ color: "#fa8c16" }} />;
      default: return null;
    }
  };

  const getTimelineContent = (e: TimelineEvent) => {
    const time = e.start_time.slice(11, 16);
    switch (e.mode) {
      case "task": {
        const isCompleted = taskList.find((t) => t.id === e.task_id)?.progress === 100;
        return (
          <span>
            {time} 开始投入：{e.task_title || "未知任务"}
            {e.task_id && (
              <>
                <Button type="text" size="small" icon={<PlusCircleOutlined />}
                  onClick={() => openQuickProgress(e.task_id!)} style={{ marginLeft: 6 }} />
                {!isCompleted && (
                  <Popconfirm title="确认完成？" onConfirm={() => handleQuickComplete(e.task_id!)}>
                    <Button type="text" size="small" icon={<CheckCircleOutlined />}
                      style={{ color: "#52c41a" }} />
                  </Popconfirm>
                )}
              </>
            )}
          </span>
        );
      }
      case "complete":
        return <span>{time} 已完成：{e.task_title || "未知任务"}</span>;
      case "rest":
        return <span>{time} 休息啦</span>;
      case "meeting":
        return (
          <span>
            {time} 开始会议{e.meeting_notes ? `：${e.meeting_notes}` : ""}
            {e.meeting_task_id ? ` - [${taskList.find((t) => t.id === e.meeting_task_id)?.title || "未知"}]` : ""}
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditMeeting(e)}
              style={{ marginLeft: 8 }}
            />
          </span>
        );
      default:
        return <span>{time}</span>;
    }
  };

  const { segments, effectiveEnd, isActive } = useMemo(
    () => computeSegments(events, settings, now),
    [events, settings, now],
  );

  const dayStart = settings?.start_time || "09:00";
  const dayEnd = effectiveEnd;
  const totalMin = timeToMinutes(dayEnd) - timeToMinutes(dayStart);

  const nowMin = now.hour() * 60 + now.minute();
  const pastPct = totalMin > 0
    ? Math.min(100, Math.max(0, ((nowMin - timeToMinutes(dayStart)) / totalMin) * 100))
    : 0;

  return (
    <div className="panel">
      {/* 庆祝动画 */}
      {celebration && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 9999, pointerEvents: "none",
        }}>
          <img src={celebration} alt=""
            style={{
              width: 200, height: 200, objectFit: "contain",
              animation: "celebration-bounce 0.5s ease-out, celebration-fade 0.5s ease-in-out 2s forwards",
            }}
          />
        </div>
      )}
      <h2>今日看板</h2>

      {stats && (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
          <BorderBeam color='#ffffff54'>
            <Card size="small" style={{ textAlign: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: 62 }}>
              <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, textAlign: "left" }}>当前状态</div>
              <Radio.Group
                value={stats?.current_mode || undefined}
                optionType="button"
                buttonStyle="solid"
                size="small"
                onChange={async (e) => {
                  const m = e.target.value;
                  if (m === stats?.current_mode) return;
                  if (m === "task" && !defaultTaskId) { openStart(); return; }
                  try {
                    if (stats?.current_mode) await invoke("end_current_event");
                    await invoke("start_timeline_event", {
                      params: { mode: m, task_id: m === "task" ? defaultTaskId : null, meeting_notes: null, meeting_task_id: null },
                    });
                    if (m === "rest") showCelebration("/emoji/1f929_好崇拜哦.png");
                    message.success(`已切换到${m === "task" ? "专注" : m === "meeting" ? "会议" : "休息"}模式`);
                    localStorage.setItem("__floating_mode", m);
                    localStorage.setItem("__floating_refresh", Date.now().toString());
                    loadAll();
                  } catch (e: any) { message.error(e); }
                }}
              >
                <Radio.Button
                  value="task"
                  style={stats?.current_mode === "task" ? {
                    background: "linear-gradient(135deg, #52c41a, #1677ff)",
                    borderColor: "transparent", color: "#fff", fontWeight: 600,
                  } : undefined}
                >专注</Radio.Button>
                <Radio.Button
                  value="meeting"
                  style={stats?.current_mode === "meeting" ? {
                    background: "linear-gradient(135deg, #fa8c16, #f5222d)",
                    borderColor: "transparent", color: "#fff", fontWeight: 600,
                  } : undefined}
                >会议</Radio.Button>
                <Radio.Button
                  value="rest"
                  style={stats?.current_mode === "rest" ? {
                    background: "linear-gradient(135deg, #1677ff, #722ed1)",
                    borderColor: "transparent", color: "#fff", fontWeight: 600,
                  } : undefined}
                >休息</Radio.Button>
              </Radio.Group>
              </div>
            </Card>
          </BorderBeam>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="今日专注" value={stats.task_minutes} suffix="分钟" />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="今日会议" value={stats.meeting_minutes} suffix="分钟" />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="投入任务" value={stats.focused_task_count} suffix="个" />
            </Card>
          </Col>
        </Row>
      )}

      {/* 当前时间 + 进度条 */}
      <Card size="small" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 28, fontWeight: 600, color: "rgba(255,255,255,0.85)", fontVariantNumeric: "tabular-nums" }}>
            {now.format("HH:mm:ss")}
          </span>
          <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>
            {dayStart} — {dayEnd}
          </span>
        </div>
        <div style={{ position: "relative", height: 20, borderRadius: 10, overflow: "hidden" }}>
          <div style={{
            display: "flex", height: 20, borderRadius: 10, overflow: "hidden",
            opacity: isActive ? 1 : 0.35,
            transition: "opacity 0.5s",
          }}>
            {segments.map((seg, i) => {
              const pct = ((seg.end - seg.start) / totalMin) * 100;
              const isLast = i === segments.length - 1;
              return (
                <div
                  key={i}
                  style={{
                    width: isLast ? `${pct}%` : `calc(${pct}% - 2px)`,
                    height: "100%",
                    background: seg.color,
                    marginRight: isLast ? 0 : 2,
                    transition: "width 0.5s",
                  }}
                />
              );
            })}
          </div>
          {isActive && (
            <div style={{
              position: "absolute",
              top: 0, left: 0,
              width: `${pastPct}%`,
              height: "100%",
              overflow: "hidden",
              pointerEvents: "none",
            }}>
              <div style={{
                width: "200%",
                height: "100%",
                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.50) 50%, transparent 100%)",
                animation: "shimmer 3s ease-in-out infinite",
              }} />
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12 }}>
          <span><span style={{ color: "#52c41a" }}>●</span> 专注</span>
          <span><span style={{ color: "#fa8c16" }}>●</span> 会议</span>
          <span><span style={{ color: "#1677ff" }}>●</span> 休息</span>
          <span><span style={{ color: "#434343" }}>●</span> 剩余</span>
        </div>
      </Card>
      <Card size="small" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        {/* 左侧按钮列 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, width: 140 }}>
          <h2>时间线</h2>
          <Button type="primary" icon={<PlayCircleOutlined />} onClick={openStart} block className="btn-left">
            开始新事件
          </Button>
          <Button icon={<StopOutlined />} onClick={handleEnd} block className="btn-left">
            结束当前事件
          </Button>
          <Button icon={<SettingOutlined />} onClick={openSettings} block className="btn-left">
            时间线设置
          </Button>
          <Button icon={<ExportOutlined />} onClick={() => setReportOpen(true)} block className="btn-left">
            导出每日报告
          </Button>
          <Button icon={<BlockOutlined />} onClick={toggleFloating} block className="btn-left">
            {floatingOpen ? "关闭悬浮窗" : "打开悬浮窗"}
          </Button>
        </div>

        {/* 右侧可滚动时间轴 */}
        <div style={{ flex: 1, maxHeight: 350, overflow: "auto", minWidth: 0 }}>
          {events.length === 0 ? (
            <p style={{ color: "rgba(255,255,255,0.45)" }}>暂无记录</p>
          ) : (
            <Timeline
              items={[...events].reverse().map((e) => ({
                dot: getTimelineIcon(e.mode),
                children: getTimelineContent(e),
              }))}
            />
          )}
        </div>
      </div>
      </Card>


      {/* meeting edit modal */}
      <Modal
        title="编辑会议"
        open={editOpen}
        onOk={handleEditSave}
        onCancel={() => setEditOpen(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="meeting_notes" label="会议内容">
            <Input.TextArea rows={2} placeholder="输入会议内容" />
          </Form.Item>
          <Form.Item name="meeting_minutes" label="会议纪要">
            <Input.TextArea rows={4} placeholder="输入会议纪要" />
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
        </Form>
      </Modal>

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
            <Select
              options={[
                { value: "task", label: "任务" },
                { value: "meeting", label: "会议" },
                { value: "rest", label: "休息" },
              ]}
            />
          </Form.Item>
          {selectedMode === "task" && (
            <Form.Item name="task_id" label="选择任务" rules={[{ required: true, message: "请选择任务" }]}>
              <Select
                showSearch
                placeholder="搜索并选择任务"
                filterOption={(input, option) =>
                  (option?.label as string ?? "").toLowerCase().includes(input.toLowerCase())
                }
                options={taskList
                  .filter((t) => t.progress < 100)
                  .map((t) => ({ value: t.id, label: t.title }))}
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

      {/* quick progress modal */}
      <Modal
        title="追加进展"
        open={quickProgressOpen}
        onOk={handleQuickProgress}
        onCancel={() => setQuickProgressOpen(false)}
        okText="提交"
        cancelText="取消"
      >
        <Form form={quickProgressForm} layout="vertical">
          <Form.Item name="description" label="进展描述" rules={[{ required: true }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="progress" label="当前进度 (%)" rules={[{ required: true }]}>
            <InputNumber min={0} max={100} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* report modal */}
      <Modal
        title="每日报告"
        open={reportOpen}
        onCancel={() => setReportOpen(false)}
        footer={[
          <Button key="copy" disabled={!reportContent} onClick={() => {
            navigator.clipboard.writeText(reportContent);
            message.success("已复制到剪贴板");
          }}>复制</Button>,
          <Button key="close" type="primary" onClick={() => setReportOpen(false)}>关闭</Button>,
        ]}
        width={700}
      >
        <Space style={{ marginBottom: 16 }}>
          <DatePicker value={reportDate} onChange={(d) => setReportDate(d || dayjs())} />
          <Button type="primary" onClick={handleGenerateReport}>生成报告</Button>
        </Space>
        <div style={{
          background: "#1f1f1f", border: "1px solid #434343", borderRadius: 6,
          padding: 16, maxHeight: "calc(100vh - 350px)", overflow: "auto", whiteSpace: "pre-wrap",
          fontFamily: "monospace", fontSize: 13, lineHeight: "1.6",
          color: "rgba(255,255,255,0.85)",
        }}>
          {reportContent}
        </div>
      </Modal>
    </div>
  );
}

export default HomePage;
