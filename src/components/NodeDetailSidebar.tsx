import {
  useLayoutEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { clampSidebarWidth } from "../lib/graph-area-layout";

interface NodeDetailSidebarProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Derived max width so the graph dock keeps the legend (or CSS) footprint. */
  maxWidthPx: number;
  /** Reports the width actually applied after clamping. */
  onAppliedWidthChange?: (width: number) => void;
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

export function NodeDetailSidebar({
  title,
  onClose,
  children,
  maxWidthPx,
  onAppliedWidthChange,
}: NodeDetailSidebarProps) {
  const [preferredWidth, setPreferredWidth] = useState<number>(loadStoredWidth);
  const width = clampSidebarWidth(preferredWidth, maxWidthPx, MIN_WIDTH);

  useLayoutEffect(() => {
    onAppliedWidthChange?.(width);
  }, [width, onAppliedWidthChange]);

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const startPreferred = preferredWidth;
    let latest = startWidth;

    const onMove = (moveEvent: PointerEvent) => {
      const delta = startX - moveEvent.clientX;
      latest = clampSidebarWidth(startWidth + delta, maxWidthPx, MIN_WIDTH);
      setPreferredWidth(latest);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      // Keep a preferred width at or above MIN_WIDTH so a later wider window
      // restores size after a constrained drag. Do not overwrite a larger
      // preferred width when the drag never reached MIN_WIDTH.
      const toStore =
        latest >= MIN_WIDTH ? latest : Math.max(startPreferred, MIN_WIDTH);
      window.localStorage?.setItem(WIDTH_STORAGE_KEY, String(toStore));
      setPreferredWidth(toStore);
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
