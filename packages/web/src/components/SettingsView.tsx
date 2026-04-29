import { useEffect, useMemo, useState, useRef } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import type { Provider } from "../services/api";
import { Plus, Settings as SettingsIcon, Trash2, Edit, ChevronUp, ChevronDown, X, Shield, Globe, Cpu, Loader2, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { cn } from "../utils/cn";
import { Button } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { Checkbox } from "@heroui/react/checkbox";
import { Input } from "@heroui/react/input";
import { Modal } from "@heroui/react/modal";
import { TextArea } from "@heroui/react/textarea";
import { Tooltip } from "@heroui/react/tooltip";

const EMPTY_FORM = {
  name: "",
  endpoint: "",
  api_key: "",
  usage_auth_token: "",
  usage_cookie: "",
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

export default function SettingsView() {
  const { t } = useTranslation();
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
    setUser
  } = useSettingsStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [reordering, setReordering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Default avatar options
  const defaultAvatars = ["👨‍💻", "👩‍💻", "🤖", "🐱", "🐶", "🦊", "🦁", "🐧", "🎨", "🚀"];

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

  useEffect(() => {
    void fetchProviders();
  }, [fetchProviders]);

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
      usage_auth_token: p.usage_auth_token || "",
      usage_cookie: p.usage_cookie || "",
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
      form.usage_auth_token !== (p.usage_auth_token || "") ||
      form.usage_cookie !== (p.usage_cookie || "") ||
      form.model !== p.model ||
      form.is_default !== p.is_default
    );
  }, [form, editingId, providers]);

  const canSave = Boolean(form.name.trim() && form.endpoint.trim() && form.model.trim());

  const handleMove = async (index: number, offset: number) => {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= providers.length || reordering) return;

    const ids = providers.map((p) => p.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(nextIndex, 0, moved);

    setReordering(true);
    try {
      await reorder(ids);
    } finally {
      setReordering(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background-secondary dark:bg-black/40">
      <header className="px-8 pt-8 pb-4 shrink-0">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
           <p className="text-[11px] font-bold text-accent uppercase tracking-[0.2em] mb-1">{t('settings.preferences')}</p>
           <h1 className="text-3xl font-extrabold tracking-tight">{t('nav.settings')}</h1>
        </motion.div>
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* User Profile Section */}
          <Card className="overflow-hidden">
             <div className="px-6 py-4 border-b border-border flex items-center gap-2 bg-surface-secondary">
                <SettingsIcon size={16} className="text-accent" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted">{t('settings.user_profile')}</h2>
             </div>
             <div className="p-6 flex flex-col md:flex-row gap-8 items-start">
                {/* Avatar Preview & Selection */}
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
                     className="group relative flex h-24 min-h-0 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-accent/10 p-0 text-4xl shadow-lg dark:border-surface"
                     aria-label={t("common.avatar")}
                   >
                      {user.avatar && (user.avatar.includes('/') || user.avatar.includes('\\') || user.avatar.startsWith('http') || user.avatar.startsWith('file:') || user.avatar.startsWith('data:')) ? (
                        <img src={user.avatar} alt={t("common.avatar")} className="w-full h-full object-cover" />
                      ) : (
                        <span>{user.avatar || "👨‍💻"}</span>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                         {uploading ? <Loader2 size={24} className="text-white animate-spin" /> : <Plus size={24} className="text-white" />}
                      </div>
                   </Button>
                   <div className="flex flex-wrap gap-1.5 justify-center max-w-[200px]">
                      {defaultAvatars.map(av => (
                        <Button
                          key={av}
                          onPress={() => setUser({ avatar: av })}
                          variant="ghost"
                          className={cn(
                            "flex h-8 min-h-0 w-8 items-center justify-center rounded-full border text-lg transition-all hover:bg-default",
                            user.avatar === av ? "border-accent bg-accent/10" : "border-transparent"
                          )}
                        >
                          {av}
                        </Button>
                      ))}
                   </div>
                </div>

                {/* Profile Fields */}
                <div className="flex-1 space-y-4 w-full">
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted px-1">{t('settings.nickname')}</label>
                      <Input
                        className="w-full"
                        placeholder="Your Nickname"
                        value={user.nickname}
                        onChange={(e) => setUser({ nickname: e.target.value })}
                      />
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted px-1">{t('settings.avatar_url')}</label>
                      <Input
                        className="w-full"
                        placeholder="https://example.com/avatar.png"
                        value={user.avatar && user.avatar.startsWith('http') ? user.avatar : ""}
                        onChange={(e) => setUser({ avatar: e.target.value })}
                      />
                   </div>
                </div>
             </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-surface-secondary">
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
                <div className="mx-4 mt-4 rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                </div>
              )}

              {loading && (
                 <div className="p-12 text-center text-muted">
                    <Loader2 size={24} className="animate-spin mx-auto mb-2" />
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
                <div className="p-2 space-y-1">
                  {providers.map((p, index) => {
                    const providerSummary = [p.model || p.id, p.endpoint || ""].filter(Boolean).join(" • ");
                    return (
                    <motion.div
                      layout
                      key={p.id}
                      className="group flex items-center justify-between px-4 py-3 rounded-lg hover:bg-default transition-all"
                    >
                      <div className="min-w-0 flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center text-white shadow-sm",
                          p.is_default ? "bg-accent" : "bg-default"
                        )}>
                           <Globe size={20} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold truncate tracking-tight">{p.name}</p>
                            {p.is_default ? (
                              <span className="px-1.5 py-0.5 rounded-md bg-accent/10 text-accent text-[9px] font-extrabold uppercase tracking-widest">{t('theme.auto')}</span>
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
                            onPress={() => void handleMove(index, -1)}
                            isDisabled={index === 0 || reordering}
                            className="h-8 w-8 text-muted hover:text-foreground"
                            aria-label={t("common.move_up")}
                          >
                            <ChevronUp size={16} />
                          </Button>
                          <Tooltip.Content className="rounded-lg border border-border bg-overlay px-2.5 py-1.5 text-xs font-semibold text-overlay-foreground shadow-md" placement="top" showArrow>
                            <Tooltip.Arrow className="fill-overlay" />
                            {t("common.move_up")}
                          </Tooltip.Content>
                        </Tooltip>
                        <Tooltip delay={300} closeDelay={0}>
                          <Button
                            isIconOnly
                            variant="ghost"
                            onPress={() => void handleMove(index, 1)}
                            isDisabled={index === providers.length - 1 || reordering}
                            className="h-8 w-8 text-muted hover:text-foreground"
                            aria-label={t("common.move_down")}
                          >
                            <ChevronDown size={16} />
                          </Button>
                          <Tooltip.Content className="rounded-lg border border-border bg-overlay px-2.5 py-1.5 text-xs font-semibold text-overlay-foreground shadow-md" placement="top" showArrow>
                            <Tooltip.Arrow className="fill-overlay" />
                            {t("common.move_down")}
                          </Tooltip.Content>
                        </Tooltip>
                        <div className="w-[1px] h-4 bg-border mx-1" />
                        <Tooltip delay={300} closeDelay={0}>
                          <Button
                            isIconOnly
                            variant="ghost"
                            onPress={() => openEdit(p)}
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
                            onPress={() => {
                              void remove(p.id);
                            }}
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
                    </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>

          <footer className="text-center py-8 opacity-30">
             <div className="w-1 bg-default h-6 mb-4 rounded-full mx-auto" />
             <p className="text-[9px] font-bold uppercase tracking-[0.2em]">{t('settings.config_panel')}</p>
          </footer>
        </div>
      </div>

      <Modal
        isOpen={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <Modal.Backdrop />
        <Modal.Container className="w-full max-w-lg">
          <Modal.Dialog>
            <Modal.Header>
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

            <Modal.Body className="max-h-[70vh] space-y-4 overflow-y-auto">
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
                          className="w-full"
                          placeholder="Ollama Local"
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                        />
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted">{t('settings.model_id')}</label>
                        <Input
                          className="w-full"
                          placeholder="qwen2.5"
                          value={form.model}
                          onChange={(e) => setForm({ ...form, model: e.target.value })}
                        />
                     </div>
                  </div>

                  <div className="space-y-1.5">
                     <label className="text-[10px] font-bold uppercase tracking-wider text-muted">{t('settings.endpoint_url')}</label>
                     <Input
                       className="w-full"
                       placeholder="http://localhost:11434"
                       value={form.endpoint}
                       onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
                     />
                  </div>

                  <div className="space-y-1.5">
                     <label className="text-[10px] font-bold uppercase tracking-wider text-muted">{t('settings.api_key')}</label>
                     <Input
                       className="w-full"
                       placeholder="••••••••••••"
                       type="password"
                       value={form.api_key}
                       onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                     />
                  </div>

                  <div className="p-4 rounded-xl bg-default border border-border space-y-4">
                     <div className="flex items-center gap-2 mb-2">
                        <Shield size={14} className="text-accent" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted">{t('settings.usage_tracking')}</span>
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-[9px] font-bold uppercase tracking-wider text-muted">{t('settings.usage_auth_token')}</label>
                        <Input
                          className="w-full"
                          placeholder="JWT Token or similar"
                          type="password"
                          value={form.usage_auth_token}
                          onChange={(e) => setForm({ ...form, usage_auth_token: e.target.value })}
                        />
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-[9px] font-bold uppercase tracking-wider text-muted">{t('settings.usage_cookie')}</label>
                        <TextArea
                          className="min-h-[60px] w-full resize-none"
                          placeholder="Full cookie string..."
                          value={form.usage_cookie}
                          onChange={(e) => setForm({ ...form, usage_cookie: e.target.value })}
                        />
                     </div>
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
                 {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                 {saving ? t('common.loading') : editingId ? t('common.update') : t('common.save')}
               </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal>
    </div>
  );
}
