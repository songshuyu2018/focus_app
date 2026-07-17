import { Modal, Form, Input, InputNumber, Select, message } from "antd";
import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ServerConfig {
  id: string; name: string; host: string; port: number;
  username: string; authType: "password" | "key";
  password?: string; keyPath?: string;
}

interface Props {
  open: boolean;
  server: ServerConfig | null;
  onClose: () => void;
}

export default function ServerFormModal({ open, server, onClose }: Props) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) {
      if (server) {
        form.setFieldsValue({
          ...server,
          authType: server.authType || "password",
        });
      } else {
        form.resetFields();
        form.setFieldsValue({
          port: 22,
          authType: navigator.platform.startsWith("Win") ? "key" : "password",
        });
      }
    }
  }, [open, server, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    const config: Record<string, unknown> = {
      id: server?.id || crypto.randomUUID(),
      name: values.name,
      host: values.host,
      port: values.port,
      username: values.username,
      authType: values.authType,
      password: values.authType === "password" ? values.password || "" : null,
      keyPath: values.authType === "key" ? values.keyPath || "" : null,
    };
    try {
      if (server) {
        await invoke("update_server", { config });
      } else {
        await invoke("add_server", { config });
      }
      message.success(server ? "已更新" : "已添加");
      onClose();
    } catch (e: any) { message.error(e); }
  };

  const authType = Form.useWatch("authType", form);

  return (
    <Modal title={server ? "编辑服务器" : "添加服务器"} open={open}
      onOk={handleOk} onCancel={onClose} okText="保存" cancelText="取消">
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="名称" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="host" label="主机地址" rules={[{ required: true }]}>
          <Input placeholder="192.168.1.100" />
        </Form.Item>
        <Form.Item name="port" label="端口" rules={[{ required: true }]}>
          <InputNumber min={1} max={65535} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="username" label="用户名" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="authType" label="认证方式">
          <Select options={[
            ...(navigator.platform.startsWith("Win") ? [] : [{ value: "password" as const, label: "密码认证" }]),
            { value: "key" as const, label: "系统公钥认证" },
          ]} />
        </Form.Item>
        {authType === "password" && (
          <Form.Item name="password" label="密码">
            <Input.Password />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
