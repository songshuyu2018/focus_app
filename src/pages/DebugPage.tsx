import { Tabs } from "antd";
import { TagsOutlined, UnorderedListOutlined, FieldTimeOutlined, FileTextOutlined } from "@ant-design/icons";
import TagManager from "../components/TagManager";
import TaskManager from "../components/TaskManager";
import TimelineManager from "../components/TimelineManager";
import ReportDebug from "../components/ReportDebug";

function DebugPage() {
  return (
    <Tabs
      defaultActiveKey="tags"
      items={[
        { key: "tags", label: "标签", icon: <TagsOutlined />, children: <TagManager /> },
        { key: "tasks", label: "任务", icon: <UnorderedListOutlined />, children: <TaskManager /> },
        { key: "timeline", label: "时间线", icon: <FieldTimeOutlined />, children: <TimelineManager /> },
        { key: "report", label: "报告", icon: <FileTextOutlined />, children: <ReportDebug /> },
      ]}
    />
  );
}

export default DebugPage;
