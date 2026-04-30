import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, RefreshCw, Save, User, WandSparkles } from "lucide-react";
import { LoadingIndicator } from "./LoadingIndicator";
import {
  contexts as contextsApi,
  system,
  type WudaoAgentMemorySaveResult,
  type WudaoUserMemorySaveResult,
} from "../services/api";
import { cn } from "../utils/cn";
import { Alert } from "@heroui/react/alert";
import { Button } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { TextArea } from "@heroui/react/textarea";

type MemoryModule = "user" | "agent";

function resolveApiError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;

  const jsonStart = error.message.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(error.message.slice(jsonStart)) as { error?: string };
      if (parsed.error) return parsed.error;
    } catch {
      // ignore parse failures
    }
  }

  return error.message || fallback;
}

export default function MemoriesView() {
  const { t } = useTranslation();
  const [activeModule, setActiveModule] = useState<MemoryModule>("user");
  const [refreshing, setRefreshing] = useState(false);

  const [userMemory, setUserMemory] = useState("");
  const [userMemoryPath, setUserMemoryPath] = useState("");
  const [userMemoryLoading, setUserMemoryLoading] = useState(true);
  const [userMemorySaving, setUserMemorySaving] = useState(false);
  const [userMemoryMessage, setUserMemoryMessage] = useState<string | null>(null);
  const [userMemoryWarning, setUserMemoryWarning] = useState<string | null>(null);

  const [agentMemory, setAgentMemory] = useState("");
  const [agentMemoryPath, setAgentMemoryPath] = useState("");
  const [agentMemoryLoading, setAgentMemoryLoading] = useState(true);
  const [agentMemorySaving, setAgentMemorySaving] = useState(false);
  const [agentMemoryMessage, setAgentMemoryMessage] = useState<string | null>(null);
  const [agentMemoryWarning, setAgentMemoryWarning] = useState<string | null>(null);

  const loadUserMemory = useCallback(async () => {
    setUserMemoryLoading(true);
    try {
      const result = await contextsApi.getUserMemory();
      setUserMemory(result.content);
      setUserMemoryPath(result.path);
      setUserMemoryWarning(null);
    } catch (error) {
      setUserMemoryWarning(resolveApiError(error, t("memories.user_memory_load_failed")));
    } finally {
      setUserMemoryLoading(false);
    }
  }, [t]);

  const loadAgentMemory = useCallback(async () => {
    setAgentMemoryLoading(true);
    try {
      const result = await contextsApi.getAgentMemory();
      setAgentMemory(result.content);
      setAgentMemoryPath(result.path);
      setAgentMemoryWarning(null);
    } catch (error) {
      setAgentMemoryWarning(resolveApiError(error, t("memories.agent_memory_load_failed")));
    } finally {
      setAgentMemoryLoading(false);
    }
  }, [t]);

  const refreshAll = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    await Promise.all([loadUserMemory(), loadAgentMemory()]);
    if (silent) setRefreshing(false);
  }, [loadAgentMemory, loadUserMemory]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const moduleOptions = useMemo<Array<{ key: MemoryModule; label: string; icon: typeof User }>>(
    () => [
      { key: "user", label: t("memories.modules.user"), icon: User },
      { key: "agent", label: t("memories.modules.agent"), icon: WandSparkles },
    ],
    [t],
  );

  const handleSaveUserMemory = useCallback(async () => {
    setUserMemorySaving(true);
    setUserMemoryMessage(null);
    setUserMemoryWarning(null);
    try {
      const result: WudaoUserMemorySaveResult = await contextsApi.updateUserMemory(userMemory);
      setUserMemory(result.content);
      setUserMemoryPath(result.path);
      setUserMemoryMessage(t("memories.user_memory_saved"));
    } catch (error) {
      setUserMemoryWarning(resolveApiError(error, t("memories.user_memory_save_failed")));
    } finally {
      setUserMemorySaving(false);
    }
  }, [t, userMemory]);

  const handleSaveAgentMemory = useCallback(async () => {
    setAgentMemorySaving(true);
    setAgentMemoryMessage(null);
    setAgentMemoryWarning(null);
    try {
      const result: WudaoAgentMemorySaveResult = await contextsApi.updateAgentMemory(agentMemory);
      setAgentMemory(result.content);
      setAgentMemoryPath(result.path);
      setAgentMemoryMessage(t("memories.agent_memory_saved"));
    } catch (error) {
      setAgentMemoryWarning(resolveApiError(error, t("memories.agent_memory_save_failed")));
    } finally {
      setAgentMemorySaving(false);
    }
  }, [agentMemory, t]);

  const handleOpenPath = useCallback(async (module: MemoryModule, targetPath: string | null | undefined) => {
    if (!targetPath) return;
    try {
      await system.openPath(targetPath);
    } catch (error) {
      const message = resolveApiError(error, t("memories.open_file_failed"));
      if (module === "agent") {
        setAgentMemoryWarning(message);
        return;
      }
      setUserMemoryWarning(message);
    }
  }, [t]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-surface-secondary dark:bg-background">
      <header className="px-8 pt-8 pb-4 shrink-0 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold text-accent uppercase tracking-[0.2em] mb-1">{t("memories.kicker")}</p>
          <h1 className="text-3xl font-extrabold tracking-tight">{t("memories.title")}</h1>
          <p className="mt-2 text-sm text-muted max-w-3xl">{t("memories.subtitle")}</p>
        </div>
        <Button
          variant="primary"
          onPress={() => void refreshAll(true)}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
        >
          <RefreshCw size={16} className={cn(refreshing && "animate-spin")} />
          <span>{refreshing ? t("memories.refreshing") : t("common.refresh")}</span>
        </Button>
      </header>

      <div className="flex-1 min-h-0 px-8 pb-8">
        <div className="mx-auto flex h-full min-h-0 max-w-6xl flex-col gap-6 overflow-hidden">
          <section className="shrink-0 flex items-center gap-2 flex-wrap">
            {moduleOptions.map((option) => {
              const active = activeModule === option.key;
              const Icon = option.icon;
              return (
                <Button
                  key={option.key}
                  variant={active ? "primary" : "secondary"}
                  onPress={() => setActiveModule(option.key)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors",
                  )}
                >
                  <Icon size={14} />
                  <span>{option.label}</span>
                </Button>
              );
            })}
          </section>

          {activeModule === "user" && (
            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
              <div className="flex shrink-0 items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <User size={18} className="text-accent" />
                    <h2 className="text-lg font-semibold tracking-tight">{t("memories.user_memory_title")}</h2>
                  </div>
                  <p className="mt-2 text-sm text-muted max-w-3xl">{t("memories.user_memory_desc")}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  <Button
                    variant="secondary"
                    onPress={() => void handleOpenPath("user", userMemoryPath)}
                    isDisabled={!userMemoryPath}
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
                  >
                    <FolderOpen size={16} />
                    <span>{t("memories.open_file")}</span>
                  </Button>
                  <Button
                    variant="secondary"
                    onPress={() => setUserMemory("")}
                    isDisabled={userMemorySaving}
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
                  >
                    <span>{t("memories.clear_user_memory")}</span>
                  </Button>
                  <Button
                    variant="primary"
                    onPress={() => void handleSaveUserMemory()}
                    isDisabled={userMemorySaving || userMemoryLoading}
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
                  >
                    {userMemorySaving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                    <span>{userMemorySaving ? t("memories.saving_user_memory") : t("memories.save_user_memory")}</span>
                  </Button>
                </div>
              </div>

              <div className="mt-4 shrink-0 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted">{t("memories.user_memory_path")}</p>
                <p className="text-sm font-medium break-all">{userMemoryPath || t("common.none")}</p>
              </div>

              {userMemoryLoading ? (
                <div className="flex flex-1 min-h-0 items-center justify-center py-12">
                  <LoadingIndicator text={t("memories.loading")} />
                </div>
              ) : (
                <div className="mt-4 flex flex-1 min-h-0 flex-col gap-4">
                  <TextArea
                    value={userMemory}
                    onChange={(e) => setUserMemory(e.target.value)}
                    placeholder={t("memories.user_memory_placeholder")}
                    className="h-full max-h-full min-h-0 w-full flex-1 rounded-2xl border border-border bg-default px-4 py-4 text-sm leading-6 outline-none transition-colors focus:border-accent/50 focus:ring-2 focus:ring-accent/10 resize-none"
                  />
                  <p className="shrink-0 text-sm text-muted">{t("memories.user_memory_hint")}</p>
                </div>
              )}

              {userMemoryMessage && (
                <Alert color="accent" className="mt-4 shrink-0">
                  <Alert.Content>
                    <Alert.Description>{userMemoryMessage}</Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
              {userMemoryWarning && (
                <Alert color="warning" className="mt-4 shrink-0">
                  <Alert.Content>
                    <Alert.Description className="whitespace-pre-wrap break-words">{userMemoryWarning}</Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
            </Card>
          )}

          {activeModule === "agent" && (
            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
              <div className="flex shrink-0 items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <WandSparkles size={18} className="text-accent" />
                    <h2 className="text-lg font-semibold tracking-tight">{t("memories.agent_memory_title")}</h2>
                  </div>
                  <p className="mt-2 text-sm text-muted max-w-3xl">{t("memories.agent_memory_desc")}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  <Button
                    variant="secondary"
                    onPress={() => void handleOpenPath("agent", agentMemoryPath)}
                    isDisabled={!agentMemoryPath}
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
                  >
                    <FolderOpen size={16} />
                    <span>{t("memories.open_file")}</span>
                  </Button>
                  <Button
                    variant="secondary"
                    onPress={() => setAgentMemory("")}
                    isDisabled={agentMemorySaving}
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
                  >
                    <span>{t("memories.clear_agent_memory")}</span>
                  </Button>
                  <Button
                    variant="primary"
                    onPress={() => void handleSaveAgentMemory()}
                    isDisabled={agentMemorySaving || agentMemoryLoading}
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
                  >
                    {agentMemorySaving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                    <span>{agentMemorySaving ? t("memories.saving_agent_memory") : t("memories.save_agent_memory")}</span>
                  </Button>
                </div>
              </div>

              <div className="mt-4 shrink-0 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted">{t("memories.agent_memory_path")}</p>
                <p className="text-sm font-medium break-all">{agentMemoryPath || t("common.none")}</p>
              </div>

              {agentMemoryLoading ? (
                <div className="flex flex-1 min-h-0 items-center justify-center py-12">
                  <LoadingIndicator text={t("memories.loading")} />
                </div>
              ) : (
                <div className="mt-4 flex flex-1 min-h-0 flex-col gap-4">
                  <TextArea
                    value={agentMemory}
                    onChange={(e) => setAgentMemory(e.target.value)}
                    placeholder={t("memories.agent_memory_placeholder")}
                    className="h-full max-h-full min-h-0 w-full flex-1 rounded-2xl border border-border bg-default px-4 py-4 text-sm leading-6 outline-none transition-colors focus:border-accent/50 focus:ring-2 focus:ring-accent/10 resize-none"
                  />
                  <p className="shrink-0 text-sm text-muted">{t("memories.agent_memory_hint")}</p>
                </div>
              )}

              {agentMemoryMessage && (
                <Alert color="accent" className="mt-4 shrink-0">
                  <Alert.Content>
                    <Alert.Description>{agentMemoryMessage}</Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
              {agentMemoryWarning && (
                <Alert color="warning" className="mt-4 shrink-0">
                  <Alert.Content>
                    <Alert.Description className="whitespace-pre-wrap break-words">{agentMemoryWarning}</Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
