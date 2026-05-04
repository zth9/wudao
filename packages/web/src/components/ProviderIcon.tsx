import { Globe } from "lucide-react";

const PROVIDER_ICONS: Record<string, string> = {
  claude: "/providers/claude.svg",
  openai: "/providers/openai.png",
  gemini: "/providers/google.png",
  glm: "/providers/glm.png",
  kimi: "/providers/kimi.png",
  minimax: "/providers/minimax.png",
  deepseek: "/providers/deepseek.png",
  qwen: "/providers/qwen.png",
};

const NAME_TO_ID: Record<string, string> = {
  claude: "claude",
  openai: "openai",
  gemini: "gemini",
  "google gemini": "gemini",
  glm: "glm",
  "智谱 glm": "glm",
  "智谱": "glm",
  kimi: "kimi",
  minimax: "minimax",
  deepseek: "deepseek",
  qwen: "qwen",
  "通义千问": "qwen",
};

export function getProviderIconSrc(providerIdOrName: string): string | undefined {
  const id = providerIdOrName.toLowerCase();
  return PROVIDER_ICONS[id] ?? PROVIDER_ICONS[NAME_TO_ID[id] ?? ""];
}

interface ProviderIconProps {
  providerId: string;
  size?: number;
  className?: string;
}

export function ProviderIcon({ providerId, size = 20, className }: ProviderIconProps) {
  const src = getProviderIconSrc(providerId);
  if (!src) {
    return <Globe size={size} className={className} />;
  }
  return (
    <img
      src={src}
      alt={providerId}
      width={size}
      height={size}
      className={className}
      draggable={false}
    />
  );
}
