import { useEffect, useMemo, useState, useRef } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import type { Provider } from "../services/api";
import { Plus, Settings as SettingsIcon, Trash2, Edit, ChevronUp, ChevronDown, X, Shield, Globe, Cpu, Loader2, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { cn } from "../utils/cn";
import {
  WudaoButton,
  WudaoCard,
  WudaoCheckbox,
  WudaoIconButton,
  WudaoInput,
  WudaoModal,
  WudaoModalBody,
  WudaoModalFooter,
  WudaoModalHeader,
  WudaoTextArea,
} from "./ui/heroui";

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
    <WudaoCheckbox
      className={cn(
        "flex items-center gap-3 rounded-apple-xl border px-3 py-3 transition-all cursor-pointer group",
        checked
          ? "border-apple-blue/20 bg-apple-blue/10 dark:border-apple-blue/30 dark:bg-apple-blue/15"
          : "border-black/5 bg-system-gray-50/90 hover:bg-black/5 dark:border-white/12 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]",
      )}
      controlClassName={checked ? "shadow-apple-sm" : undefined}
      indicatorClassName="[&>svg]:h-3.5 [&>svg]:w-3.5"
      isSelected={checked}
      onChange={onChange}
    >
      <span className="text-sm font-semibold text-system-gray-700 transition-colors group-hover:text-apple-blue dark:text-system-gray-100">
        {label}
      </span>
    </WudaoCheckbox>
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
           <p className="text-[11px] font-bold text-apple-blue uppercase tracking-[0.2em] mb-1">{t('settings.preferences')}</p>
           <h1 className="text-3xl font-extrabold tracking-tight">{t('nav.settings')}</h1>
        </motion.div>
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* User Profile Section */}
          <WudaoCard className="overflow-hidden">
             <div className="px-6 py-4 border-b border-black/5 dark:border-white/10 flex items-center gap-2 bg-white/50 dark:bg-black/40">
                <SettingsIcon size={16} className="text-apple-blue" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-system-gray-500 dark:text-system-gray-400">{t('settings.user_profile')}</h2>
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
                   <WudaoButton
                     onPress={() => fileInputRef.current?.click()}
                     tone="plain"
                     className="group relative flex h-24 min-h-0 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-apple-blue/10 p-0 text-4xl shadow-apple-lg dark:border-system-gray-800"
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
                   </WudaoButton>
                   <div className="flex flex-wrap gap-1.5 justify-center max-w-[200px]">
                      {defaultAvatars.map(av => (
                        <WudaoButton
                          key={av}
                          onPress={() => setUser({ avatar: av })}
                          tone="plain"
                          className={cn(
                            "flex h-8 min-h-0 w-8 items-center justify-center rounded-full border text-lg transition-all hover:bg-black/5 dark:hover:bg-white/5",
                            user.avatar === av ? "border-apple-blue bg-apple-blue/10" : "border-transparent"
                          )}
                        >
                          {av}
                        </WudaoButton>
                      ))}
                   </div>
                </div>

                {/* Profile Fields */}
                <div className="flex-1 space-y-4 w-full">
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-system-gray-500 dark:text-system-gray-400 px-1">{t('settings.nickname')}</label>
                      <WudaoInput
                        className="w-full px-4 py-2 text-lg font-bold"
                        placeholder="Your Nickname"
                        value={user.nickname}
                        onChange={(e) => setUser({ nickname: e.target.value })}
                      />
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-system-gray-500 dark:text-system-gray-400 px-1">{t('settings.avatar_url')}</label>
                      <WudaoInput
                        className="w-full px-4 py-2 text-xs font-medium"
                        placeholder="https://example.com/avatar.png"
                        value={user.avatar && user.avatar.startsWith('http') ? user.avatar : ""}
                        onChange={(e) => setUser({ avatar: e.target.value })}
                      />
                   </div>
                </div>
             </div>
          </WudaoCard>

          <WudaoCard className="overflow-hidden">
            <div className="px-6 py-4 border-b border-black/5 dark:border-white/10 flex items-center justify-between bg-white/50 dark:bg-black/40">
              <div className="flex items-center gap-2">
                <Cpu size={16} className="text-apple-blue" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-system-gray-500 dark:text-system-gray-400">{t('settings.model_providers')}</h2>
              </div>
              <WudaoButton
                onPress={openCreate}
                tone="primary"
                className="flex items-center gap-1.5 px-3 py-1 text-xs shadow-sm"
              >
                <Plus size={14} />
                <span>{t('settings.add_provider')}</span>
              </WudaoButton>
            </div>

            <div className="divide-y divide-black/5 dark:divide-white/5">
              {error && (
                <div className="mx-4 mt-4 rounded-apple-lg border border-apple-red/20 bg-apple-red/10 px-4 py-3 text-sm text-apple-red dark:border-apple-red/30 dark:bg-apple-red/15">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                </div>
              )}

              {loading && (
                 <div className="p-12 text-center text-system-gray-400 dark:text-system-gray-300">
                    <Loader2 size={24} className="animate-spin mx-auto mb-2" />
                    <p className="text-xs font-medium uppercase tracking-widest">{t('settings.loading_providers')}</p>
                 </div>
              )}

              {!loading && providers.length === 0 && (
                <div className="p-12 text-center text-system-gray-400 dark:text-system-gray-300">
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
                      className="group flex items-center justify-between px-4 py-3 rounded-apple-lg hover:bg-black/5 dark:hover:bg-white/5 transition-all"
                    >
                      <div className="min-w-0 flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-apple-lg flex items-center justify-center text-white shadow-sm",
                          p.is_default ? "bg-apple-blue" : "bg-system-gray-200 dark:bg-system-gray-700"
                        )}>
                           <Globe size={20} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold truncate tracking-tight">{p.name}</p>
                            {p.is_default ? (
                              <span className="px-1.5 py-0.5 rounded-apple bg-apple-blue/10 text-apple-blue text-[9px] font-extrabold uppercase tracking-widest">{t('theme.auto')}</span>
                            ) : null}
                          </div>
                          <p className="text-[11px] text-system-gray-400 dark:text-system-gray-300 font-medium truncate mt-0.5 opacity-80">
                            {providerSummary}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <WudaoIconButton
                          onPress={() => void handleMove(index, -1)}
                          disabled={index === 0 || reordering}
                          tone="ghost"
                          className="h-8 w-8 text-system-gray-400 hover:text-foreground dark:text-system-gray-300 dark:hover:text-foreground-dark"
                          tooltip={t("common.move_up")}
                          aria-label={t("common.move_up")}
                        >
                          <ChevronUp size={16} />
                        </WudaoIconButton>
                        <WudaoIconButton
                          onPress={() => void handleMove(index, 1)}
                          disabled={index === providers.length - 1 || reordering}
                          tone="ghost"
                          className="h-8 w-8 text-system-gray-400 hover:text-foreground dark:text-system-gray-300 dark:hover:text-foreground-dark"
                          tooltip={t("common.move_down")}
                          aria-label={t("common.move_down")}
                        >
                          <ChevronDown size={16} />
                        </WudaoIconButton>
                        <div className="w-[1px] h-4 bg-black/5 dark:bg-white/5 mx-1" />
                        <WudaoIconButton
                          onPress={() => openEdit(p)}
                          tone="ghost"
                          className="h-8 w-8 text-system-gray-400 hover:text-apple-blue dark:text-system-gray-300"
                          tooltip={t("common.edit")}
                          aria-label={t("common.edit")}
                        >
                          <Edit size={16} />
                        </WudaoIconButton>
                        <WudaoIconButton
                          onPress={() => {
                            void remove(p.id);
                          }}
                          tone="ghost"
                          className="h-8 w-8 text-system-gray-400 hover:text-apple-red dark:text-system-gray-300"
                          tooltip={t("common.delete")}
                          aria-label={t("common.delete")}
                        >
                          <Trash2 size={16} />
                        </WudaoIconButton>
                      </div>
                    </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </WudaoCard>

          <footer className="text-center py-8 opacity-30">
             <div className="w-1 bg-system-gray-200 dark:bg-system-gray-700 h-6 mb-4 rounded-full mx-auto" />
             <p className="text-[9px] font-bold uppercase tracking-[0.2em]">{t('settings.config_panel')}</p>
          </footer>
        </div>
      </div>

      <WudaoModal
        isOpen={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        dialogClassName="w-full max-w-lg"
      >
                <WudaoModalHeader>
                   <h3 className="text-lg font-bold">{editingId ? t('settings.edit_provider') : t('settings.new_provider')}</h3>
                   <WudaoIconButton onPress={closeDialog} tone="ghost" className="h-8 w-8" tooltip={t("common.close")} aria-label={t("common.close")}>
                      <X size={18} />
                   </WudaoIconButton>
                </WudaoModalHeader>

                <WudaoModalBody className="max-h-[70vh] space-y-4 overflow-y-auto">
                   {error && (
                      <div className="rounded-apple-lg border border-apple-red/20 bg-apple-red/10 px-4 py-3 text-sm text-apple-red dark:border-apple-red/30 dark:bg-apple-red/15">
                         <div className="flex items-start gap-2">
                            <AlertCircle size={16} className="mt-0.5 shrink-0" />
                            <span>{error}</span>
                         </div>
                      </div>
                   )}

                   <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-system-gray-400 dark:text-system-gray-300">{t('settings.name')}</label>
                            <WudaoInput
                              className="w-full font-medium"
                              placeholder="Ollama Local"
                              value={form.name}
                              onChange={(e) => setForm({ ...form, name: e.target.value })}
                            />
                         </div>
                         <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-system-gray-400 dark:text-system-gray-300">{t('settings.model_id')}</label>
                            <WudaoInput
                              className="w-full font-medium"
                              placeholder="qwen2.5"
                              value={form.model}
                              onChange={(e) => setForm({ ...form, model: e.target.value })}
                            />
                         </div>
                      </div>

                      <div className="space-y-1.5">
                         <label className="text-[10px] font-bold uppercase tracking-wider text-system-gray-400 dark:text-system-gray-300">{t('settings.endpoint_url')}</label>
                         <WudaoInput
                           className="w-full tabular-nums"
                           placeholder="http://localhost:11434"
                           value={form.endpoint}
                           onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
                         />
                      </div>

                      <div className="space-y-1.5">
                         <label className="text-[10px] font-bold uppercase tracking-wider text-system-gray-400 dark:text-system-gray-300">{t('settings.api_key')}</label>
                         <WudaoInput
                           className="w-full"
                           placeholder="••••••••••••"
                           type="password"
                           value={form.api_key}
                           onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                         />
                      </div>

                      <div className="p-4 rounded-apple-xl bg-system-gray-50 dark:bg-black/40 border border-black/5 space-y-4">
                         <div className="flex items-center gap-2 mb-2">
                            <Shield size={14} className="text-apple-purple" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-system-gray-500 dark:text-system-gray-400">{t('settings.usage_tracking')}</span>
                         </div>
                         <div className="space-y-1.5">
                            <label className="text-[9px] font-bold uppercase tracking-wider text-system-gray-400 dark:text-system-gray-300">{t('settings.usage_auth_token')}</label>
                            <WudaoInput
                              className="w-full text-xs"
                              placeholder="JWT Token or similar"
                              type="password"
                              value={form.usage_auth_token}
                              onChange={(e) => setForm({ ...form, usage_auth_token: e.target.value })}
                            />
                         </div>
                         <div className="space-y-1.5">
                            <label className="text-[9px] font-bold uppercase tracking-wider text-system-gray-400 dark:text-system-gray-300">{t('settings.usage_cookie')}</label>
                            <WudaoTextArea
                              className="min-h-[60px] w-full resize-none text-xs"
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
                </WudaoModalBody>

                <WudaoModalFooter>
                   {hasChanges && (
                      <WudaoButton onPress={handleCancelChanges} tone="secondary" className="px-6">{t('settings.discard')}</WudaoButton>
                   )}
                   <WudaoButton
                     onPress={() => void handleSave()}
                     disabled={!canSave || saving}
                     tone="primary"
                     className="inline-flex min-w-[120px] items-center justify-center gap-2 px-8 shadow-apple-sm"
                   >
                     {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                     {saving ? t('common.loading') : editingId ? t('common.update') : t('common.save')}
                   </WudaoButton>
                </WudaoModalFooter>
      </WudaoModal>
    </div>
  );
}
