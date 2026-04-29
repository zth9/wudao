import { Spinner } from "@heroui/react/spinner";
import { cn } from "../utils/cn";

interface LoadingIndicatorProps {
  className?: string;
  size?: number;
  text?: string;
}

export function LoadingIndicator({ className, size = 24, text }: LoadingIndicatorProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center p-8 gap-3", className)}>
      <Spinner size={size >= 32 ? "lg" : "md"} />
      {text && (
        <p className="text-xs font-bold uppercase tracking-widest text-muted animate-pulse">
          {text}
        </p>
      )}
    </div>
  );
}
