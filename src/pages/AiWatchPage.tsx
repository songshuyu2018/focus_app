import { useState } from "react";
import ServerPanel from "./aiwatch/ServerPanel";
import SessionPanel from "./aiwatch/SessionPanel";

function AiWatchPage() {
  const [activeServerId, setActiveServerId] = useState<string | null>(null);

  return (
    <div className="panel">
      <h2>AI监工</h2>
      <div style={{ display: "flex", gap: 16, height: "calc(100vh - 160px)" }}>
        <div style={{ width: 280, flexShrink: 0, overflow: "auto" }}>
          <ServerPanel onSelect={setActiveServerId} activeId={activeServerId} />
        </div>
        <div style={{ flex: 1, overflow: "auto", borderLeft: "1px solid #303030", paddingLeft: 16 }}>
          <SessionPanel serverId={activeServerId} />
        </div>
      </div>
    </div>
  );
}

export default AiWatchPage;
