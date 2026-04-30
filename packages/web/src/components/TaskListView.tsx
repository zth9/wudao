import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTaskStore } from "../stores/taskStore";
import { useSettingsStore } from "../stores/settingsStore";
import { formatLocalizedDateInDefaultTimeZone, isBeforeTodayInDefaultTimeZone } from "../utils/time";
import type { Provider, Task, TaskType } from "../services/api";
import {
  Plus,
  Search,
  Trash2,
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  ChevronDown,
  SlidersHorizontal
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { cn } from "../utils/cn";
import {
  TASK_TYPES,
  type FilterTab,
  type SortOption,
} from "./task-panel/constants";
import { LoadingIndicator } from "./LoadingIndicator";
import { shouldSubmitOnEnter } from "../utils/ime";
import { Button } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { Chip } from "@heroui/react/chip";
import { Dropdown } from "@heroui/react/dropdown";
import { Input } from "@heroui/react/input";
import { Modal } from "@heroui/react/modal";
import { SearchField } from "@heroui/react/search-field";
import { Spinner } from "@heroui/react/spinner";
import { TextArea } from "@heroui/react/textarea";
import { Tooltip } from "@heroui/react/tooltip";

function RelativeTime({ dateStr }: { dateStr: string }) {
  const { t } = useTranslation();
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return <>{t('tasks.just_now')}</>;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return <>{t('tasks.minutes_ago', { count: minutes })}</>;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return <>{t('tasks.hours_ago', { count: hours })}</>;
  const days = Math.floor(hours / 24);
  return <>{t('tasks.days_ago', { count: days })}</>;
}

function filterTasks(tasks: Task[], tab: FilterTab, search: string): Task[] {
  let filtered = tasks;
  if (tab === "active") filtered = filtered.filter((t) => t.status !== "done");
  else if (tab === "done") filtered = filtered.filter((t) => t.status === "done");
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q),
    );
  }
  return filtered;
}

interface Props {
  onSelect: (taskId: string, options?: { autoStartChat?: boolean }) => void;
}

export default function TaskListView({ onSelect }: Props) {
  const { t } = useTranslation();
  const { tasks, loading, fetchAll, remove } = useTaskStore();
  const { taskSortBy, setTaskSortBy, taskSortOrder, setTaskSortOrder } = useSettingsStore();
  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [tab, setTab] = useState<FilterTab>("active");
  const [search, setSearch] = useState("");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  useEffect(() => {
    void fetchAll(taskSortBy, taskSortOrder);
  }, [fetchAll, taskSortBy, taskSortOrder]);

  const filtered = useMemo(() => filterTasks(tasks, tab, search), [tasks, tab, search]);

  const tabCounts = useMemo(() => ({
    active: tasks.filter((t) => t.status !== "done").length,
    done: tasks.filter((t) => t.status === "done").length,
    all: tasks.length,
  }), [tasks]);

  const TABS: { key: FilterTab; label: string }[] = [
    { key: "active", label: t('common.active') },
    { key: "done", label: t('common.done') },
    { key: "all", label: t('common.all') },
  ];

  const SORT_OPTS: { key: SortOption; label: string }[] = [
    { key: "created_at", label: t("sort_options.created_at") },
    { key: "updated_at", label: t('sort_options.updated_at') },
    { key: "priority", label: t('sort_options.priority') },
    { key: "due_at", label: t('sort_options.due_at') },
  ];

  const currentSortLabel = SORT_OPTS.find(o => o.key === taskSortBy)?.label || SORT_OPTS[0].label;

  const toggleOrder = () => {
    setTaskSortOrder(taskSortOrder === "asc" ? "desc" : "asc");
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-surface-secondary">
      {/* Header */}
      <header className="h-16 shrink-0 px-8 flex items-center justify-between z-10 bg-overlay/90 border-b border-border">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t('nav.tasks')}</h1>
          <p className="text-[11px] text-muted font-medium uppercase tracking-wider">
            {tabCounts.active} {t('common.active')} • {tabCounts.done} {t('common.done')}
          </p>
        </div>
        <Button
          onPress={() => setShowCreate(true)}
          variant="primary"
          className="flex items-center gap-2"
        >
          <Plus size={18} />
          <span>{t('tasks.new_task')}</span>
        </Button>
      </header>

      {/* Toolbar */}
      <div className="px-8 py-4 flex items-center gap-4 bg-surface-secondary border-b border-border">
        <div className="flex bg-default rounded-full p-1 border border-border">
          {TABS.map((ft) => {
            const isActive = tab === ft.key;
            return (
              <Button
                key={ft.key}
                onPress={() => setTab(ft.key)}
                variant="ghost"
                className={cn(
                  "relative h-auto min-h-0 rounded-full px-5 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors duration-200 group",
                  isActive
                    ? "text-accent"
                    : "text-muted hover:text-foreground"
                )}
              >
                <span className="relative z-10">{ft.label}</span>
                {!isActive && (
                  <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-default transition-colors" />
                )}
                {isActive && (
                  <motion.div
                    layoutId="task-filter-pill"
                    className="absolute inset-0 bg-accent text-accent-foreground shadow-sm rounded-full z-0"
                    transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                  />
                )}
              </Button>
            );
          })}
        </div>

        <div className="flex-1">
          <SearchField
            value={search}
            onChange={setSearch}
            aria-label={t('common.search')}
            className="w-full"
          >
            <SearchField.Group>
              <SearchField.SearchIcon className="text-muted" />
              <SearchField.Input className="py-1.5 text-sm" placeholder={t('common.search')} />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
        </div>

        <div className="relative flex items-center bg-default rounded-lg border border-border p-0.5 shrink-0 min-w-[140px]">
          <Dropdown isOpen={sortMenuOpen} onOpenChange={setSortMenuOpen}>
            <Button
              variant="ghost"
              className="flex h-8 min-h-0 flex-1 items-center justify-between gap-2 rounded-md border-r border-border px-3 py-1 transition-all hover:bg-default"
            >
              <div className="flex items-center gap-2">
                 <SlidersHorizontal size={14} className="text-accent shrink-0" />
                 <span className="text-[11px] font-bold text-foreground uppercase tracking-tight">{currentSortLabel}</span>
              </div>
              <ChevronDown size={12} className="text-muted shrink-0" />
            </Button>
            <Dropdown.Popover className="min-w-[140px]">
              <Dropdown.Menu
                aria-label={currentSortLabel}
                onAction={(key) => {
                  setTaskSortBy(key as SortOption);
                  setSortMenuOpen(false);
                }}
              >
                {SORT_OPTS.map((opt) => (
                  <Dropdown.Item
                    key={opt.key}
                    id={opt.key}
                    textValue={opt.label}
                    className="justify-between"
                  >
                    <span className="font-bold tracking-tight">{opt.label}</span>
                    {taskSortBy === opt.key && (
                      <motion.div layoutId="sort-check" initial={{ scale: 0.5 }} animate={{ scale: 1 }}>
                        ✓
                      </motion.div>
                    )}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>

          <Button
            isIconOnly
            variant="ghost"
            onPress={toggleOrder}
            className="h-8 w-8 shrink-0 text-accent"
            aria-label={taskSortOrder === "asc" ? t("common.sort_ascending") : t("common.sort_descending")}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={taskSortOrder}
                initial={{ opacity: 0, rotate: -90, scale: 0.8 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: 90, scale: 0.8 }}
                transition={{ duration: 0.2 }}
              >
                {taskSortOrder === "asc" ? <ArrowUpNarrowWide size={16} /> : <ArrowDownWideNarrow size={16} />}
              </motion.div>
            </AnimatePresence>
          </Button>
        </div>
      </div>

      {/* Main List */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {loading && tasks.length === 0 ? (
          <div className="flex-1 py-20 flex justify-center">
            <LoadingIndicator text={t("common.loading")} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState search={search} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                deleting={deletingId === task.id}
                onSelect={() => onSelect(task.id)}
                onDeleteClick={() => setDeletingId(task.id)}
                onDeleteCancel={() => setDeletingId(null)}
                onDeleteConfirm={async () => { await remove(task.id); await fetchAll(taskSortBy, taskSortOrder); setDeletingId(null); }}
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateTaskDialog
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            onSelect(id, { autoStartChat: true });
          }}
        />
      )}
    </div>
  );
}

function EmptyState({ search }: { search: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-default flex items-center justify-center mb-4 text-muted shadow-sm">
        {search ? <Search size={32} /> : <CheckCircle2 size={32} />}
      </div>
      <h3 className="text-lg font-semibold">{search ? t('tasks.no_results') : t('tasks.empty_title')}</h3>
      <p className="text-sm text-muted mt-1 max-w-xs">
        {search ? t('tasks.no_results_desc', { query: search }) : t('tasks.empty_desc')}
      </p>
    </div>
  );
}

function TaskCard({
  task, deleting, onSelect, onDeleteClick, onDeleteCancel, onDeleteConfirm,
}: {
  task: Task; deleting: boolean;
  onSelect: () => void; onDeleteClick: () => void;
  onDeleteCancel: () => void; onDeleteConfirm: () => void;
}) {
  const { t, i18n } = useTranslation();
  const isDone = task.status === "done";

  return (
    <Card
      onClick={onSelect}
      className={cn(
        "group relative cursor-pointer overflow-hidden p-5 transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]",
        isDone && "opacity-60 bg-default/50"
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
             <div className={cn("w-2 h-2 rounded-full", task.status === 'done' ? 'bg-success' : 'bg-accent')} />
             <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
               {t(`task_types.${task.type}`)}
             </span>
          </div>
          <h3 className={cn("text-[15px] font-semibold leading-tight line-clamp-2", isDone && "line-through text-muted")}>
            {task.title}
          </h3>
        </div>

        <Tooltip delay={300} closeDelay={0}>
          <Button
            isIconOnly
            variant="ghost"
            onPress={onDeleteClick}
            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-muted hover:text-danger hover:bg-danger/10 transition-all"
            aria-label={t("common.delete")}
          >
            <Trash2 size={14} />
          </Button>
          <Tooltip.Content className="rounded-lg border border-border bg-overlay px-2.5 py-1.5 text-xs font-semibold text-overlay-foreground shadow-md" placement="top" showArrow>
            <Tooltip.Arrow className="fill-overlay" />
            {t("common.delete")}
          </Tooltip.Content>
        </Tooltip>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        <Chip
          size="sm"
          variant="soft"
          color={
            task.priority === 0 ? "danger" :
            task.priority === 1 ? "warning" :
            task.priority === 2 ? "warning" :
            task.priority === 3 ? "accent" :
            "success"
          }
        >
          {t(`priority_labels.${task.priority}`)}
        </Chip>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-border text-[11px] text-muted font-medium">
        <div className="flex items-center gap-1">
          <Clock size={12} />
          <span><RelativeTime dateStr={task.updated_at} /></span>
        </div>
        {task.due_at && (
          <span className={cn(isBeforeTodayInDefaultTimeZone(task.due_at) ? "text-danger" : "text-accent")}>
            {t('tasks.due', { date: formatLocalizedDateInDefaultTimeZone(task.due_at, i18n.language) })}
          </span>
        )}
      </div>

      {deleting && (
        <div
          className="absolute inset-0 z-20 backdrop-blur-xl bg-overlay/90 rounded-xl flex flex-col items-center justify-center p-4 text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <AlertCircle size={32} className="text-danger mb-2" />
          <p className="text-sm font-semibold mb-4">{t('tasks.delete_confirm')}</p>
          <div className="flex gap-2 w-full">
            <Button onPress={onDeleteCancel} variant="secondary" className="flex-1 py-1.5 text-xs">{t('common.cancel')}</Button>
            <Button onPress={onDeleteConfirm} variant="danger" className="flex-1 py-1.5 text-xs">{t('common.delete')}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function CreateTaskDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const isInputComposingRef = useRef(false);
  const [parsedTask, setParsedTask] = useState<ParsedTaskDraft | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const parse = useTaskStore((s) => s.parse);
  const create = useTaskStore((s) => s.create);
  const providers = useSettingsStore((s) => s.providers);
  const defaultProvider = providers.find((p) => p.is_default) || providers[0];
  const [selectedProviderId, setSelectedProviderId] = useState(defaultProvider?.id || "");

  useEffect(() => {
    if (selectedProviderId) return;
    if (!defaultProvider?.id) return;
    setSelectedProviderId(defaultProvider.id);
  }, [defaultProvider?.id, selectedProviderId]);

  const handleParse = useCallback(async () => {
    if (!input.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const parsed = await parse(input.trim(), selectedProviderId || undefined);
      setParsedTask(parsed);
    } catch (err: any) {
      setError(err.message || t("tasks.parse_failed"));
    } finally {
      setSubmitting(false);
    }
  }, [input, parse, selectedProviderId]);

  const handleCreate = useCallback(async () => {
    if (!parsedTask) return;
    setSubmitting(true);
    setError("");
    try {
      const task = await create({ ...parsedTask, provider_id: selectedProviderId || null });
      onCreated(task.id);
    } catch (err: any) {
      setError(err.message || t("tasks.create_failed"));
      setSubmitting(false);
    }
  }, [create, onCreated, parsedTask, selectedProviderId]);

  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open && !submitting) onClose();
      }}
    >
      <Modal.Backdrop isDismissable={!submitting} />
      <Modal.Container className="w-full max-w-lg">
        <Modal.Dialog>
          <Modal.Header>
            <h3 className="text-lg font-bold">{t('tasks.new_task')}</h3>
            <Tooltip delay={300} closeDelay={0}>
              <Button
                isIconOnly
                variant="ghost"
                onPress={onClose}
                className="h-8 w-8 rounded-full text-muted hover:text-foreground"
                aria-label={t("common.close")}
              >
                <X size={18} />
              </Button>
              <Tooltip.Content className="rounded-lg border border-border bg-overlay px-2.5 py-1.5 text-xs font-semibold text-overlay-foreground shadow-md" placement="top" showArrow>
                <Tooltip.Arrow className="fill-overlay" />
                {t("common.close")}
              </Tooltip.Content>
            </Tooltip>
          </Modal.Header>

          <Modal.Body>
            {submitting ? (
              <LoadingAnimation />
            ) : (
              <>
                {!parsedTask ? (
                  <div className="space-y-4">
                    <TextArea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onCompositionStart={() => {
                        isInputComposingRef.current = true;
                      }}
                      onCompositionEnd={() => {
                        isInputComposingRef.current = false;
                      }}
                      placeholder={t('tasks.placeholder_title')}
                      rows={4}
                      className="w-full resize-none text-[15px]"
                      autoFocus
                      onKeyDown={(e) => {
                        if (!shouldSubmitOnEnter(e, isInputComposingRef.current)) return;
                        e.preventDefault();
                        void handleParse();
                      }}
                    />
                    <ProviderSelector
                      providers={providers}
                      selectedProviderId={selectedProviderId}
                      onSelect={setSelectedProviderId}
                    />
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1.5 block">{t('settings.name')}</label>
                      <Input
                        value={parsedTask.title}
                        onChange={(e) => setParsedTask((current) => current ? { ...current, title: e.target.value } : current)}
                        className="w-full"
                        autoFocus
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1.5 block">{t('tasks.type')}</label>
                      <div className="flex flex-wrap gap-2">
                        {TASK_TYPES.map((type) => (
                          <Button
                            key={type}
                            onPress={() => setParsedTask((current) => current ? { ...current, type } : current)}
                            variant="ghost"
                            className={cn(
                              "h-auto min-h-0 rounded-lg border px-3 py-1.5 text-sm transition-all duration-200",
                              parsedTask.type === type
                                ? "bg-accent border-accent text-white shadow-sm"
                                : "border-border bg-transparent text-muted hover:border-default-foreground"
                            )}
                          >
                            {t(`task_types.${type}`)}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <ProviderSelector
                      providers={providers}
                      selectedProviderId={selectedProviderId}
                      onSelect={setSelectedProviderId}
                    />

                    <div className="p-3 rounded-lg bg-default border border-border">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">{t('tasks.intent_summary')}</div>
                      <div className="text-sm text-foreground italic">
                        {parsedTask.context.trim() || "..."}
                      </div>
                    </div>
                  </div>
                )}

                {error && <p className="text-xs text-danger mt-4 flex items-center gap-1"><AlertCircle size={12} /> {error}</p>}

                <Modal.Footer className="mt-8 border-t-0 bg-transparent p-0">
                  {parsedTask ? (
                    <Button onPress={() => setParsedTask(null)} variant="secondary">{t('common.back')}</Button>
                  ) : (
                    <Button onPress={onClose} variant="secondary">{t('common.cancel')}</Button>
                  )}
                  <Button
                    onPress={() => void (parsedTask ? handleCreate() : handleParse())}
                    isDisabled={parsedTask ? !parsedTask.title.trim() : !input.trim()}
                    variant="primary"
                    className="min-w-[120px]"
                  >
                    {parsedTask ? t('tasks.new_task') : t('tasks.analyze')}
                  </Button>
                </Modal.Footer>
              </>
            )}
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal>
  );
}

type ProviderOption = Pick<Provider, "id" | "name" | "model" | "is_default">;

interface ProviderSelectorProps {
  providers: ProviderOption[];
  selectedProviderId: string;
  onSelect: (providerId: string) => void;
}

export function ProviderSelector({ providers, selectedProviderId, onSelect }: ProviderSelectorProps) {
  const { t } = useTranslation();
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1.5 block">{t('tasks.model')}</label>
      <div className="grid grid-cols-2 gap-2">
        {providers.map((p) => {
          const isSelected = selectedProviderId === p.id;

          return (
          <Button
            key={p.id}
            type="button"
            onPress={() => onSelect(p.id)}
            aria-pressed={isSelected}
            variant="ghost"
            className={cn(
              "relative flex h-auto min-h-0 w-full flex-col items-stretch justify-start rounded-lg border p-2.5 text-left transition-all duration-200 group",
              isSelected
                ? "bg-accent/10 border-accent ring-1 ring-accent z-10"
                : "border-border bg-default hover:border-default-foreground"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className={cn(
                "text-xs font-bold transition-colors min-w-0",
                isSelected ? "text-accent" : "text-foreground"
              )}>{p.name}</div>
              {(isSelected || !!p.is_default) && (
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  {isSelected && (
                    <Chip size="sm" color="accent" variant="soft" className="text-[9px] font-bold uppercase tracking-wider">
                      {t("provider_status.selected")}
                    </Chip>
                  )}
                  {!!p.is_default && (
                    <Chip size="sm" color="default" variant="soft" className="text-[9px] font-bold uppercase tracking-wider">
                      {t("provider_status.default")}
                    </Chip>
                  )}
                </div>
              )}
            </div>
            <div className={cn(
              "text-[10px] truncate transition-colors",
              isSelected ? "text-accent/70" : "text-muted"
            )}>{p.model || p.id}</div>
          </Button>
        )})}
      </div>
    </div>
  );
}

function LoadingAnimation() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Spinner size="lg" className="mb-6" color="accent" />
      <p className="text-sm font-medium text-muted animate-pulse">{t('tasks.analyzing')}</p>
    </div>
  );
}

type ParsedTaskDraft = {
  title: string;
  type: TaskType;
  context: string;
};
