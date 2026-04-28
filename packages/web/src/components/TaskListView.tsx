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
  Zap, 
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
  const [showSortMenu, setShowSortMenu] = useState(false);

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
    <div className="flex-1 flex flex-col min-h-0 bg-background-secondary dark:bg-black/40">
      {/* Header */}
      <header className="h-16 shrink-0 px-8 flex items-center justify-between z-10 bg-white/90 dark:bg-system-gray-800/90 border-b border-black/5 dark:border-white/10">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t('nav.tasks')}</h1>
          <p className="text-[11px] text-system-gray-400 dark:text-system-gray-300 font-medium uppercase tracking-wider">
            {tabCounts.active} {t('common.active')} • {tabCounts.done} {t('common.done')}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="apple-btn-primary flex items-center gap-2"
        >
          <Plus size={18} />
          <span>{t('tasks.new_task')}</span>
        </button>
      </header>

      {/* Toolbar */}
      <div className="px-8 py-4 flex items-center gap-4 bg-white/50 dark:bg-white/5 border-b border-black/5 dark:border-white/10">
        <div className="flex bg-black/5 dark:bg-white/5 rounded-full p-1 border border-black/5 dark:border-white/10">
          {TABS.map((ft) => {
            const isActive = tab === ft.key;
            return (
              <button
                key={ft.key}
                onClick={() => setTab(ft.key)}
                className={cn(
                  "px-5 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-full transition-colors duration-200 relative group",
                  isActive
                    ? "text-apple-blue dark:text-white"
                    : "text-system-gray-500 dark:text-system-gray-400 hover:text-system-gray-700 dark:hover:text-system-gray-200"
                )}
              >
                <span className="relative z-10">{ft.label}</span>
                {!isActive && (
                  <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/5 dark:group-hover:bg-white/5 transition-colors" />
                )}
                {isActive && (
                  <motion.div
                    layoutId="task-filter-pill"
                    className="absolute inset-0 bg-white dark:bg-apple-blue shadow-apple-sm rounded-full z-0"
                    transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-system-gray-400 dark:text-system-gray-300" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common.search')}
            className="w-full pl-9 pr-4 py-1.5 bg-system-gray-100 dark:bg-system-gray-800/50 border-none rounded-apple-lg text-sm focus:ring-2 focus:ring-apple-blue/20 transition-all outline-none"
          />
        </div>

        <div className="relative flex items-center bg-black/5 dark:bg-white/5 rounded-apple-lg border border-black/5 dark:border-white/10 p-0.5 shrink-0 min-w-[140px]">
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="flex-1 flex items-center justify-between gap-2 px-3 py-1 rounded-apple hover:bg-black/5 dark:hover:bg-white/5 transition-all border-r border-black/5 dark:border-white/10"
          >
            <div className="flex items-center gap-2">
               <SlidersHorizontal size={14} className="text-apple-blue shrink-0" />
               <span className="text-[11px] font-bold text-system-gray-600 dark:text-system-gray-300 uppercase tracking-tight">{currentSortLabel}</span>
            </div>
            <ChevronDown size={12} className="text-system-gray-400 dark:text-system-gray-300 shrink-0" />
          </button>
          
          <button
            onClick={toggleOrder}
            className="px-2.5 py-1 rounded-apple hover:bg-black/5 dark:hover:bg-white/5 transition-all text-apple-blue flex items-center justify-center shrink-0"
            title={taskSortOrder === "asc" ? t("common.sort_ascending") : t("common.sort_descending")}
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
          </button>

          <AnimatePresence>
            {showSortMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowSortMenu(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 5, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 5, scale: 0.95 }}
                  className="absolute left-0 right-0 top-full mt-1 apple-dropdown min-w-full z-50"
                >
                  <div className="flex flex-col gap-0.5">
                    {SORT_OPTS.map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => {
                          setTaskSortBy(opt.key);
                          setShowSortMenu(false);
                        }}
                        className={cn(
                          "apple-dropdown-item flex items-center justify-between",
                          taskSortBy === opt.key
                            ? "apple-dropdown-item-active"
                            : "text-system-gray-600 dark:text-system-gray-300"
                        )}
                      >
                        <span className="font-bold tracking-tight">{opt.label}</span>
                        {taskSortBy === opt.key && (
                          <motion.div layoutId="sort-check" initial={{ scale: 0.5 }} animate={{ scale: 1 }}>
                            ✓
                          </motion.div>
                        )}
                      </button>
                    ))}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
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
      <div className="w-16 h-16 rounded-2xl bg-system-gray-100 dark:bg-system-gray-800 flex items-center justify-center mb-4 text-system-gray-400 dark:text-system-gray-300 shadow-apple-card">
        {search ? <Search size={32} /> : <CheckCircle2 size={32} />}
      </div>
      <h3 className="text-lg font-semibold">{search ? t('tasks.no_results') : t('tasks.empty_title')}</h3>
      <p className="text-sm text-system-gray-400 dark:text-system-gray-300 mt-1 max-w-xs">
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
    <div
      onClick={onSelect}
      className={cn(
        "apple-card p-5 cursor-pointer group hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 relative overflow-hidden",
        isDone && "opacity-60 bg-system-gray-50/50 dark:bg-system-gray-900/50"
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
             <div className={cn("w-2 h-2 rounded-full", task.status === 'done' ? 'bg-apple-green' : 'bg-apple-blue')} />
             <span className="text-[10px] font-bold uppercase tracking-wider text-system-gray-400 dark:text-system-gray-300">
               {t(`task_types.${task.type}`)}
             </span>
          </div>
          <h3 className={cn("text-[15px] font-semibold leading-tight line-clamp-2", isDone && "line-through text-system-gray-500 dark:text-system-gray-400")}>
            {task.title}
          </h3>
        </div>
        
        <button
          onClick={(e) => { e.stopPropagation(); onDeleteClick(); }}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-apple text-system-gray-400 dark:text-system-gray-300 hover:text-apple-red hover:bg-apple-red/10 transition-all"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        <span className={cn(
          "px-2 py-0.5 text-[10px] font-bold rounded-apple uppercase tracking-wide",
          task.priority === 0 ? "bg-apple-red/10 text-apple-red" :
          task.priority === 1 ? "bg-apple-orange/10 text-apple-orange" :
          task.priority === 2 ? "bg-apple-yellow/20 text-orange-600 dark:text-apple-yellow" :
          task.priority === 3 ? "bg-apple-blue/10 text-apple-blue" :
          "bg-apple-green/10 text-apple-green"
        )}>
          {t(`priority_labels.${task.priority}`)}
        </span>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-black/5 dark:border-white/10 text-[11px] text-system-gray-400 dark:text-system-gray-300 font-medium">
        <div className="flex items-center gap-1">
          <Clock size={12} />
          <span><RelativeTime dateStr={task.updated_at} /></span>
        </div>
        {task.due_at && (
          <span className={cn(isBeforeTodayInDefaultTimeZone(task.due_at) ? "text-apple-red" : "text-apple-blue")}>
            {t('tasks.due', { date: formatLocalizedDateInDefaultTimeZone(task.due_at, i18n.language) })}
          </span>
        )}
      </div>

      {deleting && (
        <div
          className="absolute inset-0 z-20 apple-glass rounded-apple-xl flex flex-col items-center justify-center p-4 text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <AlertCircle size={32} className="text-apple-red mb-2" />
          <p className="text-sm font-semibold mb-4">{t('tasks.delete_confirm')}</p>
          <div className="flex gap-2 w-full">
            <button onClick={onDeleteCancel} className="flex-1 apple-btn-secondary py-1.5 text-xs">{t('common.cancel')}</button>
            <button onClick={onDeleteConfirm} className="flex-1 apple-btn bg-apple-red text-white py-1.5 text-xs">{t('common.delete')}</button>
          </div>
        </div>
      )}
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm" onClick={submitting ? undefined : onClose}>
      <div
        className="bg-white dark:bg-background-dark-secondary rounded-apple-2xl shadow-apple-lg w-full max-w-lg overflow-hidden border border-black/5 dark:border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 apple-glass border-b flex items-center justify-between">
          <h3 className="text-lg font-bold">{t('tasks.new_task')}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-system-gray-400 hover:text-system-gray-600 dark:hover:text-system-gray-200">
            <X size={18} />
          </button>
        </div>

        <div className="p-6">
          {submitting ? (
            <LoadingAnimation />
          ) : (
            <>
              {!parsedTask ? (
                <div className="space-y-4">
                  <textarea
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
                    className="apple-input w-full resize-none text-[15px]"
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
                    <label className="text-[10px] font-bold uppercase tracking-wider text-system-gray-400 dark:text-system-gray-300 mb-1.5 block">{t('settings.name')}</label>
                    <input
                      value={parsedTask.title}
                      onChange={(e) => setParsedTask((current) => current ? { ...current, title: e.target.value } : current)}
                      className="apple-input w-full font-medium"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-system-gray-400 dark:text-system-gray-300 mb-1.5 block">{t('tasks.type')}</label>
                    <div className="flex flex-wrap gap-2">
                      {TASK_TYPES.map((type) => (
                        <button
                          key={type}
                          onClick={() => setParsedTask((current) => current ? { ...current, type } : current)}
                          className={cn(
                            "px-3 py-1.5 text-sm rounded-apple-lg border transition-all duration-200",
                            parsedTask.type === type
                              ? "bg-apple-blue border-apple-blue text-white shadow-apple-sm"
                              : "border-system-gray-200 dark:border-system-gray-700 bg-transparent text-system-gray-500 dark:text-system-gray-400 hover:border-system-gray-400"
                          )}
                        >
                          {t(`task_types.${type}`)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <ProviderSelector
                    providers={providers}
                    selectedProviderId={selectedProviderId}
                    onSelect={setSelectedProviderId}
                  />

                  <div className="p-3 rounded-apple-lg bg-system-gray-50 dark:bg-black/40 border border-black/5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-system-gray-400 dark:text-system-gray-300 mb-1">{t('tasks.intent_summary')}</div>
                    <div className="text-sm text-system-gray-600 dark:text-system-gray-300 italic">
                      {parsedTask.context.trim() || "..."}
                    </div>
                  </div>
                </div>
              )}

              {error && <p className="text-xs text-apple-red mt-4 flex items-center gap-1"><AlertCircle size={12} /> {error}</p>}

              <div className="flex gap-3 justify-end mt-8">
                {parsedTask ? (
                  <button onClick={() => setParsedTask(null)} className="apple-btn-secondary">{t('common.back')}</button>
                ) : (
                  <button onClick={onClose} className="apple-btn-secondary">{t('common.cancel')}</button>
                )}
                <button
                  onClick={() => void (parsedTask ? handleCreate() : handleParse())}
                  disabled={parsedTask ? !parsedTask.title.trim() : !input.trim()}
                  className="apple-btn-primary min-w-[120px]"
                >
                  {parsedTask ? t('tasks.new_task') : t('tasks.analyze')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
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
      <label className="text-[10px] font-bold uppercase tracking-wider text-system-gray-400 dark:text-system-gray-300 mb-1.5 block">{t('tasks.model')}</label>
      <div className="grid grid-cols-2 gap-2">
        {providers.map((p) => {
          const isSelected = selectedProviderId === p.id;

          return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            aria-pressed={isSelected}
            className={cn(
              "p-2.5 text-left rounded-apple-lg border transition-all duration-200 group relative",
              isSelected
                ? "bg-apple-blue/10 border-apple-blue ring-1 ring-apple-blue dark:ring-apple-blue/50 z-10"
                : "border-system-gray-200 dark:border-white/15 bg-white/50 dark:bg-white/5 hover:border-system-gray-400 dark:hover:border-white/30"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className={cn(
                "text-xs font-bold transition-colors min-w-0",
                isSelected ? "text-apple-blue dark:text-apple-blue" : "text-foreground dark:text-foreground-dark"
              )}>{p.name}</div>
              {(isSelected || !!p.is_default) && (
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  {isSelected && (
                    <span className="rounded-full border border-apple-blue/20 bg-apple-blue/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-apple-blue dark:border-apple-blue/30 dark:bg-apple-blue/15 dark:text-apple-blue">
                      {t("provider_status.selected")}
                    </span>
                  )}
                  {!!p.is_default && (
                    <span className="rounded-full border border-black/5 bg-black/5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-system-gray-500 dark:border-white/10 dark:bg-white/10 dark:text-system-gray-200">
                      {t("provider_status.default")}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className={cn(
              "text-[10px] truncate transition-colors",
              isSelected ? "text-apple-blue/70 dark:text-apple-blue/80" : "text-system-gray-400 dark:text-system-gray-300"
            )}>{p.model || p.id}</div>
          </button>
        )})}
      </div>
    </div>
  );
}

function LoadingAnimation() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="relative w-16 h-16 mb-6">
        <div className="absolute inset-0 rounded-full border-4 border-apple-blue/10 border-t-apple-blue animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
           <Zap size={24} className="text-apple-blue animate-pulse" />
        </div>
      </div>
      <p className="text-sm font-medium text-system-gray-500 dark:text-system-gray-400 animate-pulse">{t('tasks.analyzing')}</p>
    </div>
  );
}

type ParsedTaskDraft = {
  title: string;
  type: TaskType;
  context: string;
};
