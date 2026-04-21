/**
 * Tiny module-scoped toast system. Any component can call `showToast("...")`
 * and a temporary notification appears in the bottom-right. Kept intentionally
 * minimal so we don't need a full UI library for a few confirmation messages.
 */
import { useEffect, useState } from 'react';

type Listener = (toast: Toast) => void;

interface Toast {
  id: number;
  message: string;
}

let nextId = 1;
const listeners = new Set<Listener>();

export function showToast(message: string): void {
  const toast: Toast = { id: nextId++, message };
  listeners.forEach((l) => l(toast));
}

export function Toaster(): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const onToast: Listener = (t) => {
      setToasts((prev) => [...prev, t]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, 2000);
    };
    listeners.add(onToast);
    return () => { listeners.delete(onToast); };
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto rounded-button bg-surface-elevated px-4 py-2 text-sm text-text-primary shadow-lg border border-border-subtle"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
