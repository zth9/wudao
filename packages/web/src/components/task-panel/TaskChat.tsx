import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Send,
  Loader2,
  FileCode,
  Sparkles,
  Bot,
  User,
  StopCircle,
  ChevronDown,
  FolderTree,
  FileText,
  Search,
  TerminalSquare,
  Wrench,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSettingsStore } from "../../stores/settingsStore";
import MarkdownContent from "../MarkdownContent";
import { cn } from "../../utils/cn";
import { shouldSubmitOnEnter } from "../../utils/ime";
import {
  isTaskChatScrolledNearBottom,
  shouldShowTaskChatScrollButton,
} from "../../utils/task-chat";
import { type AgentTimelineItem } from "../../stores/taskStore";

const SCROLL_TO_BOTTOM_SHATTER_DURATION_MS = 1100;
const SCROLL_TO_BOTTOM_SHARDS = [
  {
    id: "north-west",
    className: "left-[8px] top-[7px] h-3.5 w-3.5",
    style: { clipPath: "polygon(16% 0%, 100% 0%, 68% 82%, 0% 68%)" },
    animate: { x: -50, y: -45, rotate: -120, scale: 0, opacity: 0 },
    transition: { duration: 0.8, delay: 0.02 },
  },
  {
    id: "north",
    className: "left-[18px] top-[3px] h-3 w-4",
    style: { clipPath: "polygon(10% 10%, 90% 0%, 100% 60%, 26% 100%, 0% 54%)" },
    animate: { x: 5, y: -60, rotate: -60, scale: 0, opacity: 0 },
    transition: { duration: 0.75, delay: 0.04 },
  },
  {
    id: "north-east",
    className: "right-[8px] top-[8px] h-3.5 w-3.5",
    style: { clipPath: "polygon(0% 0%, 86% 14%, 100% 74%, 26% 100%)" },
    animate: { x: 50, y: -40, rotate: 110, scale: 0, opacity: 0 },
    transition: { duration: 0.82, delay: 0.03 },
  },
  {
    id: "mid-left",
    className: "left-[4px] top-[16px] h-3.5 w-4.5",
    style: { clipPath: "polygon(8% 8%, 100% 0%, 82% 100%, 0% 80%)" },
    animate: { x: -60, y: -10, rotate: -160, scale: 0, opacity: 0 },
    transition: { duration: 0.78, delay: 0.06 },
  },
  {
    id: "mid-right",
    className: "right-[4px] top-[16px] h-3.5 w-4.5",
    style: { clipPath: "polygon(0% 0%, 92% 10%, 100% 86%, 18% 100%)" },
    animate: { x: 65, y: -5, rotate: 140, scale: 0, opacity: 0 },
    transition: { duration: 0.8, delay: 0.08 },
  },
  {
    id: "south-west",
    className: "left-[8px] bottom-[8px] h-4 w-4",
    style: { clipPath: "polygon(18% 0%, 100% 28%, 76% 100%, 0% 84%)" },
    animate: { x: -45, y: 50, rotate: -130, scale: 0, opacity: 0 },
    transition: { duration: 0.85, delay: 0.05 },
  },
  {
    id: "south",
    className: "left-[17px] bottom-[5px] h-4 w-4",
    style: { clipPath: "polygon(6% 0%, 96% 8%, 84% 100%, 18% 90%, 0% 42%)" },
    animate: { x: -5, y: 65, rotate: 50, scale: 0, opacity: 0 },
    transition: { duration: 0.75, delay: 0.07 },
  },
  {
    id: "south-east",
    className: "right-[8px] bottom-[8px] h-4 w-4",
    style: { clipPath: "polygon(0% 12%, 82% 0%, 100% 78%, 30% 100%)" },
    animate: { x: 50, y: 45, rotate: 120, scale: 0, opacity: 0 },
    transition: { duration: 0.88, delay: 0.06 },
  },
  {
    id: "tail-left",
    className: "left-[12px] bottom-[13px] h-2.5 w-3",
    style: { clipPath: "polygon(16% 0%, 100% 18%, 72% 100%, 0% 84%)" },
    animate: { x: -25, y: 65, rotate: -200, scale: 0, opacity: 0 },
    transition: { duration: 0.72, delay: 0.1 },
  },
  {
    id: "tail-right",
    className: "right-[12px] bottom-[13px] h-2.5 w-3",
    style: { clipPath: "polygon(0% 18%, 84% 0%, 100% 78%, 24% 100%)" },
    animate: { x: 35, y: 70, rotate: 180, scale: 0, opacity: 0 },
    transition: { duration: 0.75, delay: 0.11 },
  },
] satisfies Array<{
  id: string;
  className: string;
  style: CSSProperties;
  animate: {
    x: number;
    y: number;
    rotate: number;
    scale: number;
    opacity: number;
  };
  transition: {
    duration: number;
    delay: number;
  };
}>;

interface TaskChatScrollToBottomButtonProps {
  visible: boolean;
  shattering: boolean;
  shatterCycle: number;
  title: string;
  onClick: () => void;
  style?: CSSProperties;
}

export function TaskChatScrollToBottomButton({
  visible,
  shattering,
  shatterCycle,
  title,
  onClick,
  style,
}: TaskChatScrollToBottomButtonProps) {
  return (
    <AnimatePresence>
      {visible && (
        <div
          className="absolute right-3 z-10 h-9 w-9 overflow-visible"
          style={{ bottom: '12px', ...style }}
          data-shattering={shattering ? "true" : "false"}
          data-shatter-duration={SCROLL_TO_BOTTOM_SHATTER_DURATION_MS}
          data-shatter-cycle={shatterCycle}
        >
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={
              shattering
                ? { opacity: 0, y: 0, scale: 0.2, rotate: -30 }
                : { opacity: 1, y: 0, scale: 1, rotate: 0 }
            }
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: shattering ? 1.02 : 0.16, ease: [0.22, 1, 0.36, 1] }}
            onClick={onClick}
            title={title}
            className={cn(
              "relative h-9 w-9 rounded-full flex items-center justify-center overflow-visible shadow-apple-md",
              shattering
                ? "pointer-events-none bg-transparent"
                : "bg-apple-blue text-white hover:bg-apple-blue/90"
            )}
          >
            <motion.span
              aria-hidden="true"
              className="relative z-[1] flex items-center justify-center"
              animate={shattering ? { opacity: 0, scale: 0.3, rotate: -24 } : { opacity: 1, scale: 1, rotate: 0 }}
              transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            >
              <ChevronDown size={16} />
            </motion.span>
          </motion.button>

          <AnimatePresence mode="popLayout">
            {shattering && (
              <motion.div
                key={`scroll-bottom-shatter-${shatterCycle}`}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 overflow-visible"
              >
                {SCROLL_TO_BOTTOM_SHARDS.map((piece) => (
                  <motion.span
                    key={`${shatterCycle}-${piece.id}`}
                    data-scroll-shard={piece.id}
                    initial={{ x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 }}
                    animate={piece.animate}
                    exit={{ opacity: 0 }}
                    transition={{
                      ...piece.transition,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className={cn(
                      "absolute z-[2] rounded-[5px] bg-apple-blue shadow-[0_0_0_1px_rgba(255,255,255,0.18)]",
                      piece.className
                    )}
                    style={piece.style}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </AnimatePresence>
  );
}

interface Props {
  taskId: string;
  taskProviderId: string | null;
  items: AgentTimelineItem[];
  streaming: boolean;
  agentDoc: string | null;
  generatingDocs: boolean;
  onGenerateDocs: () => void;
  onSend: (message: string, providerId?: string) => void;
  onProviderChange: (providerId: string) => void;
  onAbort: () => void;
}

type ToolExchangeRenderItem = {
  kind: "tool_exchange";
  id: string;
  toolName: string;
  input: unknown;
  output: unknown;
  status: "streaming" | "completed" | "failed" | "waiting_approval";
};

type TaskChatRenderItem = AgentTimelineItem | ToolExchangeRenderItem;

export const TASK_CHAT_PROVIDER_TRIGGER_CLASS =
  "flex items-center gap-1.5 h-8 px-2 rounded-apple-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-all border border-transparent";

export const TASK_CHAT_PROVIDER_MENU_CLASS =
  "absolute z-[60] w-48 apple-dropdown";

export const TASK_CHAT_PROVIDER_BACKDROP_CLASS = "fixed inset-0 z-40";

const TASK_CHAT_INPUT_PANEL_MARGIN_PX = 12;
const TASK_CHAT_INPUT_PANEL_BOTTOM_PADDING_PX = 116 + TASK_CHAT_INPUT_PANEL_MARGIN_PX;
const TASK_CHAT_SCROLL_BUTTON_BOTTOM_PX = 120 + TASK_CHAT_INPUT_PANEL_MARGIN_PX;
const TASK_CHAT_BOTTOM_FADE_HEIGHT_PX = 76;
const TASK_CHAT_BOTTOM_FADE_LEFT_EDGE_FEATHER_PX = 10;
const TASK_CHAT_BOTTOM_FADE_RIGHT_EDGE_FEATHER_PX = 18;
const TASK_CHAT_BOTTOM_FADE_LEFT_INSET_PX = 0;
const TASK_CHAT_BOTTOM_FADE_RIGHT_INSET_PX = 6;
const TASK_CHAT_BOTTOM_FADE_EDGE_MASK = `linear-gradient(to right, transparent 0, black ${TASK_CHAT_BOTTOM_FADE_LEFT_EDGE_FEATHER_PX}px, black calc(100% - ${TASK_CHAT_BOTTOM_FADE_RIGHT_EDGE_FEATHER_PX}px), transparent 100%)`;

const TASK_CHAT_PROVIDER_MENU_MOTION = {
  initial: { opacity: 0, y: 4, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 3, scale: 0.99 },
  transition: { duration: 0.12, ease: "easeOut" as const },
};

export function resolveTaskChatBottomFadeVisibilityClass(autoScrollEnabled: boolean) {
  return autoScrollEnabled
    ? "opacity-0 transition-opacity duration-200"
    : "opacity-100 transition-none";
}

function TaskChatReplyingIndicator() {
  return (
    <div data-replying-indicator="true" className="flex gap-3">
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-apple-sm border border-black/5 dark:border-white/10 mt-1 overflow-hidden bg-white dark:bg-system-gray-800 text-apple-blue">
        <Bot size={14} />
      </div>
      <div className="max-w-[85%] rounded-apple-xl border border-black/5 bg-white/80 backdrop-blur-md px-4 py-3 text-black shadow-apple-md dark:border-white/10 dark:bg-[#2E2E2E]/80 dark:text-white">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-apple-blue animate-pulse [animation-delay:0ms]" />
          <span className="h-2 w-2 rounded-full bg-apple-blue animate-pulse [animation-delay:150ms]" />
          <span className="h-2 w-2 rounded-full bg-apple-blue animate-pulse [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

function formatStructuredValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function resolveToolIcon(toolName: string) {
  if (toolName === "workspace_list") return FolderTree;
  if (toolName === "workspace_read_file") return FileText;
  if (toolName === "workspace_search_text") return Search;
  if (toolName === "workspace_write_file") return FileText;
  if (toolName === "workspace_apply_patch") return FileCode;
  if (toolName === "terminal_snapshot") return TerminalSquare;
  return Wrench;
}

function buildRenderItems(items: AgentTimelineItem[]): TaskChatRenderItem[] {
  const renderItems: TaskChatRenderItem[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const current = items[index];
    const next = items[index + 1];

    if (
      current.kind === "tool_call" &&
      next?.kind === "tool_result" &&
      current.toolName === next.toolName
    ) {
      renderItems.push({
        kind: "tool_exchange",
        id: `${current.id}__${next.id}`,
        toolName: current.toolName,
        input: current.input,
        output: next.output,
        status: next.status,
      });
      index += 1;
      continue;
    }

    renderItems.push(current);
  }

  return renderItems;
}

export function TaskChat({
  taskId,
  taskProviderId,
  items,
  streaming,
  agentDoc,
  generatingDocs,
  onGenerateDocs,
  onSend,
  onProviderChange,
  onAbort,
}: Props) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [showProviderMenu, setShowProviderMenu] = useState(false);
  const [providerMenuPosition, setProviderMenuPosition] = useState<{ right: number; bottom: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const ghostRef = useRef<HTMLTextAreaElement>(null);
  const inputShellRef = useRef<HTMLDivElement>(null);
  const providerTriggerRef = useRef<HTMLButtonElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const isInputComposingRef = useRef(false);
  const scrollButtonResetTimerRef = useRef<number | null>(null);
  const [textareaHeight, setTextareaHeight] = useState(38);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [scrollButtonShattering, setScrollButtonShattering] = useState(false);
  const [scrollButtonShatterCycle, setScrollButtonShatterCycle] = useState(0);
  const providers = useSettingsStore(state => state.providers);
  const user = useSettingsStore(state => state.user);
  const currentProvider = providers.find((p) => p.id === taskProviderId) || providers.find((p) => p.is_default) || providers[0];
  const showScrollToBottom = shouldShowTaskChatScrollButton(autoScrollEnabled, items.length);
  const renderScrollToBottomButton = showScrollToBottom || scrollButtonShattering;
  const renderItems = buildRenderItems(items);
  const lastRenderItem = renderItems[renderItems.length - 1];
  const hasStreamingAssistant = renderItems.some(
    (item) => item.kind === "assistant_text" && item.status === "streaming"
  );
  const showReplyingIndicator = streaming && !hasStreamingAssistant && lastRenderItem?.kind !== "error";

  const setAutoScrollMode = (enabled: boolean) => {
    shouldStickToBottomRef.current = enabled;
    setAutoScrollEnabled(enabled);
  };

  const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  };

  useEffect(() => {
    if (scrollButtonResetTimerRef.current !== null) {
      window.clearTimeout(scrollButtonResetTimerRef.current);
      scrollButtonResetTimerRef.current = null;
    }
    setScrollButtonShattering(false);
    setScrollButtonShatterCycle(0);
    setAutoScrollMode(true);
  }, [taskId]);

  useEffect(() => {
    return () => {
      if (scrollButtonResetTimerRef.current !== null) {
        window.clearTimeout(scrollButtonResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !shouldStickToBottomRef.current) return;
    scrollToBottom();
  }, [items, showReplyingIndicator, taskId]);

  // Use a ghost textarea to measure height without breaking CSS transitions
  useEffect(() => {
    if (!ghostRef.current) return;
    
    // Reset height to 0px to accurately measure the new content's scrollHeight
    ghostRef.current.style.height = '0px';
    const scrollHeight = ghostRef.current.scrollHeight;
    
    // Base 38px (1 line: 14px padding + 24px line-height)
    // Max 10 lines: 14px padding + 240px = 254px
    const newHeight = Math.min(Math.max(scrollHeight, 38), 254); 
    setTextareaHeight(newHeight);
  }, [input]);

  const handleSend = () => {
    if (!input.trim() || streaming || generatingDocs) return;
    setAutoScrollMode(true);
    onSend(input.trim(), currentProvider?.id);
    setInput("");
  };

  const syncProviderMenuPosition = (trigger: HTMLButtonElement | null = providerTriggerRef.current) => {
    const shell = inputShellRef.current;
    if (!trigger || !shell || typeof window === "undefined") return;
    const triggerRect = trigger.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    setProviderMenuPosition({
      right: Math.max(shellRect.right - triggerRect.right, 0),
      bottom: Math.max(shellRect.bottom - triggerRect.top + 4, 0),
    });
  };

  const closeProviderMenu = () => {
    setShowProviderMenu(false);
    setProviderMenuPosition(null);
  };

  const toggleProviderMenu = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (showProviderMenu) {
      closeProviderMenu();
      return;
    }
    syncProviderMenuPosition(event.currentTarget);
    setShowProviderMenu(true);
  };

  useEffect(() => {
    if (!showProviderMenu || typeof window === "undefined") return;
    syncProviderMenuPosition();
    const handleViewportChange = () => syncProviderMenuPosition();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [showProviderMenu, textareaHeight]);

  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    const nearBottom = isTaskChatScrolledNearBottom(container);
    if (nearBottom !== shouldStickToBottomRef.current) {
      setAutoScrollMode(nearBottom);
    }
  };

  const handleResumeAutoScroll = () => {
    if (scrollButtonShattering) return;
    setScrollButtonShatterCycle((value) => value + 1);
    setScrollButtonShattering(true);
    setAutoScrollMode(true);
    scrollToBottom("smooth");
    if (scrollButtonResetTimerRef.current !== null) {
      window.clearTimeout(scrollButtonResetTimerRef.current);
    }
    scrollButtonResetTimerRef.current = window.setTimeout(() => {
      setScrollButtonShattering(false);
      scrollButtonResetTimerRef.current = null;
    }, SCROLL_TO_BOTTOM_SHATTER_DURATION_MS);
  };

  return (
    <div className="relative flex-1 h-full min-h-0 overflow-hidden bg-[#EDEDED] dark:bg-[#191919]">
      {/* Sub-header: Absolute Top */}
      <div
        data-task-chat-header="true"
        className="absolute top-0 left-0 right-0 z-20"
      >
        <div
          data-task-chat-header-panel="true"
          className="flex items-center justify-between border-b border-black/5 bg-white/90 backdrop-blur-apple dark:border-white/10 dark:bg-[#1c1c1e]/85 px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-apple-md border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 flex items-center justify-center text-apple-blue">
              <Bot size={14} />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-system-gray-500 dark:text-system-gray-400">{t('tasks.agent_chat')}</span>
          </div>
        </div>
      </div>

      {/* Messages: Scrollable */}
      <div className="absolute inset-0 z-0 bg-transparent">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto px-4 space-y-6 scrollbar-thin scrollbar-thumb-black/5 dark:scrollbar-thumb-white/5 pt-[60px]"
          style={{ paddingBottom: `calc(${textareaHeight}px + ${TASK_CHAT_INPUT_PANEL_BOTTOM_PADDING_PX}px)` }}
        >
          {items.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-40">
               <div className="w-12 h-12 rounded-2xl bg-black/5 dark:bg-white/5 flex items-center justify-center mb-4">
                  <Sparkles size={24} className="text-apple-blue" />
               </div>
               <p className="text-xs font-medium leading-relaxed max-w-[200px]">
                 {t('tasks.placeholder_input')}
               </p>
            </div>
          )}

          {renderItems.map((item) => {
            const isUser = item.kind === "user_text";
            const ToolIcon = "toolName" in item ? resolveToolIcon(item.toolName) : null;
            const isCollapsibleToolItem =
              item.kind === "tool_call" ||
              item.kind === "tool_result" ||
              item.kind === "approval" ||
              item.kind === "tool_exchange";

            const cardHeader = (
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em]">
                {item.kind === "error" ? (
                  <AlertCircle size={14} className="text-red-500" />
                ) : ToolIcon ? (
                  <ToolIcon size={14} className="text-apple-blue" />
                ) : (
                  <Wrench size={14} className="text-apple-blue" />
                )}
                <span>
                  {item.kind === "tool_exchange" && t("tasks.tool_message_label")}
                  {item.kind === "tool_call" && t("tasks.tool_call_label")}
                  {item.kind === "tool_result" && t("tasks.tool_result_label")}
                  {item.kind === "approval" && t("tasks.approval_label")}
                  {item.kind === "artifact" && t("tasks.artifact_updated_label")}
                  {item.kind === "error" && t("tasks.error_label")}
                </span>
                {"toolName" in item && (
                  <span className="text-system-gray-400 normal-case tracking-normal">{item.toolName}</span>
                )}
              </div>
            );

            const cardBody = (
              <div className="px-4 py-3 space-y-3">
                {item.kind === "tool_exchange" && (
                  <>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-system-gray-400 mb-2">{t("tasks.tool_input_label")}</div>
                      <pre className="text-[12px] leading-relaxed whitespace-pre-wrap break-all font-mono">{formatStructuredValue(item.input)}</pre>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-system-gray-400 mb-2">{t("tasks.tool_output_label")}</div>
                      <pre className="text-[12px] leading-relaxed whitespace-pre-wrap break-all font-mono">{formatStructuredValue(item.output)}</pre>
                    </div>
                  </>
                )}
                {item.kind === "tool_call" && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-system-gray-400 mb-2">{t("tasks.tool_input_label")}</div>
                    <pre className="text-[12px] leading-relaxed whitespace-pre-wrap break-all font-mono">{formatStructuredValue(item.input)}</pre>
                  </div>
                )}
                {item.kind === "tool_result" && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-system-gray-400 mb-2">{t("tasks.tool_output_label")}</div>
                    <pre className="text-[12px] leading-relaxed whitespace-pre-wrap break-all font-mono">{formatStructuredValue(item.output)}</pre>
                  </div>
                )}
                {item.kind === "approval" && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-system-gray-400 mb-2">{t("tasks.tool_input_label")}</div>
                    <pre className="text-[12px] leading-relaxed whitespace-pre-wrap break-all font-mono">{formatStructuredValue(item.input)}</pre>
                  </div>
                )}
                {item.kind === "artifact" && (
                  <div className="text-[13px] leading-relaxed">
                    <div className="font-semibold">{item.path}</div>
                    <div className="mt-1 text-system-gray-500 dark:text-system-gray-300">{item.summary}</div>
                  </div>
                )}
                {item.kind === "error" && (
                  <div className="text-[13px] leading-relaxed">{item.content}</div>
                )}
              </div>
            );

            return (
              <div
                key={item.id}
                className={cn(
                  "flex gap-3",
                  isUser ? "flex-row-reverse" : "flex-row"
                )}
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-apple-sm border border-black/5 dark:border-white/10 mt-1 overflow-hidden bg-white dark:bg-system-gray-800 text-apple-blue">
                  {isUser ? (
                    user.avatar ? (
                      (user.avatar.includes('/') || user.avatar.includes('\\') || user.avatar.startsWith('http') || user.avatar.startsWith('file:') || user.avatar.startsWith('data:')) ? (
                        <img src={user.avatar} alt="avatar" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-base leading-none select-none">{user.avatar}</span>
                      )
                    ) : (
                      <User size={14} />
                    )
                  ) : (
                    <Bot size={14} />
                  )}
                </div>

                {item.kind === "user_text" || item.kind === "assistant_text" ? (
                  <div className={cn(
                    "max-w-[85%] px-4 py-2.5 rounded-apple-xl text-[14px] leading-relaxed shadow-apple-md transition-all backdrop-blur-md",
                    item.kind === "user_text"
                      ? "bg-[#95EC69]/90 text-black dark:bg-[#3EB575]/90 selection:bg-black/10 selection:text-black"
                      : "bg-white/80 text-black border border-black/5 dark:bg-[#2E2E2E]/80 dark:text-white dark:border-white/10 selection:bg-black/10 selection:text-black dark:selection:bg-white/20 dark:selection:text-white"
                  )}>
                    <MarkdownContent content={item.content} />
                  </div>
                ) : (
                  <div className={cn(
                    "max-w-[85%] rounded-apple-xl border shadow-apple-md overflow-hidden backdrop-blur-md",
                    item.kind === "error"
                      ? "border-red-400/30 bg-red-50/80 text-red-900 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-100"
                      : "border-black/5 bg-white/80 text-black dark:border-white/10 dark:bg-[#2A2A2A]/80 dark:text-white"
                  )}>
                    {isCollapsibleToolItem ? (
                      <details
                        className="group"
                        data-tool-collapsible="true"
                        data-tool-kind={item.kind}
                        data-tool-id={item.id}
                        data-tool-default-collapsed="true"
                      >
                        <summary className="list-none cursor-pointer">
                          <div className="flex items-center gap-3 px-4 py-3">
                            <ChevronRight size={14} className="shrink-0 text-system-gray-400 transition-transform group-open:rotate-90" />
                            <div className="min-w-0 flex-1">{cardHeader}</div>
                            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-system-gray-400 group-open:hidden">{t("tasks.expand_tool")}</span>
                            <span className="hidden text-[10px] font-bold uppercase tracking-[0.14em] text-system-gray-400 group-open:inline">{t("tasks.collapse_tool")}</span>
                          </div>
                        </summary>
                        <div className="border-t border-black/5 dark:border-white/10">{cardBody}</div>
                      </details>
                    ) : (
                      <>
                        <div className="px-4 py-3 border-b border-black/5 dark:border-white/10">
                          {cardHeader}
                        </div>
                        {cardBody}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {showReplyingIndicator && <TaskChatReplyingIndicator />}
        </div>

        <div
          data-task-chat-bottom-fade="true"
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute bottom-0 z-[5]",
            resolveTaskChatBottomFadeVisibilityClass(autoScrollEnabled)
          )}
          style={{
            left: `${TASK_CHAT_BOTTOM_FADE_LEFT_INSET_PX}px`,
            right: `${TASK_CHAT_BOTTOM_FADE_RIGHT_INSET_PX}px`,
            height: `${TASK_CHAT_BOTTOM_FADE_HEIGHT_PX}px`,
          }}
        >
          <div
            className="h-full w-full bg-gradient-to-b from-[#EDEDED]/0 via-[#EDEDED]/24 to-[#EDEDED]/96 backdrop-blur-md dark:from-[#191919]/0 dark:via-[#191919]/28 dark:to-[#191919]/94"
            style={{
              WebkitMaskImage: TASK_CHAT_BOTTOM_FADE_EDGE_MASK,
              maskImage: TASK_CHAT_BOTTOM_FADE_EDGE_MASK,
            }}
          />
        </div>

        <TaskChatScrollToBottomButton
          visible={renderScrollToBottomButton}
          shattering={scrollButtonShattering}
          shatterCycle={scrollButtonShatterCycle}
          title={t("tasks.scroll_to_bottom")}
          onClick={handleResumeAutoScroll}
          style={{ bottom: `calc(${textareaHeight}px + ${TASK_CHAT_SCROLL_BUTTON_BOTTOM_PX}px)` }}
        />
      </div>

      {/* Input Area: Absolute Bottom */}
      <div
        ref={inputShellRef}
        data-task-chat-input-shell="true"
        className="absolute bottom-0 left-0 right-0 z-20"
      >
        <AnimatePresence>
          {showProviderMenu && providerMenuPosition && (
            <>
              <div
                data-task-chat-provider-backdrop="true"
                className={TASK_CHAT_PROVIDER_BACKDROP_CLASS}
                onClick={closeProviderMenu}
              />
              <motion.div
                data-task-chat-provider-menu="true"
                initial={TASK_CHAT_PROVIDER_MENU_MOTION.initial}
                animate={TASK_CHAT_PROVIDER_MENU_MOTION.animate}
                exit={TASK_CHAT_PROVIDER_MENU_MOTION.exit}
                transition={TASK_CHAT_PROVIDER_MENU_MOTION.transition}
                className={TASK_CHAT_PROVIDER_MENU_CLASS}
                style={{ ...providerMenuPosition, willChange: "transform, opacity" }}
              >
                <div className="flex flex-col gap-0.5">
                  {providers.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        onProviderChange(p.id);
                        closeProviderMenu();
                      }}
                      className={cn(
                        "apple-dropdown-item",
                        p.id === currentProvider?.id
                          ? "apple-dropdown-item-active"
                          : "text-system-gray-600 dark:text-system-gray-400"
                      )}
                    >
                      <div className="font-bold">{p.name}</div>
                      <div className={cn("text-[9px] truncate opacity-60", p.id === currentProvider?.id ? "text-white" : "text-system-gray-400")}>{p.model || p.id}</div>
                    </button>
                  ))}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
        <div className="relative m-3 rounded-apple-2xl border border-black/5 bg-white/90 shadow-apple-lg backdrop-blur-apple dark:border-white/10 dark:bg-[#1c1c1e]/85">
          <div
            data-task-chat-input-panel="true"
            className="relative z-10 px-4 pt-3 pb-3"
          >
            <div className="flex items-center justify-end gap-2 mb-2">
              {/* Provider Selector */}
              <div className="relative">
                <button
                  ref={providerTriggerRef}
                  data-task-chat-provider-trigger="true"
                  onClick={toggleProviderMenu}
                  className={TASK_CHAT_PROVIDER_TRIGGER_CLASS}
                  type="button"
                >
                  <span className="text-[10px] font-bold text-system-gray-400 uppercase">{currentProvider?.name}</span>
                  <ChevronDown size={12} className="text-system-gray-400" />
                </button>
              </div>

              <div className="w-[1px] h-4 bg-black/5 dark:bg-white/5 mx-1" />

              <button
                onClick={onGenerateDocs}
                disabled={generatingDocs || streaming}
                className={cn(
                  "apple-btn-secondary py-1 px-3 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5",
                  agentDoc && "text-apple-green border-apple-green/20"
                )}
              >
                {generatingDocs ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <FileCode size={12} />
                )}
                {agentDoc ? t("tasks.update_agents") : t("tasks.generate_agents")}
              </button>
            </div>

            <div className="flex items-end gap-2">
              <div
                data-task-chat-input-field="true"
                className="relative flex-1 rounded-apple-xl border border-black/5 bg-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] dark:border-white/10 dark:bg-white/10 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              >
                {/* Ghost textarea for measuring true height without affecting animations */}
                <textarea
                  ref={ghostRef}
                  value={input}
                  readOnly
                  tabIndex={-1}
                  rows={1}
                  className="absolute top-0 left-0 w-full px-4 py-[7px] text-sm leading-[24px] border border-transparent opacity-0 pointer-events-none resize-none overflow-hidden whitespace-pre-wrap break-words"
                  style={{ height: '0px' }}
                />
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onCompositionStart={() => {
                    isInputComposingRef.current = true;
                  }}
                  onCompositionEnd={() => {
                    isInputComposingRef.current = false;
                  }}
                  placeholder={t('tasks.placeholder_title')}
                  className="w-full bg-transparent border-none px-4 py-[7px] text-sm text-black focus:outline-none focus:ring-0 placeholder:text-system-gray-400 transition-[height] duration-200 ease-in-out resize-none overflow-y-auto block scrollbar-hide leading-[24px] dark:text-system-gray-100"
                  style={{ height: `${textareaHeight}px` }}
                  onKeyDown={(e) => {
                    if (!shouldSubmitOnEnter(e, isInputComposingRef.current)) return;
                    e.preventDefault();
                    handleSend();
                  }}
                />
              </div>
              <div className="flex-shrink-0 flex items-center justify-center">
                {streaming ? (
                  <button
                    onClick={onAbort}
                    className="p-2 rounded-apple-lg bg-apple-red text-white hover:bg-apple-red/90 transition-colors shadow-apple-sm h-[38px] w-[38px] flex items-center justify-center"
                    title={t("common.stop_generation")}
                  >
                    <StopCircle size={18} />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || generatingDocs}
                    className={cn(
                      "p-2 rounded-apple-lg transition-all shadow-apple-sm flex items-center justify-center h-[38px] w-[38px]",
                      input.trim()
                        ? "bg-apple-blue text-white hover:bg-apple-blue/90"
                        : "bg-system-gray-100 dark:bg-system-gray-800 text-system-gray-400"
                    )}
                  >
                    <Send size={18} />
                  </button>
                )}
              </div>
            </div>
            <p className="text-[9px] text-system-gray-400 font-bold uppercase tracking-widest mt-2 text-center opacity-50">
              {t('tasks.chat_hint')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
