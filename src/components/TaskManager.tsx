import { useState, useEffect } from "react";
import {
  Button, Input, Select, List, message, Space, Modal, Form,
  Tag, Progress, Popconfirm, DatePicker, InputNumber, Table,
} from "antd";
import {
  PlusOutlined, DeleteOutlined, EditOutlined,
  CheckCircleOutlined, PlusCircleOutlined,
  SortAscendingOutlined, SortDescendingOutlined,
  TagsOutlined, SearchOutlined,
} from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";
import dayjs from "dayjs";

// ---- types ----
interface TagItem { id: string; name: string; created_at: string; }
interface ProgressLog {
  id: string; task_id: string; timestamp: string;
  description: string; progress: number;
}
interface Task {
  id: string; title: string; description: string;
  priority: string; progress: number;
  planned_date: string | null; start_time: string;
  actual_completion_time: string | null;
  created_at: string; updated_at: string;
  tags: TagItem[];
  progress_logs: ProgressLog[];
}

const priorityOptions = [
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "low", label: "低" },
];

const priorityColor: Record<string, string> = {
  high: "red", medium: "orange", low: "green",
};

const sortOptions = [
  { value: "priority", label: "优先级" },
  { value: "planned_date", label: "计划时间" },
  { value: "progress", label: "进度" },
  { value: "created_at", label: "创建时间" },
];

function TaskManager() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allTags, setAllTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(false);
  // filters
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState<string | undefined>();
  const [filterTagId, setFilterTagId] = useState<string | undefined>();
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");
  // create / edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();
  // progress modal
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressTaskId, setProgressTaskId] = useState("");
  const [progressForm] = Form.useForm();
  // tag management modal
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [tagNewName, setTagNewName] = useState("");
  const [tagSearch, setTagSearch] = useState("");
  const [tagLoading, setTagLoading] = useState(false);

  // ---- load ----
  const doLoad = async (overrides?: Partial<{
    search: string; priority: string | undefined;
    tagId: string | undefined;
    sortBy: string; sortOrder: string;
  }>) => {
    const s = overrides?.search ?? search;
    const p = overrides?.priority !== undefined ? overrides.priority : filterPriority;
    const tid = overrides?.tagId !== undefined ? overrides.tagId : filterTagId;
    const sb = overrides?.sortBy ?? sortBy;
    const so = overrides?.sortOrder ?? sortOrder;
    setLoading(true);
    try {
      const result = await invoke<Task[]>("list_tasks", {
        params: {
          search: s || null,
          priority: p || null,
          tag_ids: tid ? [tid] : null,
          sort_by: sb,
          sort_order: so,
        },
      });
      setTasks(result);
    } catch (e: any) { message.error("加载失败: " + e); }
    setLoading(false);
  };

  const loadTags = async () => {
    try {
      setAllTags(await invoke<TagItem[]>("list_tags", { search: null }));
    } catch (_) {}
  };

  const loadTagsInModal = async () => {
    setTagLoading(true);
    try {
      setAllTags(await invoke<TagItem[]>("list_tags", { search: tagSearch || null }));
    } catch (_) {}
    setTagLoading(false);
  };

  const handleCreateTag = async () => {
    const name = tagNewName.trim();
    if (!name) { message.warning("请输入标签名"); return; }
    try {
      await invoke("create_tag", { name });
      message.success(`标签"${name}"已创建`);
      setTagNewName("");
      loadTagsInModal();
      loadTags();
    } catch (e: any) { message.error("创建失败: " + e); }
  };

  const handleDeleteTag = async (id: string) => {
    try {
      await invoke("delete_tag", { id });
      message.success("标签已删除");
      loadTagsInModal();
      loadTags();
    } catch (e: any) { message.error("删除失败: " + e); }
  };

  useEffect(() => { doLoad(); }, [search, filterPriority, filterTagId]);
  useEffect(() => { loadTags(); }, []);
  useEffect(() => { if (tagModalOpen) loadTagsInModal(); }, [tagModalOpen, tagSearch]);

  // ---- create / update ----
  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ priority: "medium" });
    setModalOpen(true);
  };

  const openEdit = async (id: string) => {
    setEditingId(id);
    try {
      const t = await invoke<Task>("get_task", { id });
      form.setFieldsValue({
        title: t.title,
        description: t.description,
        priority: t.priority,
        planned_date: t.planned_date ? dayjs(t.planned_date) : null,
        tag_ids: t.tags.map((tg) => tg.id),
      });
    } catch (e: any) { message.error("获取任务失败: " + e); return; }
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const params: Record<string, any> = {
      title: values.title,
      description: values.description || "",
      priority: values.priority,
      planned_date: values.planned_date
        ? values.planned_date.format("YYYY-MM-DD") : null,
      tag_ids: values.tag_ids || [],
    };
    try {
      if (editingId) {
        await invoke("update_task", { params: { ...params, id: editingId } });
        message.success("任务已更新");
      } else {
        await invoke("create_task", { params });
        message.success("任务已创建");
      }
      setModalOpen(false);
      doLoad();
    } catch (e: any) { message.error("保存失败: " + e); }
  };

  const handleDelete = async (id: string) => {
    try { await invoke("delete_task", { id }); message.success("已删除"); doLoad(); }
    catch (e: any) { message.error("删除失败: " + e); }
  };

  const handleComplete = async (id: string) => {
    try {
      await invoke("complete_task", { id });
      if (id === localStorage.getItem("__default_task")) localStorage.removeItem("__default_task");
      message.success("已标记完成");
      doLoad();
    } catch (e: any) { message.error("操作失败: " + e); }
  };

  // ---- progress ----
  const openProgress = (taskId: string) => {
    setProgressTaskId(taskId);
    progressForm.resetFields();
    setProgressOpen(true);
  };

  const handleAddProgress = async () => {
    const v = await progressForm.validateFields();
    try {
      await invoke("add_progress", {
        params: {
          task_id: progressTaskId,
          description: v.description,
          progress: v.progress,
        },
      });
      message.success("进展已追加");
      setProgressOpen(false);
      doLoad();
    } catch (e: any) { message.error("追加失败: " + e); }
  };

  return (
    <div className="panel">
      <h2>任务管理</h2>

      {/* toolbar */}
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search
          placeholder="搜索任务..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ width: 200 }}
        />
        <Select
          placeholder="优先级筛选"
          value={filterPriority}
          onChange={setFilterPriority}
          allowClear
          options={priorityOptions}
          style={{ width: 120 }}
        />
        <Select
          placeholder="标签筛选"
          value={filterTagId}
          onChange={setFilterTagId}
          allowClear
          options={allTags.map((t) => ({ value: t.id, label: t.name }))}
          style={{ width: 130 }}
        />
        <Select
          value={sortBy}
          onChange={(v) => { setSortBy(v); doLoad({ sortBy: v }); }}
          options={sortOptions}
          style={{ width: 110 }}
        />
        <Button
          icon={sortOrder === "asc" ? <SortAscendingOutlined /> : <SortDescendingOutlined />}
          onClick={() => {
            const next = sortOrder === "asc" ? "desc" : "asc";
            setSortOrder(next);
            doLoad({ sortOrder: next });
          }}
        >
          {sortOrder === "asc" ? "升序" : "降序"}
        </Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建任务</Button>
        <Button icon={<TagsOutlined />} onClick={() => setTagModalOpen(true)}>标签管理</Button>
      </Space>

      {/* table */}
      <Table
        loading={loading}
        dataSource={tasks}
        rowKey="id"
        locale={{ emptyText: "暂无任务" }}
        pagination={{ pageSize: 8, showSizeChanger: false }}
        columns={[
          {
            title: "任务名称", dataIndex: "title",
            render: (_: string, task: Task) => (
              <Space wrap>
                <span>{task.title}</span>
                <Tag color={priorityColor[task.priority]}>
                  {priorityOptions.find((p) => p.value === task.priority)?.label}
                </Tag>
                {task.tags.map((t) => <Tag key={t.id}>{t.name}</Tag>)}
              </Space>
            ),
          },
          {
            title: "进度", dataIndex: "progress", width: 240,
            render: (p: number) => (
              <div>
                <Progress percent={p} size="small"
                  style={{ width: 160, marginRight: 8 }}
                  strokeColor={p === 100 ? "#52c41a" : undefined} />
              </div>
            ),
          },
          {
            title: "计划时间", dataIndex: "planned_date", width: 110,
            render: (d: string | null) => d || "-",
          },
          {
            title: "状态", dataIndex: "actual_completion_time", width: 80,
            render: (d: string | null) =>
              d ? <span style={{ color: "#52c41a" }}>已完成</span> : <span style={{ color: "rgba(255,255,255,0.45)" }}>进行中</span>,
          },
          {
            title: "操作", key: "actions", width: 220,
            render: (_: unknown, task: Task) => (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Space size={0}>
                  <Button size="small" icon={<PlusCircleOutlined />} onClick={() => openProgress(task.id)}>进展</Button>
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(task.id)} />
                  {task.progress < 100 && (
                    <Popconfirm title="确认完成？" onConfirm={() => handleComplete(task.id)}>
                      <Button size="small" icon={<CheckCircleOutlined />} />
                    </Popconfirm>
                  )}
                </Space>
                <Popconfirm title="确认删除？" onConfirm={() => handleDelete(task.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </div>
            ),
          },
        ]}
      />

      {/* create / edit modal */}
      <Modal
        title={editingId ? "编辑任务" : "新建任务"}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="详情">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="priority" label="优先级" initialValue="medium">
            <Select options={priorityOptions} />
          </Form.Item>
          <Form.Item name="planned_date" label="计划完成时间">
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="tag_ids" label="标签">
            <Select mode="multiple" placeholder="选择标签" options={allTags.map((t) => ({ value: t.id, label: t.name }))} />
          </Form.Item>
        </Form>
      </Modal>

      {/* add progress modal */}
      <Modal
        title="追加进展"
        open={progressOpen}
        onOk={handleAddProgress}
        onCancel={() => setProgressOpen(false)}
        okText="提交"
        cancelText="取消"
      >
        <Form form={progressForm} layout="vertical">
          <Form.Item name="description" label="进展描述" rules={[{ required: true }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="progress" label="当前进度 (%)" rules={[{ required: true }]}>
            <InputNumber min={0} max={100} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* tag management modal */}
      <Modal
        title="标签管理"
        open={tagModalOpen}
        onCancel={() => setTagModalOpen(false)}
        footer={null}
        width={420}
      >
        <Space style={{ marginBottom: 12 }}>
          <Input
            placeholder="输入新标签名"
            value={tagNewName}
            onChange={(e) => setTagNewName(e.target.value)}
            onPressEnter={handleCreateTag}
            style={{ width: 180 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateTag}>新增</Button>
        </Space>
        <Input
          placeholder="搜索标签..."
          prefix={<SearchOutlined />}
          value={tagSearch}
          onChange={(e) => setTagSearch(e.target.value)}
          allowClear
          style={{ marginBottom: 12 }}
        />
        <List
          loading={tagLoading}
          dataSource={allTags}
          locale={{ emptyText: "暂无标签" }}
          style={{ maxHeight: 300, overflow: "auto" }}
          renderItem={(tag) => (
            <List.Item
              actions={[
                <Popconfirm
                  title={`确定删除标签"${tag.name}"？`}
                  onConfirm={() => handleDeleteTag(tag.id)}
                  okText="删除"
                  cancelText="取消"
                >
                  <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={tag.name}
                description={`创建: ${tag.created_at}`}
              />
            </List.Item>
          )}
        />
      </Modal>
    </div>
  );
}

export default TaskManager;
