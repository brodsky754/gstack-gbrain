'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';

export type ToastSeverity = 'info' | 'success' | 'error';

export interface ToastMessage {
  id: string;
  message: string;
  severity: ToastSeverity;
  ttlMs: number;
}

interface ToastContextValue {
  toast: (message: string, opts?: { severity?: ToastSeverity; ttlMs?: number }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback so a missing provider doesn't crash the client. Logs to console
    // so the dev can fix it.
    return {
      toast: (msg) => {
        // eslint-disable-next-line no-console
        console.warn('[toast] no <ToastProvider>; message dropped:', msg);
      },
    };
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const toast = useCallback<ToastContextValue['toast']>((message, opts = {}) => {
    const id = Math.random().toString(36).slice(2, 9);
    const severity = opts.severity ?? 'info';
    const ttlMs = opts.ttlMs ?? 4_000;
    setToasts((prev) => [...prev, { id, message, severity, ttlMs }]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />
    </ToastContext.Provider>
  );
}

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="fixed top-6 right-6 z-50 flex flex-col gap-2 max-w-md pointer-events-none">
      {toasts.map((t) => (
        <Toast key={t.id} {...t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function Toast({
  id,
  message,
  severity,
  ttlMs,
  onDismiss,
}: ToastMessage & { onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, ttlMs);
    return () => clearTimeout(t);
  }, [ttlMs, onDismiss]);

  const tone = {
    info: 'border-accent/40 bg-accent/10',
    success: 'border-status-active/40 bg-status-active/10',
    error: 'border-status-errored/40 bg-status-errored/10',
  }[severity];

  const dotTone = {
    info: 'bg-accent',
    success: 'bg-status-active',
    error: 'bg-status-errored',
  }[severity];

  return (
    <div
      role="status"
      className={`card pointer-events-auto cursor-pointer ${tone} flex items-start gap-3 animate-in slide-in-from-right duration-200`}
      onClick={onDismiss}
    >
      <span className={`status-dot mt-1.5 ${dotTone}`} />
      <span className="text-sm flex-1">{message}</span>
    </div>
  );
}
