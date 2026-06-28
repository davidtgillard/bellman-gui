import type { ReactNode } from "react";

interface NodeDetailSidebarProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function NodeDetailSidebar({ title, onClose, children }: NodeDetailSidebarProps) {
  return (
    <aside className="node-detail-sidebar" aria-label="Node details">
      <header className="node-detail-sidebar-bar">
        <h2 className="node-detail-sidebar-title">{title}</h2>
        <button
          type="button"
          className="node-detail-sidebar-close"
          onClick={onClose}
          aria-label="Close node details"
        >
          ×
        </button>
      </header>
      <div className="node-detail-sidebar-body">{children}</div>
    </aside>
  );
}
