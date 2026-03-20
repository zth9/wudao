import { useTranslation } from "react-i18next";
import { tasks as tasksApi } from "../services/api";
import MarkdownContent from "./MarkdownContent";

interface Props {
  taskId: string;
  agentDoc: string | null;
  onClose: () => void;
}

export default function TaskArtifactsDrawer({ taskId, agentDoc, onClose }: Props) {
  const { t } = useTranslation();
  const ready = Boolean(agentDoc?.trim());

  return (
    <aside className="w-full h-full flex flex-col min-w-0 bg-white/50 dark:bg-black/40">
      <div className="px-4 py-3 border-b border-black/5 dark:border-white/10 flex items-start justify-between gap-3 shrink-0">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-system-gray-500 dark:text-system-gray-400">{t("artifacts.title")}</h2>
          <p className="text-[10px] text-system-gray-400 dark:text-system-gray-300 mt-1">{t("artifacts.subtitle")}</p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 shrink-0 rounded-apple-lg text-system-gray-400 hover:text-apple-blue hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          title={t("artifacts.collapse")}
        >
          ✕
        </button>
      </div>

      <div className="px-4 py-3 border-b border-black/5 dark:border-white/10 flex items-center justify-between gap-3 shrink-0">
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
        <div className="min-h-full bg-white dark:bg-[#1c1c1e] border border-black/5 dark:border-white/10 rounded-apple-xl p-4 shadow-apple-sm">
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
    </aside>
  );
}
