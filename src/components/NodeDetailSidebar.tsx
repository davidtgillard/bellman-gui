import { useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

interface NodeDetailSidebarProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

const WIDTH_STORAGE_KEY = "bellman:node-detail-width";
const MIN_WIDTH = 320;
const DEFAULT_WIDTH = 520;

function loadStoredWidth(): number {
  if (typeof window === "undefined") {
    return DEFAULT_WIDTH;
  }
  const raw = window.localStorage?.getItem(WIDTH_STORAGE_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= MIN_WIDTH ? parsed : DEFAULT_WIDTH;
}

function maxWidth(): number {
  if (typeof window === "undefined") {
    return 900;
  }
  return Math.max(MIN_WIDTH, Math.round(window.innerWidth * 0.7));
}

export function NodeDetailSidebar({ title, onClose, children }: NodeDetailSidebarProps) {
  const [width, setWidth] = useState<number>(loadStoredWidth);

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    let latest = startWidth;

    const onMove = (moveEvent: PointerEvent) => {
      const delta = startX - moveEvent.clientX;
      latest = Math.min(maxWidth(), Math.max(MIN_WIDTH, startWidth + delta));
      setWidth(latest);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      window.localStorage?.setItem(WIDTH_STORAGE_KEY, String(latest));
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <aside
      className="node-detail-sidebar"
      aria-label="Node details"
      style={{ flexBasis: `${width}px`, width: `${width}px` }}
    >
      <div
        className="node-detail-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize node details"
        onPointerDown={startResize}
      />
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
