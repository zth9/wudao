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
import { Button } from "@heroui/react/button";
import { Input } from "@heroui/react/input";
import { Modal } from "@heroui/react/modal";
import { Tooltip } from "@heroui/react/tooltip";

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
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <Modal.Backdrop />
      <Modal.Container className="w-full max-w-md" size="sm">
        <Modal.Dialog>
          <Modal.Header className="border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                <TerminalIcon size={16} />
              </div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-foreground">{t("terminal_dialog.title")}</h3>
            </div>
            <Tooltip delay={300} closeDelay={0}>
              <Button
                isIconOnly
                variant="ghost"
                onPress={onCancel}
                className="h-8 w-8 rounded-full text-muted"
                aria-label={t("common.cancel")}
              >
                <X size={18} />
              </Button>
              <Tooltip.Content className="rounded-lg border border-border bg-overlay px-2.5 py-1.5 text-xs font-semibold text-overlay-foreground shadow-md" placement="top" showArrow>
                <Tooltip.Arrow className="fill-overlay" />
                {t("common.cancel")}
              </Tooltip.Content>
            </Tooltip>
          </Modal.Header>

          <Modal.Body className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={14} className="text-accent" />
                <label className="text-[11px] font-bold uppercase tracking-widest text-muted">{t("terminal_dialog.name_label")}</label>
              </div>
              <div className="relative flex items-center">
                <Input
                  value={terminalName}
                  onChange={(event) => setTerminalName(event.target.value)}
                  placeholder={t("terminal_dialog.name_placeholder")}
                  className="w-full"
                />
                <Tooltip delay={300} closeDelay={0}>
                  <Button
                    isIconOnly
                    variant="ghost"
                    onPress={() => setTerminalName(generateTerminalName())}
                    className="absolute right-2 p-2 rounded-lg hover:bg-default text-accent"
                    aria-label={t("common.randomize")}
                  >
                    <RefreshCw size={14} />
                  </Button>
                  <Tooltip.Content className="rounded-lg border border-border bg-overlay px-2.5 py-1.5 text-xs font-semibold text-overlay-foreground shadow-md" placement="top" showArrow>
                    <Tooltip.Arrow className="fill-overlay" />
                    {t("common.randomize")}
                  </Tooltip.Content>
                </Tooltip>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3">
                <Cpu size={14} className="text-accent" />
                <label className="text-[11px] font-bold uppercase tracking-widest text-muted">{t("tasks.model")}</label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {providers.map((provider) => {
                  const isSelected = selectedProvider === provider.id;

                  return (
                  <Button
                    key={provider.id}
                    type="button"
                    onPress={() => setSelectedProvider(provider.id)}
                    aria-pressed={isSelected}
                    variant="ghost"
                    className={cn(
                      "relative flex h-auto min-h-0 flex-col items-stretch justify-start overflow-visible rounded-xl border px-3 py-2.5 text-left transition-all group",
                      isSelected
                        ? "bg-gradient-to-br from-accent to-accent text-white border-transparent ring-1 ring-accent/50 z-10"
                        : "bg-default border-border hover:border-default-foreground text-foreground",
                    )}
                  >
                    <div className="relative z-10 flex items-start justify-between gap-2">
                      <div className={cn(
                        "font-bold text-xs transition-colors min-w-0",
                        isSelected ? "text-white" : "text-foreground"
                      )}>{provider.name}</div>
                      {(isSelected || !!provider.is_default) && (
                        <div className="flex shrink-0 flex-wrap justify-end gap-1">
                          {isSelected && (
                            <span className="rounded-full border border-white/20 bg-white/15 text-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                              {t("provider_status.selected")}
                            </span>
                          )}
                          {!!provider.is_default && (
                            <span className={cn(
                              "rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                              isSelected
                                ? "border-white/20 bg-white/15 text-white"
                                : "border-border bg-default text-muted"
                            )}>
                              {t("provider_status.default")}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className={cn(
                      "text-[10px] mt-0.5 truncate relative z-10 transition-colors",
                      isSelected ? "text-white/70" : "text-muted",
                    )}>{provider.model || provider.id}</div>
                  </Button>
                )})}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3">
                <Shield size={14} className="text-accent" />
                <label className="text-[11px] font-bold uppercase tracking-widest text-muted">{t("terminal_dialog.permission_label")}</label>
              </div>
              <div className="space-y-2">
                {PERMISSION_MODES.map((mode) => (
                  <Button
                    key={mode.value}
                    onPress={() => setSelectedMode(mode.value)}
                    variant="ghost"
                    className={cn(
                      "w-full px-4 py-3 rounded-xl border transition-all text-left flex items-center justify-between group",
                      selectedMode === mode.value
                        ? "bg-accent/10 border-accent/30 text-accent"
                        : "bg-default border-border hover:bg-default/80 text-foreground",
                    )}
                  >
                    <div className="min-w-0">
                      <div className={cn(
                        "font-bold text-xs",
                        selectedMode === mode.value ? "text-accent" : "text-foreground"
                      )}>{t(mode.labelKey)}</div>
                      <div className={cn(
                        "text-[10px] mt-0.5 leading-relaxed",
                        selectedMode === mode.value ? "text-accent/70" : "text-muted",
                      )}>{t(mode.descKey)}</div>
                    </div>
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all",
                      selectedMode === mode.value
                        ? "border-accent bg-accent"
                        : "border-default-foreground",
                    )}>
                      {selectedMode === mode.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          </Modal.Body>

          <Modal.Footer className="px-6 py-4">
            <Button
              onPress={onCancel}
              variant="secondary"
              className="px-6 py-2 text-[12px] font-bold uppercase tracking-wider"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onPress={() => onConfirm(selectedProvider, selectedMode, terminalName)}
              isDisabled={!selectedProvider}
              variant="primary"
              className="px-8 py-2 text-[12px] font-bold uppercase tracking-wider"
            >
              {t("terminal_dialog.confirm")}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal>
  );
}
