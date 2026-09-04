import { nodeTypeLabel, type LinkTypeMeta } from "./graph";

export type LinkKind =
  | "precedes"
  | "parent_of"
  | "supports"
  | "targets"
  | "promoted_from"
  | "other";

export type LinkRelation = "FS" | "FF" | "SS" | "SF";
export type LinkHardness = "Mandatory" | "Discretionary" | "Optional";

export interface ParsedLinkType {
  linkType: string;
  kind: LinkKind;
  relation: LinkRelation | null;
  hardness: LinkHardness | null;
  scoped: boolean;
}

export const LINK_KIND_ORDER: LinkKind[] = [
  "precedes",
  "parent_of",
  "supports",
  "targets",
  "promoted_from",
  "other",
];

export const LINK_RELATION_ORDER: LinkRelation[] = ["FS", "FF", "SS", "SF"];

export const LINK_HARDNESS_ORDER: LinkHardness[] = [
  "Mandatory",
  "Discretionary",
  "Optional",
];

export const LINK_KIND_COLORS: Record<LinkKind, string> = {
  precedes: "#64748b",
  parent_of: "#94a3b8",
  supports: "#a855f7",
  targets: "#eab308",
  promoted_from: "#3b82f6",
  other: "#64748b",
};

export interface LinkHardnessVisual {
  lineStyle: "solid" | "dashed" | "dotted";
  width: number;
  opacity: number;
}

const RELATIONS = new Set<string>(LINK_RELATION_ORDER);
const HARDNESSES = new Set<string>(LINK_HARDNESS_ORDER);

const RELATION_PHRASE: Record<LinkRelation, string> = {
  FS: "finish-to-start",
  FF: "finish-to-finish",
  SS: "start-to-start",
  SF: "start-to-finish",
};

const KIND_LABEL: Record<Exclude<LinkKind, "other">, string> = {
  precedes: "Precedence",
  parent_of: "Parent of",
  supports: "Supports",
  targets: "Targets",
  promoted_from: "Promoted from",
};

/**
 * Parses a registry link type id into kind, relation, and hardness.
 * @param linkType - Wire id such as `precedes_FS_Mandatory_scope`.
 * @returns Structured display fields for the link type.
 */
export function parseLinkType(linkType: string): ParsedLinkType {
  if (linkType === "parent_of") {
    return {
      linkType,
      kind: "parent_of",
      relation: null,
      hardness: null,
      scoped: false,
    };
  }
  if (linkType === "supports" || linkType === "supports_wp") {
    return {
      linkType,
      kind: "supports",
      relation: null,
      hardness: null,
      scoped: false,
    };
  }
  if (linkType === "targets" || linkType === "targets_wp") {
    return {
      linkType,
      kind: "targets",
      relation: null,
      hardness: null,
      scoped: false,
    };
  }
  if (linkType === "promoted_from") {
    return {
      linkType,
      kind: "promoted_from",
      relation: null,
      hardness: null,
      scoped: false,
    };
  }

  const precedes = parsePrecedesLinkType(linkType);
  if (precedes) {
    return precedes;
  }

  return {
    linkType,
    kind: "other",
    relation: null,
    hardness: null,
    scoped: false,
  };
}

function parsePrecedesLinkType(linkType: string): ParsedLinkType | null {
  const rest = linkType.startsWith("precedes_")
    ? linkType.slice("precedes_".length)
    : null;
  if (rest === null) {
    return null;
  }
  const scoped = rest.endsWith("_scope");
  const body = scoped ? rest.slice(0, -"_scope".length) : rest;
  const separator = body.indexOf("_");
  if (separator < 0) {
    return null;
  }
  const relation = body.slice(0, separator);
  const hardness = body.slice(separator + 1);
  if (!RELATIONS.has(relation) || !HARDNESSES.has(hardness)) {
    return null;
  }
  return {
    linkType,
    kind: "precedes",
    relation: relation as LinkRelation,
    hardness: hardness as LinkHardness,
    scoped,
  };
}

/**
 * Returns the short canvas badge for a parsed link type.
 * FS and non-precedence links stay unlabeled.
 * @param parsed - Parsed link type.
 * @returns Two-letter relation, or an empty string.
 */
export function canvasLabel(parsed: ParsedLinkType): string {
  if (parsed.kind !== "precedes" || parsed.relation === null || parsed.relation === "FS") {
    return "";
  }
  return parsed.relation;
}

/**
 * Returns the inspector heading for a parsed link type.
 * @param parsed - Parsed link type.
 * @returns Sentence-form title such as `Mandatory finish-to-start`.
 */
export function inspectTitle(parsed: ParsedLinkType): string {
  if (parsed.kind === "precedes" && parsed.hardness && parsed.relation) {
    return `${parsed.hardness} ${RELATION_PHRASE[parsed.relation]}`;
  }
  return inspectKind(parsed);
}

/**
 * Returns the human kind name for a parsed link type.
 * @param parsed - Parsed link type.
 * @returns Display name such as `Precedence` or `Supports`.
 */
/**
 * Returns the human name for a link kind.
 * @param kind - Display kind.
 * @returns Name such as `Precedence`.
 */
export function kindLabel(kind: LinkKind): string {
  if (kind === "other") {
    return "Other";
  }
  return KIND_LABEL[kind];
}

/**
 * Returns the inspector kind label for a parsed link type.
 * Unknown types use a title-cased fallback of the wire id.
 * @param parsed - Parsed link type.
 * @returns Display name such as `Precedence` or `Custom Edge`.
 */
export function inspectKind(parsed: ParsedLinkType): string {
  if (parsed.kind === "other") {
    return nodeTypeLabel(parsed.linkType);
  }
  return kindLabel(parsed.kind);
}

/**
 * Returns the sentence-form relation phrase.
 * @param relation - PDM relation code.
 * @returns Phrase such as `Finish-to-start`.
 */
export function inspectRelation(relation: LinkRelation): string {
  const phrase = RELATION_PHRASE[relation];
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/**
 * Returns the context-menu remove label for a parsed link type.
 * @param parsed - Parsed link type.
 * @returns Label such as `Remove mandatory FS link`.
 */
export function removeLinkMenuLabel(parsed: ParsedLinkType): string {
  if (parsed.kind === "precedes" && parsed.hardness && parsed.relation) {
    return `Remove ${parsed.hardness.toLowerCase()} ${parsed.relation} link`;
  }
  return `Remove ${inspectKind(parsed).toLowerCase()} link`;
}

/**
 * Returns the stroke color for a link kind.
 * @param kind - Display kind.
 * @returns Hex color.
 */
export function linkKindColor(kind: LinkKind): string {
  return LINK_KIND_COLORS[kind];
}

/**
 * Returns line style, width, and opacity for a hardness value.
 * @param hardness - Precedence hardness, or null for non-precedence.
 * @returns Visual stroke parameters.
 */
export function linkHardnessVisual(hardness: LinkHardness | null): LinkHardnessVisual {
  if (hardness === "Discretionary") {
    return { lineStyle: "dashed", width: 2, opacity: 0.85 };
  }
  if (hardness === "Optional") {
    return { lineStyle: "dotted", width: 1.5, opacity: 0.7 };
  }
  return { lineStyle: "solid", width: 2.5, opacity: 1 };
}

/**
 * Builds Cytoscape edge data fields from a wire link type.
 * @param linkType - Registry link type id.
 * @returns Fields to merge onto an edge's `data`.
 */
export function edgeDisplayData(linkType: string): {
  label: string;
  kind: LinkKind;
  relation: string;
  hardness: string;
  linkType: string;
} {
  const parsed = parseLinkType(linkType);
  return {
    label: canvasLabel(parsed),
    kind: parsed.kind,
    relation: parsed.relation ?? "",
    hardness: parsed.hardness ?? "",
    linkType,
  };
}

/**
 * Lists unique kinds present in a set of wire link types, in display order.
 * @param linkTypes - Wire link type ids.
 * @returns Ordered unique kinds.
 */
export function presentLinkKinds(linkTypes: Iterable<string>): LinkKind[] {
  const seen = new Set<LinkKind>();
  for (const linkType of linkTypes) {
    seen.add(parseLinkType(linkType).kind);
  }
  return LINK_KIND_ORDER.filter((kind) => seen.has(kind));
}

/**
 * Parses compatible registry link types for dialog grouping.
 * @param types - Compatible link type metadata.
 * @returns Parsed types in input order.
 */
export function parseCompatibleLinkTypes(types: LinkTypeMeta[]): ParsedLinkType[] {
  return types.map((item) => parseLinkType(item.link_type));
}

/**
 * Lists unique kinds among parsed compatible types.
 * @param parsed - Parsed compatible types.
 * @returns Ordered unique kinds.
 */
export function uniqueCompatibleKinds(parsed: ParsedLinkType[]): LinkKind[] {
  const seen = new Set(parsed.map((item) => item.kind));
  return LINK_KIND_ORDER.filter((kind) => seen.has(kind));
}

/**
 * Lists relations available for a kind in a compatible set.
 * @param parsed - Parsed compatible types.
 * @param kind - Selected kind.
 * @returns Ordered relations.
 */
export function compatibleRelations(
  parsed: ParsedLinkType[],
  kind: LinkKind,
): LinkRelation[] {
  const seen = new Set<LinkRelation>();
  for (const item of parsed) {
    if (item.kind === kind && item.relation) {
      seen.add(item.relation);
    }
  }
  return LINK_RELATION_ORDER.filter((relation) => seen.has(relation));
}

/**
 * Lists hardness values available for a kind and optional relation.
 * @param parsed - Parsed compatible types.
 * @param kind - Selected kind.
 * @param relation - Selected relation, or null to include all for the kind.
 * @returns Ordered hardness values.
 */
export function compatibleHardnesses(
  parsed: ParsedLinkType[],
  kind: LinkKind,
  relation: LinkRelation | null,
): LinkHardness[] {
  const seen = new Set<LinkHardness>();
  for (const item of parsed) {
    if (item.kind !== kind || !item.hardness) {
      continue;
    }
    if (relation !== null && item.relation !== relation) {
      continue;
    }
    seen.add(item.hardness);
  }
  return LINK_HARDNESS_ORDER.filter((hardness) => seen.has(hardness));
}

/**
 * Resolves a wire link type id from human dialog selections.
 * @param types - Compatible link type metadata.
 * @param kind - Selected kind.
 * @param relation - Selected relation when the kind is precedence.
 * @param hardness - Selected hardness when the kind is precedence.
 * @returns Matching wire id, or null when no type matches.
 */
export function resolveLinkTypeId(
  types: LinkTypeMeta[],
  kind: LinkKind,
  relation: LinkRelation | null = null,
  hardness: LinkHardness | null = null,
): string | null {
  const match = types.find((item) => {
    const parsed = parseLinkType(item.link_type);
    if (parsed.kind !== kind) {
      return false;
    }
    if (kind === "precedes") {
      return parsed.relation === relation && parsed.hardness === hardness;
    }
    return true;
  });
  return match?.link_type ?? null;
}
