import { useState, useEffect, useCallback } from "react";
import { Button, Input, List, message, Space, Popconfirm } from "antd";
import { PlusOutlined, DeleteOutlined, SearchOutlined } from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";

interface Tag {
  id: string;
  name: string;
  created_at: string;
}

function TagManager() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [newName, setNewName] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const loadTags = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<Tag[]>("list_tags", {
        search: search || null,
      });
      setTags(result);
    } catch (e: any) {
      message.error("加载标签失败: " + e);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      message.warning("请输入标签名");
      return;
    }
    try {
      await invoke("create_tag", { name });
      message.success(`标签 "${name}" 创建成功`);
      setNewName("");
      loadTags();
    } catch (e: any) {
      message.error("创建失败: " + e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await invoke("delete_tag", { id });
      message.success("标签已删除");
      loadTags();
    } catch (e: any) {
      message.error("删除失败: " + e);
    }
  };

  return (
    <div className="panel">
      <h2>标签管理</h2>

      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="输入新标签名"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onPressEnter={handleCreate}
          style={{ width: 200 }}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          新增
        </Button>
      </Space>

      <div style={{ marginBottom: 16 }}>
        <Input
          placeholder="搜索标签..."
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ width: 300 }}
        />
      </div>

      <List
        loading={loading}
        dataSource={tags}
        locale={{ emptyText: "暂无标签" }}
        renderItem={(tag) => (
          <List.Item
            actions={[
              <Popconfirm
                title="确认删除"
                description={`确定删除标签 "${tag.name}"？`}
                onConfirm={() => handleDelete(tag.id)}
                okText="删除"
                cancelText="取消"
              >
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  size="small"
                />
              </Popconfirm>,
            ]}
          >
            <List.Item.Meta
              title={tag.name}
              description={`创建时间: ${tag.created_at}`}
            />
          </List.Item>
        )}
      />
    </div>
  );
}

export default TagManager;
