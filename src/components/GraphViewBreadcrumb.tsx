interface GraphViewBreadcrumbProps {
  labels: string[];
  onBack: () => void;
}

export function GraphViewBreadcrumb({ labels, onBack }: GraphViewBreadcrumbProps) {
  if (labels.length <= 1) {
    return null;
  }

  const current = labels[labels.length - 1];

  return (
    <div className="graph-view-breadcrumb">
      <button type="button" className="graph-view-back" onClick={onBack}>
        Back
      </button>
      <span className="graph-view-separator" aria-hidden="true">
        /
      </span>
      <span className="graph-view-trail" aria-label="Graph view trail">
        {labels.slice(0, -1).map((label) => (
          <span key={label} className="graph-view-trail-segment">
            {label}
          </span>
        ))}
      </span>
      {labels.length > 2 ? (
        <span className="graph-view-separator" aria-hidden="true">
          /
        </span>
      ) : null}
      <span className="graph-view-current">{current}</span>
    </div>
  );
}
