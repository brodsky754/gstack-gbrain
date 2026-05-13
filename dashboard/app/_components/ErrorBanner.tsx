export function ErrorBanner({ title, message }: { title: string; message: string }) {
  return (
    <div className="bg-status-errored/10 border-b border-status-errored/40 text-text px-6 py-3">
      <strong className="text-status-errored mr-2">{title}:</strong>
      <span className="text-text-muted">{message}</span>
    </div>
  );
}
