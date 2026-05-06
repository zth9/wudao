import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import type { Provider, UsageTracker } from "../services/api";
import { Plus, Settings as SettingsIcon, Trash2, Edit, X, Cpu, AlertCircle, Sun, Moon, Monitor, Languages, Bot, User, BarChart3, GripVertical, FileText } from "lucide-react";
import { ProviderIcon } from "./ProviderIcon";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { cn } from "../utils/cn";
import { Alert } from "@heroui/react/alert";
import { Avatar } from "@heroui/react/avatar";
import { Button } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { Checkbox } from "@heroui/react/checkbox";
import { Chip } from "@heroui/react/chip";
import { Input } from "@heroui/react/input";
import { Modal } from "@heroui/react/modal";
import { Spinner } from "@heroui/react/spinner";
import { TextArea } from "@heroui/react/textarea";
import { Tooltip } from "@heroui/react/tooltip";
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const EMPTY_FORM = {
  name: "",
  endpoint: "",
  api_key: "",
  model: "",
  is_default: 0,
};

interface DefaultProviderToggleProps {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}

export function DefaultProviderToggle({ checked, label, onChange }: DefaultProviderToggleProps) {
  return (
    <Checkbox
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3 py-3 transition-all cursor-pointer group",
        checked
          ? "border-accent/20 bg-accent/10"
          : "border-border bg-default hover:bg-default/80",
      )}
      isSelected={checked}
      onChange={onChange}
    >
      <Checkbox.Control />
      <Checkbox.Indicator />
      <Checkbox.Content>
        <span className="text-sm font-semibold text-foreground transition-colors group-hover:text-accent">
          {label}
        </span>
      </Checkbox.Content>
    </Checkbox>
  );
}

function SortableProviderItem({ provider, onEdit, onDelete }: {
  provider: Provider;
  onEdit: (p: Provider) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: provider.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    position: "relative" as const,
  };
  const providerSummary = [provider.model || provider.id, provider.endpoint || ""].filter(Boolean).join(" • ");

  return (
    <div ref={setNodeRef} style={style} className={cn(
      "group flex items-center justify-between px-4 py-3 rounded-lg hover:bg-default transition-all",
      isDragging && "bg-surface-secondary shadow-lg opacity-90",
    )}>
      <div className="min-w-0 flex items-center gap-4">
        <button
          className="cursor-grab text-muted/40 hover:text-muted p-1 opacity-0 group-hover:opacity-100 transition-opacity active:cursor-grabbing"
          aria-label={t("common.drag_to_reorder")}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
        <div className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center text-white shadow-sm",
          provider.is_default ? "bg-accent" : "bg-default"
        )}>
          <ProviderIcon providerId={provider.id} size={20} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold truncate tracking-tight">{provider.name}</p>
            {provider.is_default ? (
              <Chip size="sm" color="accent" variant="soft" className="text-[9px] font-extrabold uppercase tracking-widest">{t('theme.auto')}</Chip>
            ) : null}
          </div>
          <p className="text-[11px] text-muted font-medium truncate mt-0.5 opacity-80">
            {providerSummary}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Tooltip delay={300} closeDelay={0}>
          <Button
            isIconOnly
            variant="ghost"
            onPress={() => onEdit(provider)}
            className="h-8 w-8 text-muted hover:text-accent"
            aria-label={t("common.edit")}
          >
            <Edit size={16} />
          </Button>
          <Tooltip.Content className="rounded-lg border border-border bg-overlay px-2.5 py-1.5 text-xs font-semibold text-overlay-foreground shadow-md" placement="top" showArrow>
            <Tooltip.Arrow className="fill-overlay" />
            {t("common.edit")}
          </Tooltip.Content>
        </Tooltip>
        <Tooltip delay={300} closeDelay={0}>
          <Button
            isIconOnly
            variant="ghost"
            onPress={() => onDelete(provider.id)}
            className="h-8 w-8 text-muted hover:text-danger"
            aria-label={t("common.delete")}
          >
            <Trash2 size={16} />
          </Button>
          <Tooltip.Content className="rounded-lg border border-border bg-overlay px-2.5 py-1.5 text-xs font-semibold text-overlay-foreground shadow-md" placement="top" showArrow>
            <Tooltip.Arrow className="fill-overlay" />
            {t("common.delete")}
          </Tooltip.Content>
        </Tooltip>
      </div>
    </div>
  );
}

function SortableTrackerItem({ tracker, onEdit, onDelete }: {
  tracker: UsageTracker;
  onEdit: (t: UsageTracker) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tracker.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    position: "relative" as const,
  };
  const providerLabel = tracker.provider.charAt(0).toUpperCase() + tracker.provider.slice(1);

  return (
    <div ref={setNodeRef} style={style} className={cn(
      "group flex items-center justify-between px-4 py-3 rounded-lg hover:bg-default transition-all",
      isDragging && "bg-surface-secondary shadow-lg opacity-90",
    )}>
      <div className="min-w-0 flex items-center gap-4">
        <button
          className="cursor-grab text-muted/40 hover:text-muted p-1 opacity-0 group-hover:opacity-100 transition-opacity active:cursor-grabbing"
          aria-label={t("common.drag_to_reorder")}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
        <div className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center text-white shadow-sm",
          tracker.enabled ? "bg-accent" : "bg-default opacity-50"
        )}>
          <ProviderIcon providerId={tracker.provider} size={20} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold truncate tracking-tight">{tracker.name}</p>
            {!tracker.enabled && (
              <Chip size="sm" color="default" variant="soft" className="text-[9px] font-extrabold uppercase tracking-widest opacity-50">OFF</Chip>
            )}
          </div>
          <p className="text-[11px] text-muted font-medium truncate mt-0.5 opacity-80">
            {providerLabel}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Tooltip delay={300} closeDelay={0}>
          <Button
            isIconOnly
            variant="ghost"
            onPress={() => onEdit(tracker)}
            className="h-8 w-8 text-muted hover:text-accent"
            aria-label={t("common.edit")}
          >
            <Edit size={16} />
          </Button>
          <Tooltip.Content className="rounded-lg border border-border bg-overlay px-2.5 py-1.5 text-xs font-semibold text-overlay-foreground shadow-md" placement="top" showArrow>
            <Tooltip.Arrow className="fill-overlay" />
            {t("common.edit")}
          </Tooltip.Content>
        </Tooltip>
        <Tooltip delay={300} closeDelay={0}>
          <Button
            isIconOnly
            variant="ghost"
            onPress={() => onDelete(tracker.id)}
            className="h-8 w-8 text-muted hover:text-danger"
            aria-label={t("common.delete")}
          >
            <Trash2 size={16} />
          </Button>
          <Tooltip.Content className="rounded-lg border border-border bg-overlay px-2.5 py-1.5 text-xs font-semibold text-overlay-foreground shadow-md" placement="top" showArrow>
            <Tooltip.Arrow className="fill-overlay" />
            {t("common.delete")}
          </Tooltip.Content>
        </Tooltip>
      </div>
    </div>
  );
}

function AgentRunnerSettingsCard() {
  const { t } = useTranslation();
  const providers = useSettingsStore((s) => s.providers);
  const runnerConfig = useSettingsStore((s) => s.runnerConfig);
  const runnerConfigLoading = useSettingsStore((s) => s.runnerConfigLoading);
  const fetchRunnerConfig = useSettingsStore((s) => s.fetchRunnerConfig);
  const updateRunnerConfig = useSettingsStore((s) => s.updateRunnerConfig);
  const fetchProviders = useSettingsStore((s) => s.fetch);
  const [modelOverride, setModelOverride] = useState("");
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");

  useEffect(() => {
    fetchRunnerConfig();
    fetchProviders();
  }, []);

  useEffect(() => {
    if (runnerConfig) {
      setModelOverride(runnerConfig.model_override || "");
      setSelectedProviderId(runnerConfig.provider_id || "");
    }
  }, [runnerConfig]);

  const handleSave = async () => {
    await updateRunnerConfig({
      provider_id: selectedProviderId || null,
      model_override: modelOverride.trim() || null,
    });
  };

  return (
    <Card className="p-6 space-y-6 border border-border bg-surface/50 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
          <Bot size={16} className="text-accent" />
        </div>
        <div>
          <h2 className="text-sm font-bold">{t("settings.agent_runner")}</h2>
          <p className="text-[11px] text-muted">{t("settings.agent_runner_desc")}</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.14em] text-muted mb-2">
            {t("settings.runner_type")}
          </label>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-default/50 text-xs">
            <Chip size="sm" variant="soft" className="bg-accent/10 text-accent">
              Claude SDK
            </Chip>
            <span className="text-muted text-[10px]">{t("settings.runner_type_only_option")}</span>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.14em] text-muted mb-2">
            {t("settings.runner_provider")}
          </label>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedProviderId("")}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl border text-xs text-left transition-all",
                !selectedProviderId
                  ? "border-accent/20 bg-accent/10"
                  : "border-border bg-default/50 hover:bg-default/80",
              )}
            >
              <span className="font-medium">{t("settings.runner_provider_follow_chat")}</span>
            </button>
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedProviderId(p.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-xl border text-xs text-left transition-all",
                  selectedProviderId === p.id
                    ? "border-accent/20 bg-accent/10"
                    : "border-border bg-default/50 hover:bg-default/80",
                )}
              >
                <ProviderIcon providerId={p.id} size={14} className="shrink-0" />
                <span className="font-medium">{p.name}</span>
                <span className="text-muted text-[10px] truncate">{p.model}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.14em] text-muted mb-2">
            {t("settings.runner_model")}
          </label>
          <Input
            value={modelOverride}
            onChange={(e) => setModelOverride(e.target.value)}
            placeholder={t("settings.runner_model_placeholder")}
            className="font-mono text-xs dark:border-white/10 dark:bg-default/70"
          />
          <p className="text-[10px] text-muted mt-1">{t("settings.runner_model_hint")}</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          onPress={handleSave}
          variant="primary"
          size="sm"
          isDisabled={runnerConfigLoading}
          className="rounded-lg"
        >
          {runnerConfigLoading ? <Spinner size="sm" /> : t("common.save")}
        </Button>
      </div>
    </Card>
  );
}

export default function SettingsView() {
  const { t, i18n } = useTranslation();
  const {
    providers,
    loading,
    error,
    clearError,
    fetch: fetchProviders,
    add: create,
    update,
    remove,
    reorder,
    user,
    setUser,
    assistant,
    setAssistant,
    theme,
    setTheme,
    usageTrackers,
    trackerLoading,
    trackerError,
    clearTrackerError,
    fetchTrackers,
    addTracker,
    updateTracker,
    reorderTrackers,
    removeTracker,
    assistantSystemPrompt,
    assistantSystemPromptLoading,
    assistantSystemPromptSaving,
    fetchAssistantSystemPrompt,
    saveAssistantSystemPrompt,
  } = useSettingsStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingAssistant, setUploadingAssistant] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("profile");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const assistantFileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [trackerDialogOpen, setTrackerDialogOpen] = useState(false);
  const [editingTrackerId, setEditingTrackerId] = useState<string | null>(null);
  const [trackerForm, setTrackerForm] = useState({ provider: "codex", name: "", auth_token: "", cookie: "", curl_command: "", url: "", enabled: 1 });
  const [trackerSaving, setTrackerSaving] = useState(false);
  const [systemPromptDraft, setSystemPromptDraft] = useState<string>("");
  const [systemPromptDirty, setSystemPromptDirty] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleProviderDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = providers.findIndex((p) => p.id === active.id);
    const newIndex = providers.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(providers, oldIndex, newIndex);
    reorder(reordered.map((p) => p.id));
  }, [providers, reorder]);

  const handleTrackerDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = usageTrackers.findIndex((t) => t.id === active.id);
    const newIndex = usageTrackers.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(usageTrackers, oldIndex, newIndex);
    reorderTrackers(reordered.map((t) => t.id));
  }, [usageTrackers, reorderTrackers]);

  // Default avatar options
  const defaultAvatars = ["👨‍💻", "👩‍💻", "🤖", "🐱", "🐶", "🦊", "🦁", "🐧", "🎨", "🚀"];
  const defaultAssistantAvatars = ["🤖", "🧠", "💡", "🔮", "⚡", "🌟", "🎯", "🚀", "💎", "🎨"];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const resp = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });
      const data = await resp.json();
      if (data.url) {
        setUser({ avatar: data.url });
      }
    } catch {
      // Avatar upload is optional; keep the settings form usable on failure.
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAssistantFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAssistant(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const resp = await fetch("/api/profile/assistant-avatar", {
        method: "POST",
        body: formData,
      });
      const data = await resp.json();
      if (data.url) {
        setAssistant({ avatar: data.url });
      }
    } catch {
      // Assistant avatar upload is optional; keep the settings form usable on failure.
    } finally {
      setUploadingAssistant(false);
      if (assistantFileInputRef.current) assistantFileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    void fetchProviders();
  }, [fetchProviders]);

  useEffect(() => {
    void fetchAssistantSystemPrompt();
  }, [fetchAssistantSystemPrompt]);

  useEffect(() => {
    if (!assistantSystemPromptLoading) {
      setSystemPromptDraft(assistantSystemPrompt);
      setSystemPromptDirty(false);
    }
  }, [assistantSystemPrompt, assistantSystemPromptLoading]);

  const handleSaveSystemPrompt = async () => {
    const ok = await saveAssistantSystemPrompt(systemPromptDraft);
    if (ok) setSystemPromptDirty(false);
  };

  const openCreate = () => {
    clearError();
    setForm(EMPTY_FORM);
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = (p: Provider) => {
    clearError();
    setForm({
      name: p.name,
      endpoint: p.endpoint,
      api_key: p.api_key || "",
      model: p.model,
      is_default: p.is_default,
    });
    setEditingId(p.id);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    clearError();
    setDialogOpen(false);
    setEditingId(null);
    setSaving(false);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    setSaving(true);
    const ok = editingId
      ? await update(editingId, form)
      : await create(form);
    setSaving(false);
    if (ok) {
      closeDialog();
    }
  };

  const handleCancelChanges = () => {
    if (editingId) {
      const p = providers.find((p) => p.id === editingId);
      if (p) openEdit(p);
    } else {
      setForm(EMPTY_FORM);
    }
  };

  const hasChanges = useMemo(() => {
    if (!editingId) return JSON.stringify(form) !== JSON.stringify(EMPTY_FORM);
    const p = providers.find((p) => p.id === editingId);
    if (!p) return false;
    return (
      form.name !== p.name ||
      form.endpoint !== p.endpoint ||
      form.api_key !== (p.api_key || "") ||
      form.model !== p.model ||
      form.is_default !== p.is_default
    );
  }, [form, editingId, providers]);

  const canSave = Boolean(form.name.trim() && form.endpoint.trim() && form.model.trim());

  useEffect(() => {
    void fetchTrackers();
  }, [fetchTrackers]);

  const openCreateTracker = () => {
    clearTrackerError();
    setTrackerForm({ provider: "codex", name: "", auth_token: "", cookie: "", curl_command: "", url: "", enabled: 1 });
    setEditingTrackerId(null);
    setTrackerDialogOpen(true);
  };

  const openEditTracker = (t: UsageTracker) => {
    clearTrackerError();
    setTrackerForm({
      provider: t.provider,
      name: t.name,
      auth_token: t.auth_token || "",
      cookie: t.cookie || "",
      curl_command: t.curl_command || "",
      url: t.url || "",
      enabled: t.enabled,
    });
    setEditingTrackerId(t.id);
    setTrackerDialogOpen(true);
  };

  const closeTrackerDialog = () => {
    clearTrackerError();
    setTrackerDialogOpen(false);
    setEditingTrackerId(null);
    setTrackerSaving(false);
    setTrackerForm({ provider: "codex", name: "", auth_token: "", cookie: "", curl_command: "", url: "", enabled: 1 });
  };

  const handleSaveTracker = async () => {
    setTrackerSaving(true);
    const ok = editingTrackerId
      ? await updateTracker(editingTrackerId, trackerForm)
      : await addTracker(trackerForm);
    setTrackerSaving(false);
    if (ok) closeTrackerDialog();
  };

  const menuItems = [
    { key: "profile", icon: User, label: t("settings.user_profile") },
    { key: "assistant", icon: Bot, label: t("settings.assistant_profile") },
    { key: "appearance", icon: Sun, label: t("settings.appearance") },
    { key: "providers", icon: Cpu, label: t("settings.model_providers") },
    { key: "agent_runner", icon: Bot, label: t("settings.agent_runner") },
    { key: "usage", icon: BarChart3, label: t("settings.usage_tracking_section") },
  ];

  // Reset scroll position when switching sections
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0 });
  }, [activeSection]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background-secondary dark:bg-black">
      <header className="px-8 pt-8 pb-4 shrink-0">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <p className="text-[11px] font-bold text-accent uppercase tracking-[0.2em] mb-1">{t('settings.preferences')}</p>
          <h1 className="text-3xl font-extrabold tracking-tight">{t('nav.settings')}</h1>
        </motion.div>
      </header>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-5xl mx-auto flex gap-8 items-start">
          {/* Left Navigation Menu */}
          <nav className="w-52 shrink-0 sticky top-6">
            <ul className="space-y-1">
              {menuItems.map(({ key, icon: Icon, label }) => (
                <li key={key}>
                  <button
                    onClick={() => setActiveSection(key)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all text-left",
                      activeSection === key
                        ? "bg-accent/10 text-accent font-semibold"
                        : "text-muted font-medium hover:text-foreground hover:bg-default",
                    )}
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Right Content Panel */}
          <div className="flex-1 min-w-0 space-y-6">
            {/* User Profile Section */}
            {activeSection === "profile" && (
            <Card className="overflow-hidden rounded-xl">
              <div className="px-6 py-4 border-b border-border flex items-center gap-2 bg-surface-secondary rounded-t-xl rounded-b-xl">
                <SettingsIcon size={16} className="text-accent" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted">{t('settings.user_profile')}</h2>
              </div>
              <div className="p-6 flex flex-col md:flex-row gap-8 items-start">
                <div className="flex flex-col items-center gap-4 shrink-0">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleFileChange}
                  />
                  <Button
                    onPress={() => fileInputRef.current?.click()}
                    variant="ghost"
                    className="group relative flex h-24 min-h-0 w-24 items-center justify-center overflow-hidden rounded-full p-0"
                    aria-label={t("common.avatar")}
                  >
                    <Avatar size="lg" className="h-24 w-24 text-4xl">
                      {user.avatar && (user.avatar.includes('/') || user.avatar.includes('\\') || user.avatar.startsWith('http') || user.avatar.startsWith('file:') || user.avatar.startsWith('data:')) ? (
                        <Avatar.Image src={user.avatar} alt={t("common.avatar")} />
                      ) : null}
                      <Avatar.Fallback>{user.avatar || "👨‍💻"}</Avatar.Fallback>
                    </Avatar>
                    <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      {uploading ? <Spinner size="sm" className="text-white" /> : <Plus size={24} className="text-white" />}
                    </div>
                  </Button>
                  <div className="flex flex-wrap gap-1.5 justify-center max-w-[200px]">
                    {defaultAvatars.map(av => (
                      <Avatar
                        key={av}
                        size="sm"
                        className={cn(
                          "cursor-pointer text-lg transition-all hover:ring-2 hover:ring-accent/30",
                          user.avatar === av ? "ring-2 ring-accent" : ""
                        )}
                        onClick={() => setUser({ avatar: av })}
                      >
                        <Avatar.Fallback>{av}</Avatar.Fallback>
                      </Avatar>
                    ))}
                  </div>
                </div>
                <div className="flex-1 space-y-4 w-full">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted px-1">{t('settings.nickname')}</label>
                    <Input
                      className="w-full dark:border-white/10 dark:bg-default/70"
                      placeholder="Your Nickname"
                      value={user.nickname}
                      onChange={(e) => setUser({ nickname: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted px-1">{t('settings.avatar_url')}</label>
                    <Input
                      className="w-full dark:border-white/10 dark:bg-default/70"
                      placeholder="https://example.com/avatar.png"
                      value={user.avatar && user.avatar.startsWith('http') ? user.avatar : ""}
                      onChange={(e) => setUser({ avatar: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </Card>
            )}

            {/* Assistant Settings Section */}
            {activeSection === "assistant" && (
            <>
            <Card className="overflow-hidden rounded-xl">
              <div className="px-6 py-4 border-b border-border flex items-center gap-2 bg-surface-secondary rounded-t-xl rounded-b-xl">
                <Bot size={16} className="text-accent" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted">{t('settings.assistant_profile')}</h2>
              </div>
              <div className="p-6 flex flex-col md:flex-row gap-8 items-start">
                <div className="flex flex-col items-center gap-4 shrink-0">
                  <input
                    ref={assistantFileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleAssistantFileChange}
                  />
                  <Button
                    onPress={() => assistantFileInputRef.current?.click()}
                    variant="ghost"
                    className="group relative flex h-24 min-h-0 w-24 items-center justify-center overflow-hidden rounded-full p-0"
                    aria-label={t("settings.assistant_avatar")}
                  >
                    <Avatar size="lg" className="h-24 w-24 text-4xl">
                      {assistant.avatar && (assistant.avatar.includes('/') || assistant.avatar.includes('\\') || assistant.avatar.startsWith('http') || assistant.avatar.startsWith('file:') || assistant.avatar.startsWith('data:')) ? (
                        <Avatar.Image src={assistant.avatar} alt={t("settings.assistant_avatar")} />
                      ) : null}
                      <Avatar.Fallback>{assistant.avatar || "🤖"}</Avatar.Fallback>
                    </Avatar>
                    <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      {uploadingAssistant ? <Spinner size="sm" className="text-white" /> : <Plus size={24} className="text-white" />}
                    </div>
                  </Button>
                  <div className="flex flex-wrap gap-1.5 justify-center max-w-[200px]">
                    {defaultAssistantAvatars.map(av => (
                      <Avatar
                        key={av}
                        size="sm"
                        className={cn(
                          "cursor-pointer text-lg transition-all hover:ring-2 hover:ring-accent/30",
                          assistant.avatar === av ? "ring-2 ring-accent" : ""
                        )}
                        onClick={() => setAssistant({ avatar: av })}
                      >
                        <Avatar.Fallback>{av}</Avatar.Fallback>
                      </Avatar>
                    ))}
                  </div>
                </div>
                <div className="flex-1 space-y-4 w-full">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted px-1">{t('settings.assistant_avatar_url')}</label>
                    <Input
                      className="w-full dark:border-white/10 dark:bg-default/70"
                      placeholder="https://example.com/assistant-avatar.png"
                      value={assistant.avatar && assistant.avatar.startsWith('http') ? assistant.avatar : ""}
                      onChange={(e) => setAssistant({ avatar: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6 space-y-4 border border-border bg-surface/50 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                  <FileText size={16} className="text-accent" />
                </div>
                <div>
                  <h2 className="text-sm font-bold">{t("settings.assistant_system_prompt")}</h2>
                  <p className="text-[11px] text-muted">{t("settings.assistant_system_prompt_desc")}</p>
                </div>
              </div>
              <div className="space-y-3">
                <TextArea
                  className="min-h-[200px] w-full resize-y font-mono text-xs border border-border bg-default/80 dark:border-white/10 dark:bg-default/70"
                  placeholder={t("settings.assistant_system_prompt_placeholder")}
                  value={systemPromptDraft}
                  onChange={(e) => {
                    setSystemPromptDraft(e.target.value);
                    setSystemPromptDirty(e.target.value !== assistantSystemPrompt);
                  }}
                />
              </div>
              <div className="flex justify-end">
                <Button
                  onPress={() => void handleSaveSystemPrompt()}
                  variant="primary"
                  size="sm"
                  isDisabled={!systemPromptDirty || assistantSystemPromptSaving}
                  className="rounded-lg"
                >
                  {assistantSystemPromptSaving ? <Spinner size="sm" /> : t("common.save")}
                </Button>
              </div>
            </Card>
            </>
            )}

            {/* Appearance Settings */}
            {activeSection === "appearance" && (
            <Card className="overflow-hidden rounded-xl">
              <div className="px-6 py-4 border-b border-border flex items-center gap-2 bg-surface-secondary rounded-t-xl rounded-b-xl">
                <Languages size={16} className="text-accent" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted">{t('settings.appearance')}</h2>
              </div>
              <div className="p-6 space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted px-1">{t('settings.theme_label')}</label>
                  <div className="flex gap-2">
                    {[
                      { key: "light" as const, icon: Sun, label: t("theme.light") },
                      { key: "dark" as const, icon: Moon, label: t("theme.dark") },
                      { key: "system" as const, icon: Monitor, label: t("theme.auto") },
                    ].map((item) => {
                      const Icon = item.icon;
                      const isActive = theme === item.key;
                      return (
                        <Button
                          key={item.key}
                          variant="ghost"
                          onPress={() => setTheme(item.key)}
                          className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-xl border transition-all",
                            isActive
                              ? "border-accent/20 bg-accent/10 text-accent"
                              : "border-border bg-default text-muted hover:text-foreground hover:border-accent/20",
                          )}
                        >
                          <Icon size={14} />
                          <span className="text-xs font-bold">{item.label}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted px-1">{t('settings.language_label')}</label>
                  <div className="flex gap-2">
                    {[
                      { key: "zh", label: "中文" },
                      { key: "en", label: "English" },
                    ].map((item) => {
                      const activeLang = i18n.language.startsWith("zh") ? "zh" : "en";
                      const isActive = activeLang === item.key;
                      return (
                        <Button
                          key={item.key}
                          variant="ghost"
                          onPress={() => void i18n.changeLanguage(item.key)}
                          className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-xl border transition-all",
                            isActive
                              ? "border-accent/20 bg-accent/10 text-accent"
                              : "border-border bg-default text-muted hover:text-foreground hover:border-accent/20",
                          )}
                        >
                          <span className="text-xs font-bold">{item.label}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Card>
            )}

            {/* Model Providers */}
            {activeSection === "providers" && (
            <Card className="overflow-hidden rounded-xl">
              <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-surface-secondary rounded-t-xl rounded-b-xl">
                <div className="flex items-center gap-2">
                  <Cpu size={16} className="text-accent" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-muted">{t('settings.model_providers')}</h2>
                </div>
                <Button
                  onPress={openCreate}
                  variant="primary"
                  className="flex items-center gap-1.5 px-3 py-1 text-xs shadow-sm"
                >
                  <Plus size={14} />
                  <span>{t('settings.add_provider')}</span>
                </Button>
              </div>

              <div className="divide-y divide-border">
                {error && (
                  <div className="mx-4 mt-4">
                    <Alert color="danger">
                      <Alert.Indicator>
                        <AlertCircle size={16} />
                      </Alert.Indicator>
                      <Alert.Content>
                        <Alert.Description>{error}</Alert.Description>
                      </Alert.Content>
                    </Alert>
                  </div>
                )}

                {loading && (
                  <div className="p-12 text-center text-muted">
                    <Spinner size="sm" className="mx-auto mb-2" />
                    <p className="text-xs font-medium uppercase tracking-widest">{t('settings.loading_providers')}</p>
                  </div>
                )}

                {!loading && providers.length === 0 && (
                  <div className="p-12 text-center text-muted">
                    <SettingsIcon size={32} className="mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-medium">{t('settings.no_providers')}</p>
                  </div>
                )}

                {!loading && providers.length > 0 && (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleProviderDragEnd}
                >
                  <SortableContext items={providers.map((p) => p.id)} strategy={rectSortingStrategy}>
                    <div className="p-2 space-y-1">
                      {providers.map((p) => (
                        <SortableProviderItem
                          key={p.id}
                          provider={p}
                          onEdit={openEdit}
                          onDelete={(id) => void remove(id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
                )}
              </div>
            </Card>
            )}

            {activeSection === "agent_runner" && (
            <AgentRunnerSettingsCard />
            )}

            {/* Usage Tracking */}
            {activeSection === "usage" && (
            <Card className="overflow-hidden">
              <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-surface-secondary">
                <div className="flex items-center gap-2">
                  <BarChart3 size={16} className="text-accent" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-muted">{t('settings.usage_tracking_section')}</h2>
                </div>
                <Button
                  onPress={openCreateTracker}
                  variant="primary"
                  className="flex items-center gap-1.5 px-3 py-1 text-xs shadow-sm"
                >
                  <Plus size={14} />
                  <span>{t('settings.add_tracker')}</span>
                </Button>
              </div>

              <div className="divide-y divide-border">
                {trackerError && (
                  <div className="mx-4 mt-4">
                    <Alert color="danger">
                      <Alert.Indicator>
                        <AlertCircle size={16} />
                      </Alert.Indicator>
                      <Alert.Content>
                        <Alert.Description>{trackerError}</Alert.Description>
                      </Alert.Content>
                    </Alert>
                  </div>
                )}

                {trackerLoading && (
                  <div className="p-12 text-center text-muted">
                    <Spinner size="sm" className="mx-auto mb-2" />
                    <p className="text-xs font-medium uppercase tracking-widest">{t('settings.loading_trackers')}</p>
                  </div>
                )}

                {!trackerLoading && usageTrackers.length === 0 && (
                  <div className="p-12 text-center text-muted">
                    <BarChart3 size={32} className="mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-medium">{t('settings.no_trackers')}</p>
                  </div>
                )}

                {!trackerLoading && usageTrackers.length > 0 && (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleTrackerDragEnd}
                >
                  <SortableContext items={usageTrackers.map((t) => t.id)} strategy={rectSortingStrategy}>
                    <div className="p-2 space-y-1">
                      {usageTrackers.map((tracker) => (
                        <SortableTrackerItem
                          key={tracker.id}
                          tracker={tracker}
                          onEdit={openEditTracker}
                          onDelete={(id) => void removeTracker(id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
                )}
              </div>
            </Card>
            )}

            <footer className="text-center py-8 opacity-30">
              <div className="w-1 bg-default h-6 mb-4 rounded-full mx-auto" />
              <p className="text-[9px] font-bold uppercase tracking-[0.2em]">{t('settings.config_panel')}</p>
            </footer>
          </div>
        </div>
      </div>

      <Modal.Backdrop
        isOpen={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <Modal.Container placement="center" className="w-full max-w-lg">
          <Modal.Dialog>
            <Modal.Header className="flex-row items-center justify-between">
               <h3 className="text-lg font-bold">{editingId ? t('settings.edit_provider') : t('settings.new_provider')}</h3>
               <Tooltip delay={300} closeDelay={0}>
                 <Button isIconOnly variant="ghost" onPress={closeDialog} className="h-8 w-8" aria-label={t("common.close")}>
                    <X size={18} />
                 </Button>
                 <Tooltip.Content className="rounded-lg border border-border bg-overlay px-2.5 py-1.5 text-xs font-semibold text-overlay-foreground shadow-md" placement="top" showArrow>
                   <Tooltip.Arrow className="fill-overlay" />
                   {t("common.close")}
                 </Tooltip.Content>
               </Tooltip>
            </Modal.Header>

            <Modal.Body className="max-h-[70vh] space-y-4 overflow-y-auto px-1 py-1">
               {error && (
                  <div className="rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
                     <div className="flex items-start gap-2">
                        <AlertCircle size={16} className="mt-0.5 shrink-0" />
                        <span>{error}</span>
                     </div>
                  </div>
               )}

               <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted">{t('settings.name')}</label>
                        <Input
                          className="w-full dark:border-white/10 dark:bg-default/70"
                          placeholder="Ollama Local"
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                        />
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted">{t('settings.model_id')}</label>
                        <Input
                          className="w-full dark:border-white/10 dark:bg-default/70"
                          placeholder="qwen2.5"
                          value={form.model}
                          onChange={(e) => setForm({ ...form, model: e.target.value })}
                        />
                     </div>
                  </div>

                  <div className="space-y-1.5">
                     <label className="text-[10px] font-bold uppercase tracking-wider text-muted">{t('settings.endpoint_url')}</label>
                     <Input
                       className="w-full dark:border-white/10 dark:bg-default/70"
                       placeholder="http://localhost:11434"
                       value={form.endpoint}
                       onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
                     />
                  </div>

                  <div className="space-y-1.5">
                     <label className="text-[10px] font-bold uppercase tracking-wider text-muted">{t('settings.api_key')}</label>
                     <Input
                       className="w-full dark:border-white/10 dark:bg-default/70"
                       placeholder="••••••••••••"
                       type="password"
                       value={form.api_key}
                       onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                     />
                  </div>

                  <DefaultProviderToggle
                    checked={!!form.is_default}
                    label={t('settings.set_default')}
                    onChange={(checked) => setForm({ ...form, is_default: checked ? 1 : 0 })}
                  />
               </div>
            </Modal.Body>

            <Modal.Footer>
               {hasChanges && (
                  <Button onPress={handleCancelChanges} variant="secondary" className="px-6">{t('settings.discard')}</Button>
               )}
               <Button
                 onPress={() => void handleSave()}
                 isDisabled={!canSave || saving}
                 variant="primary"
                 className="inline-flex min-w-[120px] items-center justify-center gap-2 px-8"
               >
                 {saving ? <Spinner size="sm" /> : null}
                 {saving ? t('common.loading') : editingId ? t('common.update') : t('common.save')}
               </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      <Modal.Backdrop
        isOpen={trackerDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeTrackerDialog();
        }}
      >
        <Modal.Container placement="center" className="w-full max-w-lg">
          <Modal.Dialog>
            <Modal.Header className="flex-row items-center justify-between">
               <h3 className="text-lg font-bold">{editingTrackerId ? t('settings.edit_tracker') : t('settings.new_tracker')}</h3>
               <Tooltip delay={300} closeDelay={0}>
                 <Button isIconOnly variant="ghost" onPress={closeTrackerDialog} className="h-8 w-8" aria-label={t("common.close")}>
                    <X size={18} />
                 </Button>
                 <Tooltip.Content className="rounded-lg border border-border bg-overlay px-2.5 py-1.5 text-xs font-semibold text-overlay-foreground shadow-md" placement="top" showArrow>
                   <Tooltip.Arrow className="fill-overlay" />
                   {t("common.close")}
                 </Tooltip.Content>
               </Tooltip>
            </Modal.Header>

            <Modal.Body className="max-h-[70vh] space-y-4 overflow-y-auto px-1 py-1">
               {trackerError && (
                  <div className="rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
                     <div className="flex items-start gap-2">
                        <AlertCircle size={16} className="mt-0.5 shrink-0" />
                        <span>{trackerError}</span>
                     </div>
                  </div>
               )}

               <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted">{t('settings.tracker_name')}</label>
                        <Input
                          className="w-full dark:border-white/10 dark:bg-default/70"
                          placeholder="My Codex"
                          value={trackerForm.name}
                          onChange={(e) => setTrackerForm({ ...trackerForm, name: e.target.value })}
                        />
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted">{t('settings.tracker_provider')}</label>
                        <select
                          className="w-full h-9 rounded-lg border border-border bg-default px-3 text-sm dark:border-white/10 dark:bg-default/70 dark:text-foreground"
                          value={trackerForm.provider}
                          onChange={(e) => setTrackerForm({ ...trackerForm, provider: e.target.value })}
                          disabled={!!editingTrackerId}
                        >
                          <option value="minimax">MiniMax</option>
                          <option value="glm">GLM</option>
                          <option value="kimi">Kimi</option>
                          <option value="mimo">MiMo</option>
                          <option value="codex">Codex</option>
                        </select>
                     </div>
                  </div>

                  {trackerForm.provider === "codex" ? (
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted">{t('settings.tracker_curl_command')}</label>
                        <TextArea
                          className="min-h-[120px] w-full resize-y font-mono text-xs border border-border bg-default/80 dark:border-white/10 dark:bg-default/70"
                          placeholder="curl 'https://chatgpt.com/backend-api/wham/usage' -H 'authorization: Bearer ...' ..."
                          value={trackerForm.curl_command}
                          onChange={(e) => setTrackerForm({ ...trackerForm, curl_command: e.target.value })}
                        />
                     </div>
                  ) : (
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted">{t('settings.tracker_auth_token')}</label>
                        <Input
                          className="w-full dark:border-white/10 dark:bg-default/70"
                          placeholder="JWT Token..."
                          type="password"
                          value={trackerForm.auth_token}
                          onChange={(e) => setTrackerForm({ ...trackerForm, auth_token: e.target.value })}
                        />
                     </div>
                  )}

                  <div className="space-y-1.5">
                     <label className="text-[10px] font-bold uppercase tracking-wider text-muted">{t('settings.tracker_cookie')}</label>
                     <TextArea
                       className="min-h-[60px] w-full resize-none border border-border bg-default/80 dark:border-white/10 dark:bg-default/70"
                       placeholder={trackerForm.provider === "codex" ? "Cookie string（从浏览器 DevTools 复制）..." : "Cookie string..."}
                       value={trackerForm.cookie}
                       onChange={(e) => setTrackerForm({ ...trackerForm, cookie: e.target.value })}
                     />
                  </div>

                  <div className="space-y-1.5">
                     <label className="text-[10px] font-bold uppercase tracking-wider text-muted">{t('settings.tracker_url')}</label>
                     <Input
                       className="w-full dark:border-white/10 dark:bg-default/70"
                       placeholder="https://..."
                       value={trackerForm.url}
                       onChange={(e) => setTrackerForm({ ...trackerForm, url: e.target.value })}
                     />
                  </div>

                  <DefaultProviderToggle
                    checked={!!trackerForm.enabled}
                    label={t('settings.tracker_enabled')}
                    onChange={(checked) => setTrackerForm({ ...trackerForm, enabled: checked ? 1 : 0 })}
                  />
               </div>
            </Modal.Body>

            <Modal.Footer>
               <Button
                 onPress={() => void handleSaveTracker()}
                 isDisabled={!trackerForm.name.trim() || trackerSaving}
                 variant="primary"
                 className="inline-flex min-w-[120px] items-center justify-center gap-2 px-8"
               >
                 {trackerSaving ? <Spinner size="sm" /> : null}
                 {trackerSaving ? t('common.loading') : editingTrackerId ? t('common.update') : t('common.save')}
               </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}
