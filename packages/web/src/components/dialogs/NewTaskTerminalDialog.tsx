import { useState } from "react";
import {
  Sparkles,
  Cpu,
  Shield,
  Terminal as TerminalIcon,
  RefreshCw,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { generateTerminalName } from "../../stores/terminalStore";
import { PERMISSION_MODES } from "../task-panel/constants";
import { cn } from "../../utils/cn";
import type { Provider } from "../../services/api";
import { WudaoButton, WudaoIconButton, WudaoInput, WudaoModal, WudaoModalBody, WudaoModalFooter, WudaoModalHeader } from "../ui/heroui";

interface Props {
  providers: Pick<Provider, "id" | "name" | "model" | "is_default">[];
  defaultProviderId: string;
  onConfirm: (providerId: string, permissionMode: string, name: string) => void;
  onCancel: () => void;
}

export function NewTaskTerminalDialog({
  providers,
  defaultProviderId,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const [selectedProvider, setSelectedProvider] = useState(defaultProviderId);
  const [selectedMode, setSelectedMode] = useState("bypassPermissions");
  const [terminalName, setTerminalName] = useState(() => generateTerminalName());

  return (
    <WudaoModal
      isOpen
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      size="sm"
      dialogClassName="w-full max-w-md bg-white/90 dark:bg-system-gray-800/90"
    >
      <WudaoModalHeader className="border-black/5 bg-white/50 dark:border-white/10 dark:bg-black/40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-apple-lg bg-apple-blue/10 flex items-center justify-center text-apple-blue shadow-apple-sm">
            <TerminalIcon size={16} />
          </div>
          <h3 className="text-sm font-bold uppercase tracking-widest text-system-gray-600 dark:text-system-gray-200">{t("terminal_dialog.title")}</h3>
        </div>
        <WudaoIconButton
          onPress={onCancel}
          tone="ghost"
          className="h-8 w-8 rounded-full text-system-gray-400"
          tooltip={t("common.cancel")}
          aria-label={t("common.cancel")}
        >
          <X size={18} />
        </WudaoIconButton>
      </WudaoModalHeader>

      <WudaoModalBody className="space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={14} className="text-apple-blue" />
            <label className="text-[11px] font-bold uppercase tracking-widest text-system-gray-500 dark:text-system-gray-400">{t("terminal_dialog.name_label")}</label>
          </div>
          <div className="relative flex items-center">
            <WudaoInput
              value={terminalName}
              onChange={(event) => setTerminalName(event.target.value)}
              placeholder={t("terminal_dialog.name_placeholder")}
              className="w-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-apple-xl px-4 py-2.5 text-sm text-system-gray-700 dark:text-system-gray-200 placeholder:text-system-gray-400 focus:outline-none focus:ring-2 focus:ring-apple-blue/20 transition-all"
            />
            <WudaoIconButton
              onPress={() => setTerminalName(generateTerminalName())}
              tone="ghost"
              className="absolute right-2 p-2 rounded-apple-lg hover:bg-black/5 dark:hover:bg-white/5 text-apple-blue transition-colors"
              tooltip={t("common.randomize")}
              aria-label={t("common.randomize")}
            >
              <RefreshCw size={14} />
            </WudaoIconButton>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <Cpu size={14} className="text-apple-blue" />
            <label className="text-[11px] font-bold uppercase tracking-widest text-system-gray-500 dark:text-system-gray-400">{t("tasks.model")}</label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {providers.map((provider) => {
              const isSelected = selectedProvider === provider.id;

              return (
              <WudaoButton
                key={provider.id}
                type="button"
                onPress={() => setSelectedProvider(provider.id)}
                aria-pressed={isSelected}
                tone="plain"
                className={cn(
                  "relative flex h-auto min-h-0 flex-col items-stretch justify-start overflow-visible rounded-apple-xl border px-3 py-2.5 text-left transition-all group",
                  isSelected
                    ? "bg-gradient-to-br from-apple-blue to-apple-indigo text-white border-transparent ring-1 ring-apple-blue/50 z-10"
                    : "bg-white/50 dark:bg-white/5 border-system-gray-200 dark:border-white/15 hover:border-system-gray-400 dark:hover:border-white/30 text-foreground dark:text-foreground-dark",
                )}
              >
                <div className="relative z-10 flex items-start justify-between gap-2">
                  <div className={cn(
                    "font-bold text-xs transition-colors min-w-0",
                    isSelected ? "text-white" : "text-system-gray-700 dark:text-white"
                  )}>{provider.name}</div>
                  {(isSelected || !!provider.is_default) && (
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {isSelected && (
                        <span className={cn(
                          "rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                          "border-white/20 bg-white/15 text-white"
                        )}>
                          {t("provider_status.selected")}
                        </span>
                      )}
                      {!!provider.is_default && (
                        <span className={cn(
                          "rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                          isSelected
                            ? "border-white/20 bg-white/15 text-white"
                            : "border-black/5 bg-black/5 text-system-gray-500 dark:border-white/10 dark:bg-white/10 dark:text-system-gray-200"
                        )}>
                          {t("provider_status.default")}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className={cn(
                  "text-[10px] mt-0.5 truncate relative z-10 transition-colors",
                  isSelected ? "text-white/70" : "text-system-gray-500 dark:text-system-gray-300",
                )}>{provider.model || provider.id}</div>
              </WudaoButton>
            )})}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <Shield size={14} className="text-apple-blue" />
            <label className="text-[11px] font-bold uppercase tracking-widest text-system-gray-500 dark:text-system-gray-400">{t("terminal_dialog.permission_label")}</label>
          </div>
          <div className="space-y-2">
            {PERMISSION_MODES.map((mode) => (
              <WudaoButton
                key={mode.value}
                onPress={() => setSelectedMode(mode.value)}
                tone="plain"
                className={cn(
                  "w-full px-4 py-3 rounded-apple-xl border transition-all text-left flex items-center justify-between group",
                  selectedMode === mode.value
                    ? "bg-apple-blue/10 border-apple-blue/30 text-apple-blue"
                    : "bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10 text-system-gray-700 dark:text-system-gray-300",
                )}
              >
                <div className="min-w-0">
                  <div className={cn(
                    "font-bold text-xs",
                    selectedMode === mode.value ? "text-apple-blue" : "text-system-gray-700 dark:text-white"
                  )}>{t(mode.labelKey)}</div>
                  <div className={cn(
                    "text-[10px] mt-0.5 leading-relaxed",
                    selectedMode === mode.value ? "text-apple-blue/70" : "text-system-gray-500 dark:text-system-gray-300",
                  )}>{t(mode.descKey)}</div>
                </div>
                <div className={cn(
                  "w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all",
                  selectedMode === mode.value
                    ? "border-apple-blue bg-apple-blue"
                    : "border-system-gray-300 dark:border-system-gray-600",
                )}>
                  {selectedMode === mode.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </WudaoButton>
            ))}
          </div>
        </div>
      </WudaoModalBody>

      <WudaoModalFooter className="px-6 py-4">
        <WudaoButton
          onPress={onCancel}
          tone="secondary"
          className="px-6 py-2 text-[12px] font-bold uppercase tracking-wider"
        >
          {t("common.cancel")}
        </WudaoButton>
        <WudaoButton
          onPress={() => onConfirm(selectedProvider, selectedMode, terminalName)}
          disabled={!selectedProvider}
          tone="primary"
          className="px-8 py-2 text-[12px] font-bold uppercase tracking-wider shadow-apple-sm"
        >
          {t("terminal_dialog.confirm")}
        </WudaoButton>
      </WudaoModalFooter>
    </WudaoModal>
  );
}
