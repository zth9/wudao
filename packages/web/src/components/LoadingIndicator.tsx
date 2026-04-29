import { cn } from "../utils/cn";
import { WudaoSpinner } from "./ui/heroui";

interface LoadingIndicatorProps {
  className?: string;
  size?: number;
  text?: string;
}

export function LoadingIndicator({ className, size = 24, text }: LoadingIndicatorProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center p-8 gap-3", className)}>
      <WudaoSpinner size={size >= 32 ? "lg" : "md"} />
      {text && (
        <p className="text-xs font-bold uppercase tracking-widest text-system-gray-400 dark:text-system-gray-300 animate-pulse">
          {text}
        </p>
      )}
    </div>
  );
}
