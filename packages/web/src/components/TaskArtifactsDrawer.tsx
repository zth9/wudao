import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";
import { tasks as tasksApi } from "../services/api";
import MarkdownContent from "./MarkdownContent";
import { TaskWorkspaceDrawerShell } from "./TaskWorkspaceDrawerShell";

interface Props {
  taskId: string;
  agentDoc: string | null;
  onClose: () => void;
}

export default function TaskArtifactsDrawer({ taskId, agentDoc, onClose }: Props) {
  const { t } = useTranslation();
  const ready = Boolean(agentDoc?.trim());

  return (
    <TaskWorkspaceDrawerShell
      title={t("artifacts.title")}
      icon={FileText}
      onClose={onClose}
    >
      <div className="px-4 py-3 border-b border-black/5 bg-white/35 dark:border-white/10 dark:bg-white/[0.03] flex items-center justify-between gap-3 shrink-0">
        <div>
          <div className="text-xs font-bold text-foreground dark:text-foreground-dark">AGENTS.md</div>
          <div className="text-[10px] text-system-gray-400 dark:text-system-gray-300 mt-0.5">{t("artifacts.description")}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
              ready ? "bg-apple-green/10 text-apple-green" : "bg-black/5 dark:bg-white/5 text-system-gray-400 dark:text-system-gray-300"
            }`}
          >
            {ready ? t("artifacts.ready") : t("artifacts.pending")}
          </span>
          <button
            onClick={() => tasksApi.openWorkspace(taskId)}
            className="px-2.5 py-1 apple-btn-secondary text-[10px] font-bold"
          >
            {t("tasks.open_workspace")}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 p-4 overflow-y-auto dark-scrollbar">
        <div className="min-h-full bg-white/88 dark:bg-[#232323]/88 border border-black/5 dark:border-white/10 rounded-apple-xl p-4 shadow-apple-sm">
          {agentDoc ? (
            <MarkdownContent content={agentDoc} />
          ) : (
            <div className="min-h-[220px] h-full flex flex-col items-center justify-center text-center text-[11px] text-system-gray-400 dark:text-system-gray-300">
              <span className="mb-2 opacity-50">📄</span>
              {t("artifacts.empty_title")}<br />
              {t("artifacts.empty_desc")}
            </div>
          )}
        </div>
      </div>
    </TaskWorkspaceDrawerShell>
  );
}
