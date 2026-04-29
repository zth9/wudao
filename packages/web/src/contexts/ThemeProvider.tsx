import { useEffect, useRef } from "react";
import { useSettingsStore } from "../stores/settingsStore";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSettingsStore((s) => s.theme);
  const isFirstRender = useRef(true);

  useEffect(() => {
    const root = window.document.documentElement;
    
    const applyTheme = (resolvedTheme: 'light' | 'dark') => {
      // If not first render, add transition class
      if (!isFirstRender.current) {
        root.classList.add("theme-transition");
        // Remove after a reasonable duration
        const timer = setTimeout(() => {
          root.classList.remove("theme-transition");
        }, 500);

        root.classList.remove("light", "dark");
        root.classList.add(resolvedTheme);
        root.dataset.theme = resolvedTheme;

        return () => clearTimeout(timer);
      } else {
        // First render, just apply (it should already be applied by inline script but let's be safe)
        root.classList.remove("light", "dark");
        root.classList.add(resolvedTheme);
        root.dataset.theme = resolvedTheme;
        isFirstRender.current = false;
      }
    };

    if (theme === 'system') {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const handleMediaChange = () => {
        applyTheme(media.matches ? "dark" : "light");
      };
      
      handleMediaChange();
      media.addEventListener("change", handleMediaChange);
      return () => media.removeEventListener("change", handleMediaChange);
    } else {
      applyTheme(theme);
    }
  }, [theme]);

  return <>{children}</>;
}
