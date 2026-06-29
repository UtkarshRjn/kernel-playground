"use client";

import { Moon, Sun } from "lucide-react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";

type Mode = "light" | "dark";

const ThemeCtx = createContext<{ mode: Mode; toggle: () => void }>({
  mode: "light",
  toggle: () => {},
});

export function useTheme() {
  return useContext(ThemeCtx);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("light");

  // Sync from the class the no-flash inline script already applied.
  useEffect(() => {
    setMode(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  function toggle() {
    setMode((prev) => {
      const next: Mode = prev === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      try {
        localStorage.setItem("kp-theme", next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return <ThemeCtx.Provider value={{ mode, toggle }}>{children}</ThemeCtx.Provider>;
}

export function ThemeToggle() {
  const { mode, toggle } = useTheme();
  return (
    <button className="theme-toggle" onClick={toggle} title="Toggle theme" aria-label="Toggle theme">
      {mode === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

export function ThemedToaster() {
  const { mode } = useTheme();
  return <Toaster theme={mode} position="bottom-right" richColors closeButton />;
}
