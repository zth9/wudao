import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";
import { tasks as tasksApi } from "../services/api";
import MarkdownContent from "./MarkdownContent";
import { TaskWorkspaceDrawerShell } from "./TaskWorkspaceDrawerShell";
import { Button } from "@heroui/react/button";
import { Chip } from "@heroui/react/chip";

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
      <div className="px-4 py-3 border-b border-border bg-surface/35 flex items-center justify-between gap-3 shrink-0">
        <div>
          <div className="text-xs font-bold text-foreground">AGENTS.md</div>
          <div className="text-[10px] text-muted mt-0.5">{t("artifacts.description")}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Chip
            size="sm"
            variant="soft"
            color={ready ? "success" : "default"}
            className="px-2 py-0.5 text-[9px]"
          >
            {ready ? t("artifacts.ready") : t("artifacts.pending")}
          </Chip>
          <Button
            variant="secondary"
            onPress={() => void tasksApi.openWorkspace(taskId)}
            className="px-2.5 py-1 text-[10px] font-bold"
          >
            {t("tasks.open_workspace")}
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 p-4 overflow-y-auto">
        <div className="min-h-full bg-surface/88 border border-border rounded-xl p-4 shadow-sm">
          {agentDoc ? (
            <MarkdownContent content={agentDoc} />
          ) : (
            <div className="min-h-[220px] h-full flex flex-col items-center justify-center text-center text-[11px] text-muted">
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
