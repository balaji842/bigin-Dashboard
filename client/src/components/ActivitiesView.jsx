import { useState } from "react";
import ModuleView from "./ModuleView.jsx";

const SUB_TABS = [
  {
    id: "Tasks",
    label: "Tasks",
    columns: [
      { key: "Subject", label: "Subject" },
      { key: "Status", label: "Status" },
      { key: "Priority", label: "Priority" },
      { key: "Due_Date", label: "Due date" },
      { key: "Owner", label: "Owner" },
    ],
  },
  {
    id: "Calls",
    label: "Calls",
    columns: [
      { key: "Subject", label: "Subject" },
      { key: "Call_Type", label: "Type" },
      { key: "Call_Start_Time", label: "Start time" },
      { key: "Call_Duration", label: "Duration" },
      { key: "Owner", label: "Owner" },
    ],
  },
  {
    id: "Events",
    label: "Meetings",
    columns: [
      { key: "Event_Title", label: "Title" },
      { key: "From", label: "From" },
      { key: "To", label: "To" },
      { key: "Owner", label: "Owner" },
    ],
  },
];

export default function ActivitiesView({ refreshKey }) {
  const [tab, setTab] = useState("Tasks");
  const active = SUB_TABS.find((t) => t.id === tab);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-navy-900 text-white"
                : "bg-white text-slate-500 border border-slate-200 hover:border-navy-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <ModuleView
        module={active.id}
        title={active.label}
        columns={active.columns}
        refreshKey={refreshKey}
      />
    </div>
  );
}
