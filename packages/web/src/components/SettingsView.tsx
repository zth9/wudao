import { useEffect, useMemo, useState, useRef } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import type { Provider } from "../services/api";
import { Plus, Settings as SettingsIcon, Trash2, Edit, ChevronUp, ChevronDown, Check, X, Shield, Globe, Cpu, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { cn } from "../utils/cn";

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
    <label
      className={cn(
        "flex items-center gap-3 rounded-apple-xl border px-3 py-3 transition-all cursor-pointer group",
        checked
          ? "border-apple-blue/20 bg-apple-blue/10 dark:border-apple-blue/30 dark:bg-apple-blue/15"
          : "border-black/5 bg-system-gray-50/90 hover:bg-black/5 dark:border-white/12 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]",
      )}
    >
      <div
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-apple transition-all",
          checked
            ? "bg-apple-blue text-white shadow-apple-sm"
            : "border-2 border-system-gray-300 bg-white dark:border-white/35 dark:bg-white/[0.03]",
        )}
      >
        {checked ? <Check size={14} /> : null}
      </div>
      <input
        type="checkbox"
        className="hidden"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-sm font-semibold text-system-gray-700 transition-colors group-hover:text-apple-blue dark:text-system-gray-100">
        {label}
      </span>
    </label>
  );
}

export default function SettingsView() {
  const { t } = useTranslation();
  const { 
    providers, 
    loading, 
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
    } catch (err) {
      console.error("Avatar upload failed:", err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = (p: Provider) => {
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
    setDialogOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (editingId) {
      await update(editingId, form);
    } else {
      await create(form);
    }
    closeDialog();
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

  const canSave = form.name && form.endpoint && form.model;

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
          <section className="apple-card overflow-hidden">
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
                   <div 
                     onClick={() => fileInputRef.current?.click()}
                     className="w-24 h-24 rounded-full bg-apple-blue/10 border-4 border-white dark:border-system-gray-800 shadow-apple-lg flex items-center justify-center text-4xl overflow-hidden relative group cursor-pointer"
                   >
                      {user.avatar && (user.avatar.includes('/') || user.avatar.includes('\\') || user.avatar.startsWith('http') || user.avatar.startsWith('file:') || user.avatar.startsWith('data:')) ? (
                        <img src={user.avatar} alt="avatar" className="w-full h-full object-cover" />
                      ) : (
                        <span>{user.avatar || "👨‍💻"}</span>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                         {uploading ? <Loader2 size={24} className="text-white animate-spin" /> : <Plus size={24} className="text-white" />}
                      </div>
                   </div>
                   <div className="flex flex-wrap gap-1.5 justify-center max-w-[200px]">
                      {defaultAvatars.map(av => (
                        <button
                          key={av}
                          onClick={() => setUser({ avatar: av })}
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-lg hover:bg-black/5 dark:hover:bg-white/5 transition-all border",
                            user.avatar === av ? "border-apple-blue bg-apple-blue/10" : "border-transparent"
                          )}
                        >
                          {av}
                        </button>
                      ))}
                   </div>
                </div>

                {/* Profile Fields */}
                <div className="flex-1 space-y-4 w-full">
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-system-gray-500 dark:text-system-gray-400 px-1">{t('settings.nickname')}</label>
                      <input
                        className="apple-input w-full font-bold text-lg px-4 py-2"
                        placeholder="Your Nickname"
                        value={user.nickname}
                        onChange={(e) => setUser({ nickname: e.target.value })}
                      />
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-system-gray-500 dark:text-system-gray-400 px-1">{t('settings.avatar_url')}</label>
                      <input
                        className="apple-input w-full text-xs font-medium px-4 py-2"
                        placeholder="https://example.com/avatar.png"
                        value={user.avatar && user.avatar.startsWith('http') ? user.avatar : ""}
                        onChange={(e) => setUser({ avatar: e.target.value })}
                      />
                   </div>
                </div>
             </div>
          </section>

          <section className="apple-card overflow-hidden">
            <div className="px-6 py-4 border-b border-black/5 dark:border-white/10 flex items-center justify-between bg-white/50 dark:bg-black/40">
              <div className="flex items-center gap-2">
                <Cpu size={16} className="text-apple-blue" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-system-gray-500 dark:text-system-gray-400">{t('settings.model_providers')}</h2>
              </div>
              <button
                onClick={openCreate}
                className="apple-btn-primary py-1 px-3 text-xs flex items-center gap-1.5 shadow-sm"
              >
                <Plus size={14} />
                <span>{t('settings.add_provider')}</span>
              </button>
            </div>

            <div className="divide-y divide-black/5 dark:divide-white/5">
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
                        <button
                          onClick={() => handleMove(index, -1)}
                          disabled={index === 0 || reordering}
                          className="p-1.5 rounded-apple text-system-gray-400 dark:text-system-gray-300 hover:text-foreground dark:hover:text-foreground-dark disabled:opacity-30"
                        >
                          <ChevronUp size={16} />
                        </button>
                        <button
                          onClick={() => handleMove(index, 1)}
                          disabled={index === providers.length - 1 || reordering}
                          className="p-1.5 rounded-apple text-system-gray-400 dark:text-system-gray-300 hover:text-foreground dark:hover:text-foreground-dark disabled:opacity-30"
                        >
                          <ChevronDown size={16} />
                        </button>
                        <div className="w-[1px] h-4 bg-black/5 dark:bg-white/5 mx-1" />
                        <button
                          onClick={() => openEdit(p)}
                          className="p-1.5 rounded-apple text-system-gray-400 dark:text-system-gray-300 hover:text-apple-blue transition-colors"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => remove(p.id)}
                          className="p-1.5 rounded-apple text-system-gray-400 dark:text-system-gray-300 hover:text-apple-red transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <footer className="text-center py-8 opacity-30">
             <div className="w-1 bg-system-gray-200 dark:bg-system-gray-700 h-6 mb-4 rounded-full mx-auto" />
             <p className="text-[9px] font-bold uppercase tracking-[0.2em]">{t('settings.config_panel')}</p>
          </footer>
        </div>
      </div>

      <AnimatePresence>
        {dialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
               onClick={closeDialog} 
             />
             <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="relative w-full max-w-lg bg-white dark:bg-background-dark-secondary rounded-apple-2xl shadow-apple-lg overflow-hidden border border-black/5 dark:border-white/10"
             >
                <div className="px-6 py-4 apple-glass border-b flex items-center justify-between">
                   <h3 className="text-lg font-bold">{editingId ? t('settings.edit_provider') : t('settings.new_provider')}</h3>
                   <button onClick={closeDialog} className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                      <X size={18} />
                   </button>
                </div>

                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                   <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-system-gray-400 dark:text-system-gray-300">{t('settings.name')}</label>
                            <input
                              className="apple-input w-full font-medium"
                              placeholder="Ollama Local"
                              value={form.name}
                              onChange={(e) => setForm({ ...form, name: e.target.value })}
                            />
                         </div>
                         <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-system-gray-400 dark:text-system-gray-300">{t('settings.model_id')}</label>
                            <input
                              className="apple-input w-full font-medium"
                              placeholder="qwen2.5"
                              value={form.model}
                              onChange={(e) => setForm({ ...form, model: e.target.value })}
                            />
                         </div>
                      </div>

                      <div className="space-y-1.5">
                         <label className="text-[10px] font-bold uppercase tracking-wider text-system-gray-400 dark:text-system-gray-300">{t('settings.endpoint_url')}</label>
                         <input
                           className="apple-input w-full tabular-nums"
                           placeholder="http://localhost:11434"
                           value={form.endpoint}
                           onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
                         />
                      </div>

                      <div className="space-y-1.5">
                         <label className="text-[10px] font-bold uppercase tracking-wider text-system-gray-400 dark:text-system-gray-300">{t('settings.api_key')}</label>
                         <input
                           className="apple-input w-full"
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
                            <input
                              className="apple-input w-full text-xs"
                              placeholder="JWT Token or similar"
                              type="password"
                              value={form.usage_auth_token}
                              onChange={(e) => setForm({ ...form, usage_auth_token: e.target.value })}
                            />
                         </div>
                         <div className="space-y-1.5">
                            <label className="text-[9px] font-bold uppercase tracking-wider text-system-gray-400 dark:text-system-gray-300">{t('settings.usage_cookie')}</label>
                            <textarea
                              className="apple-input w-full text-xs min-h-[60px] resize-none"
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
                </div>

                <div className="p-6 border-t border-black/5 dark:border-white/10 flex gap-3 justify-end bg-system-gray-50/50 dark:bg-black/40">
                   {hasChanges && (
                      <button onClick={handleCancelChanges} className="apple-btn-secondary px-6">{t('settings.discard')}</button>
                   )}
                   <button
                     onClick={handleSave}
                     disabled={!canSave}
                     className="apple-btn-primary px-8 shadow-apple-sm min-w-[120px]"
                   >
                     {editingId ? t('common.update') : t('common.save')}
                   </button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
