import { useMemo, useState, type FormEvent } from "react";
import {
  compatibleLinkTypes,
  nodeLabel,
  type GraphNode,
  type LinkTypeMeta,
} from "../lib/graph";
import {
  compatibleHardnesses,
  compatibleRelations,
  inspectRelation,
  kindLabel,
  parseCompatibleLinkTypes,
  resolveLinkTypeId,
  uniqueCompatibleKinds,
  type LinkHardness,
  type LinkKind,
  type LinkRelation,
} from "../lib/link-display";

interface CreateLinkTypePopoverProps {
  source: string;
  target: string;
  nodes: GraphNode[];
  linkTypes: LinkTypeMeta[];
  saving: boolean;
  onClose: () => void;
  onCreate: (input: {
    linkType: string;
    source: string;
    target: string;
  }) => void;
}

/**
 * Picks kind / relation / hardness after both link endpoints are known.
 * @param props - Endpoints, registry types, and create callback.
 * @param props.source - Start node id.
 * @param props.target - Finish node id.
 * @param props.nodes - Graph nodes in the current view.
 * @param props.linkTypes - Registry link types.
 * @param props.saving - Whether create-link is in flight.
 * @param props.onClose - Dismisses the popover and stays in linking mode.
 * @param props.onCreate - Creates the link with the chosen type.
 * @returns Floating type-picker dialog.
 */
export function CreateLinkTypePopover({
  source,
  target,
  nodes,
  linkTypes,
  saving,
  onClose,
  onCreate,
}: CreateLinkTypePopoverProps) {
  const [kind, setKind] = useState<LinkKind | "">("");
  const [relation, setRelation] = useState<LinkRelation | "">("");
  const [hardness, setHardness] = useState<LinkHardness | "">("");

  const startNode = nodes.find((node) => node.id === source);
  const finishNode = nodes.find((node) => node.id === target);

  const compatibleTypes = useMemo(() => {
    if (!startNode || !finishNode) {
      return [];
    }
    return [...compatibleLinkTypes(linkTypes, startNode.type, finishNode.type)].sort(
      (left, right) => left.link_type.localeCompare(right.link_type),
    );
  }, [finishNode, linkTypes, startNode]);

  const parsedCompatible = useMemo(
    () => parseCompatibleLinkTypes(compatibleTypes),
    [compatibleTypes],
  );
  const kinds = uniqueCompatibleKinds(parsedCompatible);
  const validKind =
    kind && kinds.includes(kind) ? kind : kinds.length === 1 ? kinds[0] : "";
  const relations =
    validKind === "precedes" ? compatibleRelations(parsedCompatible, validKind) : [];
  const validRelation =
    validKind === "precedes"
      ? relation && relations.includes(relation)
        ? relation
        : relations.length === 1
          ? relations[0]
          : ""
      : "";
  const hardnesses =
    validKind === "precedes"
      ? compatibleHardnesses(parsedCompatible, validKind, validRelation || null)
      : [];
  const validHardness =
    validKind === "precedes"
      ? hardness && hardnesses.includes(hardness)
        ? hardness
        : hardnesses.length === 1
          ? hardnesses[0]
          : ""
      : "";
  const validLinkType =
    validKind === "precedes"
      ? resolveLinkTypeId(
          compatibleTypes,
          validKind,
          validRelation || null,
          validHardness || null,
        ) ?? ""
      : validKind
        ? (resolveLinkTypeId(compatibleTypes, validKind) ?? "")
        : "";

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!source || !target || !validLinkType) {
      return;
    }
    onCreate({ linkType: validLinkType, source, target });
  };

  return (
    <div className="link-type-popover-layer">
      <dialog
        className="edit-dialog link-type-popover"
        open
        aria-labelledby="create-link-type-title"
        onClick={(event) => event.stopPropagation()}
        onClose={onClose}
      >
        <form onSubmit={handleSubmit}>
          <header className="edit-dialog-header">
            <h2 id="create-link-type-title">Link type</h2>
            <button type="button" className="dialog-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </header>

          <p className="link-type-popover-endpoints">
            {startNode ? nodeLabel(startNode.id) : source} →{" "}
            {finishNode ? nodeLabel(finishNode.id) : target}
          </p>

          <label className="edit-field">
            <span>Kind</span>
            <select
              id="create-link-kind"
              value={validKind}
              onChange={(event) => {
                setKind(event.target.value as LinkKind);
                setRelation("");
                setHardness("");
              }}
              required
              disabled={kinds.length === 0}
            >
              <option value="" disabled>
                {kinds.length === 0 ? "No compatible link types" : "Select kind…"}
              </option>
              {kinds.map((item) => (
                <option key={item} value={item}>
                  {kindLabel(item)}
                </option>
              ))}
            </select>
          </label>

          {validKind === "precedes" ? (
            <>
              <label className="edit-field">
                <span>Relation</span>
                <select
                  id="create-link-relation"
                  value={validRelation}
                  onChange={(event) =>
                    setRelation(event.target.value as LinkRelation)
                  }
                  required
                  disabled={relations.length === 0}
                >
                  <option value="" disabled>
                    Select relation…
                  </option>
                  {relations.map((item) => (
                    <option key={item} value={item}>
                      {inspectRelation(item)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="edit-field">
                <span>Hardness</span>
                <select
                  id="create-link-hardness"
                  value={validHardness}
                  onChange={(event) =>
                    setHardness(event.target.value as LinkHardness)
                  }
                  required
                  disabled={hardnesses.length === 0}
                >
                  <option value="" disabled>
                    Select hardness…
                  </option>
                  {hardnesses.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}

          <footer className="edit-dialog-actions">
            <button type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" disabled={saving || !validLinkType}>
              {saving ? "Creating…" : "Create link"}
            </button>
          </footer>
        </form>
      </dialog>
    </div>
  );
}
