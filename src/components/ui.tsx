import type { ReactNode } from 'react';

export function SourceBadge({ source }: { source: string }) {
  const map: Record<string, [string, string]> = {
    on_device: ['On-device', 'b-device'],
    in_cloud: ['Cloud', 'b-cloud'],
    blocked: ['Blocked', 'b-muted'],
    error: ['Error', 'b-error'],
    manual: ['Written by agent', 'b-muted'],
  };
  const [label, cls] = map[source] ?? [source, 'b-muted'];
  return <span className={`badge ${cls}`}><span className="dot" />{label}</span>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}

export const Icon = {
  inbox: <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M2 9.5V12a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 14 12V9.5M2 9.5 3.6 3.6A1.5 1.5 0 0 1 5 2.5h6a1.5 1.5 0 0 1 1.4 1.1L14 9.5M2 9.5h3.5l1 1.5h3l1-1.5H14"/></svg>,
  rules: <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M3 4h10M3 8h10M3 12h6"/></svg>,
  ledger: <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M8 1.8 2.8 4v3.6c0 3 2.2 5.6 5.2 6.6 3-1 5.2-3.6 5.2-6.6V4L8 1.8Z"/><path d="m5.8 8 1.6 1.6 2.9-3"/></svg>,
  settings: <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="8" cy="8" r="2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/></svg>,
  spark: <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 1l1.6 4.4L14 7l-4.4 1.6L8 13l-1.6-4.4L2 7l4.4-1.6z"/></svg>,
  chip: <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="4" y="4" width="8" height="8" rx="1.5"/><path d="M6 1.5V4M10 1.5V4M6 12v2.5M10 12v2.5M1.5 6H4M1.5 10H4M12 6h2.5M12 10h2.5"/></svg>,
  cloud: <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M4.5 12.5a3 3 0 0 1-.3-6A4 4 0 0 1 12 6a2.8 2.8 0 0 1 .3 5.6l-.3.9h-7.5Z"/></svg>,
  wifi: <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M1.5 6a9.5 9.5 0 0 1 13 0M3.8 8.6a6 6 0 0 1 8.4 0M6.1 11.1a2.6 2.6 0 0 1 3.8 0"/><circle cx="8" cy="13.2" r=".6" fill="currentColor"/></svg>,
};
