import { useLayoutEffect, useState, type RefObject } from "react";
import {
  legendFitsInDock,
  maxSidebarWidthForLegend,
  measureLegendNeedWidth,
  measureLegendNeedWidthFromCss,
} from "../lib/graph-area-layout";

export interface GraphAreaLayout {
  graphAreaWidth: number;
  legendNeedWidth: number;
  maxSidebarWidth: number;
  legendFits: boolean;
}

const EMPTY_LAYOUT: GraphAreaLayout = {
  graphAreaWidth: 0,
  legendNeedWidth: 0,
  // Avoid collapsing the sidebar to 0 before the first measurement.
  maxSidebarWidth: Number.POSITIVE_INFINITY,
  legendFits: true,
};

/**
 * Derive sidebar max width and legend visibility from measured graph-area and
 * legend footprint (no hard-coded viewport breakpoints).
 * @param graphAreaRef - Ref to the `.graph-area` flex row.
 * @param legendMeasureRef - Ref to the legend element when mounted.
 * @param sidebarOpen - Whether the node detail sidebar is open.
 * @param appliedSidebarWidth - Sidebar width currently applied (0 when closed).
 * @param legendMounted - True when a legend measure element is expected in the dock.
 * @returns Measured layout constraints for the sidebar and legend.
 */
export function useGraphAreaLayout(
  graphAreaRef: RefObject<HTMLElement | null>,
  legendMeasureRef: RefObject<HTMLElement | null>,
  sidebarOpen: boolean,
  appliedSidebarWidth: number,
  legendMounted: boolean,
): GraphAreaLayout {
  const [layout, setLayout] = useState<GraphAreaLayout>(EMPTY_LAYOUT);

  useLayoutEffect(() => {
    const area = graphAreaRef.current;
    if (!area) {
      return;
    }

    const measure = () => {
      const graphAreaWidth = area.clientWidth;
      const legendEl = legendMeasureRef.current;
      const legendNeedWidth = legendEl
        ? measureLegendNeedWidth(legendEl)
        : measureLegendNeedWidthFromCss(area);

      const maxSidebarWidth = maxSidebarWidthForLegend(
        graphAreaWidth,
        legendNeedWidth,
      );
      const dockWidth = sidebarOpen
        ? Math.max(0, graphAreaWidth - appliedSidebarWidth)
        : graphAreaWidth;
      const legendFits = legendFitsInDock(dockWidth, legendNeedWidth);

      setLayout((prev) => {
        if (
          prev.graphAreaWidth === graphAreaWidth &&
          prev.legendNeedWidth === legendNeedWidth &&
          prev.maxSidebarWidth === maxSidebarWidth &&
          prev.legendFits === legendFits
        ) {
          return prev;
        }
        return {
          graphAreaWidth,
          legendNeedWidth,
          maxSidebarWidth,
          legendFits,
        };
      });
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(area);
    const legendEl = legendMeasureRef.current;
    if (legendEl) {
      observer.observe(legendEl);
    }

    return () => {
      observer.disconnect();
    };
  }, [
    graphAreaRef,
    legendMeasureRef,
    sidebarOpen,
    appliedSidebarWidth,
    legendMounted,
  ]);

  return layout;
}
