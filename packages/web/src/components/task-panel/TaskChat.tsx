import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Send,
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
import { Avatar } from "@heroui/react/avatar";
import { Button } from "@heroui/react/button";
import { Dropdown } from "@heroui/react/dropdown";
import { Spinner } from "@heroui/react/spinner";
import { Tooltip } from "@heroui/react/tooltip";
import { useSettingsStore } from "../../stores/settingsStore";
import MarkdownContent from "../MarkdownContent";
import { TASK_WORKSPACE_HEADER_HEIGHT_PX, TaskWorkspacePanelHeader } from "../TaskWorkspacePanelHeader";
import { cn } from "../../utils/cn";
import { shouldSubmitOnEnter } from "../../utils/ime";
import { extractSdkRunIdFromToolOutput, shortSdkRunId } from "../../utils/sdk-runner";
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
              "relative h-9 w-9 rounded-full flex items-center justify-center overflow-visible shadow-md",
              shattering
                ? "pointer-events-none bg-transparent"
                : "bg-accent text-white hover:bg-accent/90"
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
                      "absolute z-[2] rounded-[5px] bg-accent shadow-[0_0_0_1px_rgba(255,255,255,0.18)]",
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
  onOpenSdkRun?: (sdkRunId: string) => void;
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
  "flex items-center gap-1.5 h-8 px-2 rounded-lg bg-default hover:bg-default/80 transition-all border border-transparent";

export const TASK_CHAT_PROVIDER_MENU_CLASS =
  "w-48";

const TASK_CHAT_INPUT_PANEL_MARGIN_PX = 12;
const TASK_CHAT_INPUT_PANEL_BOTTOM_PADDING_PX = 116 + TASK_CHAT_INPUT_PANEL_MARGIN_PX;
const TASK_CHAT_SCROLL_BUTTON_BOTTOM_PX = 120 + TASK_CHAT_INPUT_PANEL_MARGIN_PX;
const TASK_CHAT_BOTTOM_FADE_HEIGHT_PX = 76;
const TASK_CHAT_BOTTOM_FADE_LEFT_EDGE_FEATHER_PX = 10;
const TASK_CHAT_BOTTOM_FADE_RIGHT_EDGE_FEATHER_PX = 18;
const TASK_CHAT_BOTTOM_FADE_LEFT_INSET_PX = 0;
const TASK_CHAT_BOTTOM_FADE_RIGHT_INSET_PX = 6;
const TASK_CHAT_BOTTOM_FADE_EDGE_MASK = `linear-gradient(to right, transparent 0, black ${TASK_CHAT_BOTTOM_FADE_LEFT_EDGE_FEATHER_PX}px, black calc(100% - ${TASK_CHAT_BOTTOM_FADE_RIGHT_EDGE_FEATHER_PX}px), transparent 100%)`;

export function resolveTaskChatBottomFadeVisibilityClass(autoScrollEnabled: boolean) {
  return autoScrollEnabled
    ? "opacity-0 transition-opacity duration-200"
    : "opacity-100 transition-none";
}

function TaskChatReplyingIndicator() {
  return (
    <div data-replying-indicator="true" className="flex gap-3">
      <Avatar size="sm" className="mt-1 shrink-0">
        <Avatar.Fallback><Bot size={14} /></Avatar.Fallback>
      </Avatar>
      <div className="max-w-[85%] rounded-xl border border-border bg-surface/80 backdrop-blur-md px-4 py-3 text-foreground shadow-md">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-accent animate-pulse [animation-delay:0ms]" />
          <span className="h-2 w-2 rounded-full bg-accent animate-pulse [animation-delay:150ms]" />
          <span className="h-2 w-2 rounded-full bg-accent animate-pulse [animation-delay:300ms]" />
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

function resolveBoundSdkRunId(item: TaskChatRenderItem): string | null {
  if (item.kind === "tool_call" && item.sdkRunId) {
    return item.sdkRunId;
  }
  if (item.kind === "tool_exchange" || item.kind === "tool_result") {
    return extractSdkRunIdFromToolOutput(item.toolName, item.output);
  }
  return null;
}

interface CollapsibleToolMessageCardProps {
  item: Extract<TaskChatRenderItem, { kind: "tool_call" | "tool_result" | "tool_exchange" | "approval" }>;
  cardHeader: ReactNode;
  cardBody: ReactNode;
  sdkRunId: string | null;
  onOpenSdkRun?: (sdkRunId: string) => void;
  expandLabel: string;
  collapseLabel: string;
  openSdkRunnerLabel: string;
}

function CollapsibleToolMessageCard({
  item,
  cardHeader,
  cardBody,
  sdkRunId,
  onOpenSdkRun,
  expandLabel,
  collapseLabel,
  openSdkRunnerLabel,
}: CollapsibleToolMessageCardProps) {
  const [expanded, setExpanded] = useState(false);

  const handleToggle = () => {
    setExpanded((current) => !current);
  };

  return (
    <div
      className="group"
      data-tool-collapsible="true"
      data-tool-kind={item.kind}
      data-tool-id={item.id}
      data-tool-default-collapsed="true"
      data-tool-expanded={expanded ? "true" : "false"}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <Button
          onPress={handleToggle}
          aria-expanded={expanded}
          variant="ghost"
          className="flex h-auto min-h-0 min-w-0 flex-1 items-center gap-3 text-left"
        >
          <ChevronRight
            size={14}
            className={cn(
              "shrink-0 text-muted transition-transform duration-200 ease-out",
              expanded && "rotate-90"
            )}
          />
          <div className="min-w-0 flex-1">{cardHeader}</div>
          <span
            className={cn(
              "shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-muted transition-opacity duration-200",
              expanded && "hidden"
            )}
          >
            {expandLabel}
          </span>
          <span
            className={cn(
              "hidden shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-muted transition-opacity duration-200",
              expanded && "inline"
            )}
          >
            {collapseLabel}
          </span>
        </Button>
        {sdkRunId && onOpenSdkRun && (
          <Button
            type="button"
            onPress={() => onOpenSdkRun(sdkRunId)}
            data-sdk-run-link={sdkRunId}
            variant="ghost"
            className="inline-flex h-auto min-h-0 shrink-0 items-center gap-1 rounded-full border border-accent/20 bg-accent/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-accent hover:bg-accent/15"
          >
            <span>{openSdkRunnerLabel}</span>
            <span className="text-[9px] tracking-[0.08em] text-muted">
              {shortSdkRunId(sdkRunId)}
            </span>
          </Button>
        )}
      </div>
      <div
        data-tool-animated-panel="true"
        className={cn(
          "grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className={cn(
              "border-t border-border transition-[opacity,transform] duration-200 ease-out",
              expanded ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
            )}
          >
            {cardBody}
          </div>
        </div>
      </div>
    </div>
  );
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
  onOpenSdkRun,
}: Props) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const ghostRef = useRef<HTMLTextAreaElement>(null);
  const inputShellRef = useRef<HTMLDivElement>(null);
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
  const hasPendingToolExecution = lastRenderItem?.kind === "tool_call" && lastRenderItem.status === "streaming";
  const showReplyingIndicator = streaming && !hasStreamingAssistant && !hasPendingToolExecution && lastRenderItem?.kind !== "error";

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
    <div className="relative flex-1 h-full min-h-0 overflow-hidden bg-background dark:bg-background-secondary">
      {/* Sub-header: Absolute Top */}
      <TaskWorkspacePanelHeader
        title={t('tasks.agent_chat')}
        icon={Bot}
        wrapperProps={{
          "data-task-chat-header": "true",
          className: "absolute top-0 left-0 right-0 z-20",
        }}
        panelProps={{
          "data-task-chat-header-panel": "true",
        }}
      />

      {/* Messages: Scrollable */}
      <div className="absolute inset-0 z-0 bg-transparent">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto px-4 space-y-6 scrollbar-thin scrollbar-thumb-black/5 dark:scrollbar-thumb-white/5"
          style={{
            paddingTop: `${TASK_WORKSPACE_HEADER_HEIGHT_PX}px`,
            paddingBottom: `calc(${textareaHeight}px + ${TASK_CHAT_INPUT_PANEL_BOTTOM_PADDING_PX}px)`,
          }}
        >
          {items.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-40">
               <div className="w-12 h-12 rounded-2xl bg-default flex items-center justify-center mb-4">
                  <Sparkles size={24} className="text-accent" />
               </div>
               <p className="text-xs font-medium leading-relaxed max-w-[200px]">
                 {t('tasks.placeholder_input')}
               </p>
            </div>
          )}

          {renderItems.map((item) => {
            const isUser = item.kind === "user_text";
            const ToolIcon = "toolName" in item ? resolveToolIcon(item.toolName) : null;
            const sdkRunId = resolveBoundSdkRunId(item);
            const isCollapsibleToolItem =
              item.kind === "tool_call" ||
              item.kind === "tool_result" ||
              item.kind === "approval" ||
              item.kind === "tool_exchange";
            const isRunningToolCall = item.kind === "tool_call" && item.status === "streaming";

            const cardHeader = (
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em]">
                {item.kind === "error" ? (
                  <AlertCircle size={14} className="text-danger" />
                ) : ToolIcon ? (
                  <ToolIcon size={14} className="text-accent" />
                ) : (
                  <Wrench size={14} className="text-accent" />
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
                  <span className="text-muted normal-case tracking-normal">{item.toolName}</span>
                )}
                {isRunningToolCall && (
                  <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-accent">
                    <Spinner size="sm" className="[&>div]:w-3 [&>div]:h-3" />
                    <span>{t("tasks.tool_running")}</span>
                  </span>
                )}
              </div>
            );

            const cardBody = (
              <div className="px-4 py-3 space-y-3">
                {item.kind === "tool_exchange" && (
                  <>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted mb-2">{t("tasks.tool_input_label")}</div>
                      <pre className="text-[12px] leading-relaxed whitespace-pre-wrap break-all font-mono">{formatStructuredValue(item.input)}</pre>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted mb-2">{t("tasks.tool_output_label")}</div>
                      <pre className="text-[12px] leading-relaxed whitespace-pre-wrap break-all font-mono">{formatStructuredValue(item.output)}</pre>
                    </div>
                  </>
                )}
                {item.kind === "tool_call" && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted mb-2">{t("tasks.tool_input_label")}</div>
                    <pre className="text-[12px] leading-relaxed whitespace-pre-wrap break-all font-mono">{formatStructuredValue(item.input)}</pre>
                    {isRunningToolCall && (
                      <div className="mt-3 inline-flex items-center gap-2 text-[12px] font-medium text-accent">
                        <Spinner size="sm" className="[&>div]:w-3 [&>div]:h-3" />
                        <span>{t("tasks.tool_running_detail")}</span>
                      </div>
                    )}
                  </div>
                )}
                {item.kind === "tool_result" && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted mb-2">{t("tasks.tool_output_label")}</div>
                    <pre className="text-[12px] leading-relaxed whitespace-pre-wrap break-all font-mono">{formatStructuredValue(item.output)}</pre>
                  </div>
                )}
                {item.kind === "approval" && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted mb-2">{t("tasks.tool_input_label")}</div>
                    <pre className="text-[12px] leading-relaxed whitespace-pre-wrap break-all font-mono">{formatStructuredValue(item.input)}</pre>
                  </div>
                )}
                {item.kind === "artifact" && (
                  <div className="text-[13px] leading-relaxed">
                    <div className="font-semibold">{item.path}</div>
                    <div className="mt-1 text-muted">{item.summary}</div>
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
                <Avatar size="sm" className="mt-1 shrink-0">
                  {isUser ? (
                    <>
                      {user.avatar && (user.avatar.includes('/') || user.avatar.includes('\\') || user.avatar.startsWith('http') || user.avatar.startsWith('file:') || user.avatar.startsWith('data:')) ? (
                        <Avatar.Image src={user.avatar} alt="avatar" />
                      ) : null}
                      <Avatar.Fallback>{user.avatar || <User size={14} />}</Avatar.Fallback>
                    </>
                  ) : (
                    <Avatar.Fallback><Bot size={14} /></Avatar.Fallback>
                  )}
                </Avatar>

                {item.kind === "user_text" || item.kind === "assistant_text" ? (
                  <div className={cn(
                    "max-w-[85%] px-4 py-2.5 rounded-xl text-[14px] leading-relaxed shadow-md transition-all backdrop-blur-md",
                    item.kind === "user_text"
                      ? "bg-[#95EC69]/90 text-foreground dark:bg-[#3EB575]/90 selection:bg-black/10 selection:text-black"
                      : "bg-surface/80 text-foreground border border-border selection:bg-black/10 selection:text-black dark:selection:bg-white/20 dark:selection:text-white"
                  )}>
                    <MarkdownContent content={item.content} />
                  </div>
                ) : (
                  <div className={cn(
                    "max-w-[85%] rounded-xl border shadow-md overflow-hidden backdrop-blur-md",
                    item.kind === "error"
                      ? "border-danger/30 bg-danger/10 text-danger"
                      : "border-border bg-surface/80 text-foreground"
                  )}>
                    {isCollapsibleToolItem ? (
                      <CollapsibleToolMessageCard
                        item={item}
                        cardHeader={cardHeader}
                        cardBody={cardBody}
                        sdkRunId={sdkRunId}
                        onOpenSdkRun={onOpenSdkRun}
                        expandLabel={t("tasks.expand_tool")}
                        collapseLabel={t("tasks.collapse_tool")}
                        openSdkRunnerLabel={t("tasks.open_sdk_runner")}
                      />
                    ) : (
                      <>
                        <div className="px-4 py-3 border-b border-border">
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
            className="h-full w-full bg-gradient-to-b from-background/0 via-background/24 to-background/96 backdrop-blur-md"
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
        <div className="relative m-3 rounded-2xl border border-border bg-surface/90 shadow-lg backdrop-blur-xl">
          <div
            data-task-chat-input-panel="true"
            className="relative z-10 px-4 pt-3 pb-3"
          >
            <div className="flex items-center justify-end gap-2 mb-2">
              {/* Provider Selector */}
              <Dropdown isOpen={providerMenuOpen} onOpenChange={setProviderMenuOpen}>
                <Dropdown.Trigger>
                  <Button
                    data-task-chat-provider-trigger="true"
                    className={TASK_CHAT_PROVIDER_TRIGGER_CLASS}
                    variant="ghost"
                    type="button"
                  >
                    <span className="text-[10px] font-bold text-muted uppercase">{currentProvider?.name}</span>
                    <ChevronDown size={12} className="text-muted" />
                  </Button>
                </Dropdown.Trigger>
                <Dropdown.Popover
                  data-task-chat-provider-menu="true"
                  className={cn("rounded-xl border border-border bg-surface/90 p-1 shadow-lg backdrop-blur-xl", TASK_CHAT_PROVIDER_MENU_CLASS)}
                  placement="top end"
                >
                  <Dropdown.Menu
                    aria-label={t("tasks.model")}
                    onAction={(key) => {
                      onProviderChange(String(key));
                      setProviderMenuOpen(false);
                    }}
                    className="flex min-w-0 flex-col gap-0.5 outline-none"
                  >
                    {providers.map((p) => (
                      <Dropdown.Item
                        key={p.id}
                        id={p.id}
                        textValue={`${p.name} ${p.model || p.id}`}
                        className={cn(
                          "flex min-h-0 w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold outline-none transition-colors data-[focused=true]:bg-default",
                          p.id === currentProvider?.id
                            ? "bg-accent text-white shadow-sm data-[focused=true]:bg-accent/90"
                            : "text-muted"
                        )}
                      >
                        <div className="font-bold">{p.name}</div>
                        <div className={cn("text-[9px] truncate opacity-60", p.id === currentProvider?.id ? "text-white" : "text-muted")}>{p.model || p.id}</div>
                      </Dropdown.Item>
                    ))}
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>

              <div className="w-[1px] h-4 bg-default mx-1" />

              <Button
                onPress={onGenerateDocs}
                isDisabled={generatingDocs || streaming}
                variant="secondary"
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider",
                  agentDoc && "text-success border-success/20"
                )}
              >
                {generatingDocs ? (
                  <Spinner size="sm" className="[&>div]:w-3 [&>div]:h-3" />
                ) : (
                  <FileCode size={12} />
                )}
                {agentDoc ? t("tasks.update_agents") : t("tasks.generate_agents")}
              </Button>
            </div>

            <div className="flex items-end gap-2">
              <div
                data-task-chat-input-field="true"
                className="relative flex-1 rounded-xl border border-border bg-surface/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
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
                  className="w-full bg-transparent border-none px-4 py-[7px] text-sm text-foreground focus:outline-none focus:ring-0 placeholder:text-muted transition-[height] duration-200 ease-in-out resize-none overflow-y-auto block scrollbar-hide leading-[24px]"
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
                  <Tooltip delay={300} closeDelay={0}>
                    <Button
                      isIconOnly
                      onPress={onAbort}
                      variant="danger"
                      className="p-2 rounded-lg bg-danger text-white hover:bg-danger/90 transition-colors shadow-sm h-[38px] w-[38px] flex items-center justify-center"
                      aria-label={t("common.stop_generation")}
                    >
                      <StopCircle size={18} />
                    </Button>
                    <Tooltip.Content className="rounded-lg border border-border bg-overlay px-2.5 py-1.5 text-xs font-semibold text-overlay-foreground shadow-md" placement="top" showArrow>
                      <Tooltip.Arrow className="fill-overlay" />
                      {t("common.stop_generation")}
                    </Tooltip.Content>
                  </Tooltip>
                ) : (
                  <Tooltip delay={300} closeDelay={0}>
                    <Button
                      isIconOnly
                      onPress={handleSend}
                      isDisabled={!input.trim() || generatingDocs}
                      variant={input.trim() ? "primary" : "secondary"}
                      className={cn(
                        "p-2 rounded-lg transition-all shadow-sm flex items-center justify-center h-[38px] w-[38px]",
                        input.trim()
                          ? "bg-accent text-white hover:bg-accent/90"
                          : "bg-default text-muted"
                      )}
                      aria-label={t("tasks.agent_chat")}
                    >
                      <Send size={18} />
                    </Button>
                    <Tooltip.Content className="rounded-lg border border-border bg-overlay px-2.5 py-1.5 text-xs font-semibold text-overlay-foreground shadow-md" placement="top" showArrow>
                      <Tooltip.Arrow className="fill-overlay" />
                      {t("tasks.agent_chat")}
                    </Tooltip.Content>
                  </Tooltip>
                )}
              </div>
            </div>
            <p className="text-[9px] text-muted font-bold uppercase tracking-widest mt-2 text-center opacity-50">
              {t('tasks.chat_hint')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
