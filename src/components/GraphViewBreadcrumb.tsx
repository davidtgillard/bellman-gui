interface GraphViewBreadcrumbProps {
  projectLabel: string;
  onBack: () => void;
}

export function GraphViewBreadcrumb({
  projectLabel,
  onBack,
}: GraphViewBreadcrumbProps) {
  return (
    <div className="graph-view-breadcrumb">
      <button type="button" className="graph-view-back" onClick={onBack}>
        Top level
      </button>
      <span className="graph-view-separator" aria-hidden="true">
        /
      </span>
      <span className="graph-view-current">{projectLabel} work packages</span>
    </div>
  );
}
