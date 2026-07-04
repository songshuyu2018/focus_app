import { useState, useEffect } from "react";
import { Button, DatePicker, Select, Space, Modal, message } from "antd";
import { FileTextOutlined, TagOutlined } from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";
import dayjs from "dayjs";

const { RangePicker } = DatePicker;

interface TagItem { id: string; name: string; }

function ReportDebug() {
  const [tags, setTags] = useState<TagItem[]>([]);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs(), dayjs()]);
  const [tagId, setTagId] = useState<string | undefined>();
  const [content, setContent] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    invoke<TagItem[]>("list_tags", { search: null })
      .then(setTags)
      .catch(() => {});
  }, []);

  const handleByDate = async () => {
    try {
      const md = await invoke<string>("generate_report_by_date", {
        startDate: dateRange[0].format("YYYY-MM-DD"),
        endDate: dateRange[1].format("YYYY-MM-DD"),
      });
      setContent(md);
      setModalOpen(true);
    } catch (e: any) { message.error("生成失败: " + e); }
  };

  const handleByTag = async () => {
    if (!tagId) { message.warning("请先选择标签"); return; }
    try {
      const md = await invoke<string>("generate_report_by_tag", { tagId });
      setContent(md);
      setModalOpen(true);
    } catch (e: any) { message.error("生成失败: " + e); }
  };

  return (
    <div className="panel">
      <h2>报告调试</h2>

      <Space direction="vertical" size={16} style={{ width: "100%", maxWidth: 500 }}>
        {/* 按日期 */}
        <div>
          <h3 style={{ marginBottom: 8, color: "rgba(255,255,255,0.85)" }}>
            <FileTextOutlined /> 按日期生成
          </h3>
          <Space>
            <RangePicker
              value={dateRange}
              onChange={(dates) => { if (dates) setDateRange([dates[0]!, dates[1]!]); }}
            />
            <Button type="primary" onClick={handleByDate}>生成报告</Button>
          </Space>
        </div>

        {/* 按标签 */}
        <div>
          <h3 style={{ marginBottom: 8, color: "rgba(255,255,255,0.85)" }}>
            <TagOutlined /> 按标签生成
          </h3>
          <Space>
            <Select
              placeholder="选择标签"
              value={tagId}
              onChange={setTagId}
              options={tags.map((t) => ({ value: t.id, label: t.name }))}
              style={{ width: 200 }}
              allowClear
            />
            <Button type="primary" onClick={handleByTag}>生成报告</Button>
          </Space>
        </div>
      </Space>

      <Modal
        title="报告预览"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={[
          <Button key="copy" onClick={() => {
            navigator.clipboard.writeText(content);
            message.success("已复制到剪贴板");
          }}>复制</Button>,
          <Button key="close" type="primary" onClick={() => setModalOpen(false)}>关闭</Button>,
        ]}
        width={700}
      >
        <div style={{
          background: "#1f1f1f", border: "1px solid #434343", borderRadius: 6,
          padding: 16, maxHeight: 500, overflow: "auto", whiteSpace: "pre-wrap",
          fontFamily: "monospace", fontSize: 13, lineHeight: "1.6",
          color: "rgba(255,255,255,0.85)",
        }}>
          {content || "（空报告）"}
        </div>
      </Modal>
    </div>
  );
}

export default ReportDebug;
