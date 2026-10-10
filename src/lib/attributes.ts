import Ajv2020 from "ajv/dist/2020";

const ajv = new Ajv2020({ allErrors: true, strict: false });

export type AttributeScalar = string | number | boolean;

export type AttributeValue = AttributeScalar | Record<string, AttributeScalar>;

export interface AttributeAssignment {
  name: string;
  value: AttributeValue;
  payload: Record<string, AttributeScalar>;
  pinnedVersion: string | null;
}

export interface AttributeDefinition {
  name: string;
  version: string;
  description: string;
  appliesTo: string[];
  cardinality: "one" | "many";
  required: boolean;
  /** Token list, keyed entries, or null when any schema-valid value is allowed. */
  values: string[] | Record<string, Record<string, unknown>> | null;
  valueSchema: Record<string, unknown> | null;
  assignmentSchema: Record<string, unknown> | null;
}

export interface AttributeFieldError {
  key: string;
  message: string;
}

const VERSION_RE = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Strips JSONC comments and trailing commas so a definition file can be parsed.
 * @param text - JSONC source.
 * @returns JSON text.
 * @throws {Error} When a block comment is not closed.
 */
export function stripJsonc(text: string): string {
  let out = "";
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === "\\" && i + 1 < text.length) {
        out += text[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }
    const next = text[i + 1] ?? "";
    if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") {
        i += 1;
      }
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      if (end === -1) {
        throw new Error("unterminated block comment");
      }
      out += text.slice(i, end + 2).replace(/[^\n]/g, " ");
      i = end + 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out.replace(/,(?=\s*[}\]])/g, "");
}

/**
 * Parses one attribute definition document.
 * @param text - JSONC file contents.
 * @returns Definition, or null when the document is not a usable definition.
 */
export function parseAttributeDefinition(text: string): AttributeDefinition | null {
  let doc: unknown;
  try {
    doc = JSON.parse(stripJsonc(text));
  } catch {
    return null;
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return null;
  }
  const record = doc as Record<string, unknown>;
  if (typeof record.name !== "string" || typeof record.version !== "string") {
    return null;
  }
  if (!Array.isArray(record.applies_to) || typeof record.cardinality !== "string") {
    return null;
  }
  const values = record.values;
  let normalized: AttributeDefinition["values"] = null;
  if (Array.isArray(values) && values.every((item) => typeof item === "string")) {
    normalized = values;
  } else if (values && typeof values === "object" && !Array.isArray(values)) {
    normalized = values as Record<string, Record<string, unknown>>;
  } else if (values !== undefined) {
    return null;
  }
  return {
    name: record.name,
    version: record.version,
    description: typeof record.description === "string" ? record.description : "",
    appliesTo: record.applies_to.filter((item): item is string => typeof item === "string"),
    cardinality: record.cardinality === "many" ? "many" : "one",
    required: record.required === true,
    values: normalized,
    valueSchema:
      record.value_schema && typeof record.value_schema === "object"
        ? (record.value_schema as Record<string, unknown>)
        : null,
    assignmentSchema:
      record.assignment_schema && typeof record.assignment_schema === "object"
        ? (record.assignment_schema as Record<string, unknown>)
        : null,
  };
}

/**
 * Returns whether an attribute may be assigned on this node kind.
 * @param definition - Attribute definition.
 * @param nodeType - Registry node type.
 * @returns True when `applies_to` includes the kind.
 */
export function appliesToNode(definition: AttributeDefinition, nodeType: string): boolean {
  return definition.appliesTo?.includes(nodeType) === true;
}

/**
 * Returns true when markdown cannot store this attribute's values.
 * Open objects are work-package YAML only.
 * @param definition - Attribute definition.
 * @returns True for open object values.
 */
export function isOpenObject(definition: AttributeDefinition): boolean {
  return (
    definition.values === null &&
    definition.valueSchema !== null &&
    definition.valueSchema.type === "object"
  );
}

/**
 * Legal tokens for a closed attribute, or null when values are open.
 * @param definition - Attribute definition.
 * @returns Token list, or null when the attribute is open.
 */
export function allowedTokens(definition: AttributeDefinition): string[] | null {
  if (definition.values === null) {
    return null;
  }
  if (Array.isArray(definition.values)) {
    return definition.values;
  }
  return Object.keys(definition.values);
}

/**
 * Display label for a keyed or plain value.
 * @param definition - Attribute definition.
 * @param value - Assigned token.
 * @returns Catalog title when present, otherwise the token.
 */
export function valueLabel(definition: AttributeDefinition | undefined, value: AttributeValue): string {
  if (typeof value === "object") {
    const title = value.title;
    return typeof title === "string" && title ? title : JSON.stringify(value);
  }
  if (
    definition &&
    definition.values &&
    !Array.isArray(definition.values) &&
    definition.values[String(value)]
  ) {
    const title = definition.values[String(value)].title;
    if (typeof title === "string" && title) {
      return title;
    }
  }
  return String(value);
}

/**
 * Catalog description for a keyed token, when present.
 * @param definition - Attribute definition.
 * @param token - Assigned token.
 * @returns Keyed description, or an empty string.
 */
export function keyedDescription(
  definition: AttributeDefinition | undefined,
  token: string,
): string {
  if (
    !definition ||
    !definition.values ||
    Array.isArray(definition.values) ||
    !definition.values[token]
  ) {
    return "";
  }
  const description = definition.values[token].description;
  return typeof description === "string" ? description : "";
}

/**
 * Input widget for an open scalar attribute.
 * @param definition - Attribute definition.
 * @returns Widget kind, or null when the attribute is closed or an object.
 */
export function openScalarKind(
  definition: AttributeDefinition,
): "string" | "number" | "boolean" | null {
  if (definition.values !== null || isOpenObject(definition) || !definition.valueSchema) {
    return null;
  }
  const type = definition.valueSchema.type;
  if (type === "number" || type === "integer") {
    return "number";
  }
  if (type === "boolean") {
    return "boolean";
  }
  return "string";
}

/**
 * Tokens still available for a many-valued closed attribute.
 * @param definition - Attribute definition.
 * @param assignments - Current assignments, including other attributes.
 * @returns Remaining tokens, or null when the attribute is open.
 */
export function remainingTokens(
  definition: AttributeDefinition,
  assignments: AttributeAssignment[],
): string[] | null {
  const tokens = allowedTokens(definition);
  if (!tokens) {
    return null;
  }
  const used = new Set(
    assignments
      .filter((item) => item.name === definition.name)
      .map((item) => String(item.value)),
  );
  return tokens.filter((token) => !used.has(token));
}

/**
 * Drops version pins that are no longer legal for the current definition.
 * @param assignments - Assignments to rewrite.
 * @param catalog - Definitions used to check pins.
 * @returns Assignments with illegal pins cleared.
 */
export function withLegalPins(
  assignments: AttributeAssignment[],
  catalog: AttributeDefinition[],
): AttributeAssignment[] {
  const byName = new Map(catalog.map((definition) => [definition.name, definition]));
  return assignments.map((assignment) => {
    const definition = byName.get(assignment.name);
    const pin =
      definition && pinStillLegal(assignment.pinnedVersion, definition.version)
        ? assignment.pinnedVersion
        : null;
    return { ...assignment, pinnedVersion: pin };
  });
}

/**
 * Returns whether a bellman validate line refers to one attribute.
 * @param message - Issue text after the file path.
 * @param name - Catalog attribute token to look for in the message.
 * @returns True when the name is quoted, or follows the word `attribute`.
 */
export function issueMentionsAttribute(message: string, name: string): boolean {
  if (
    message.includes(`'${name}'`) ||
    message.includes(`"${name}"`) ||
    message.includes(`\`${name}\``)
  ) {
    return true;
  }
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\battribute\\s+${escaped}\\b`).test(message);
}

/**
 * Assignments that should appear as view chips on this node kind.
 * @param nodeType - Registry node type.
 * @param catalog - Attribute catalog.
 * @param assignments - Stored assignments.
 * @returns Assignments whose definition applies, hiding markdown-illegal open objects.
 */
export function visibleAssignments(
  nodeType: string,
  catalog: AttributeDefinition[],
  assignments: AttributeAssignment[],
): AttributeAssignment[] {
  const allowed = new Set(definitionsForNode(catalog, nodeType).map((item) => item.name));
  return assignments.filter((assignment) => allowed.has(assignment.name));
}

function compareVersions(left: string, right: string): number {
  const [lMaj, lMin] = left.split(".").map(Number);
  const [rMaj, rMin] = right.split(".").map(Number);
  if (lMaj !== rMaj) {
    return lMaj - rMaj;
  }
  return lMin - rMin;
}

/**
 * Returns whether an existing pin is still accepted by the definition version.
 * @param pin - `x.y` pin, or null.
 * @param definitionVersion - Current definition version.
 * @returns True when the pin may be rewritten unchanged.
 */
export function pinStillLegal(pin: string | null, definitionVersion: string): boolean {
  if (!pin || !VERSION_RE.test(pin) || !VERSION_RE.test(definitionVersion)) {
    return false;
  }
  const [pinMajor] = pin.split(".").map(Number);
  const [defMajor] = definitionVersion.split(".").map(Number);
  return pinMajor === defMajor && compareVersions(pin, definitionVersion) <= 0;
}

function formatScalar(value: AttributeScalar): string {
  if (typeof value === "string") {
    if (TOKEN_RE.test(value) && value !== "true" && value !== "false") {
      return value;
    }
    return JSON.stringify(value);
  }
  return String(value);
}

function schemaCandidates(value: AttributeValue): unknown[] {
  if (typeof value === "object") {
    return [value];
  }
  if (typeof value !== "string") {
    return [value];
  }
  const out: unknown[] = [value];
  if (value === "true" || value === "false") {
    out.push(value === "true");
  }
  if (/^-?(0|[1-9][0-9]*)$/.test(value)) {
    out.push(Number(value));
  }
  if (/^-?(0|[1-9][0-9]*)\.[0-9]+([eE][+-]?[0-9]+)?$/.test(value)) {
    out.push(Number(value));
  }
  return out;
}

function schemaError(schema: Record<string, unknown>, value: unknown): string | null {
  const validate = ajv.compile(schema);
  if (validate(value)) {
    return null;
  }
  const error = validate.errors?.[0];
  if (!error) {
    return "does not match schema";
  }
  const path = error.instancePath.replace(/^\//, "").replace(/\//g, ".");
  return path ? `${path} ${error.message ?? "does not match schema"}` : (error.message ?? "does not match schema");
}

/**
 * Validates assignments for one node against the catalog.
 * @param nodeType - Registry node type.
 * @param catalog - Loaded definitions.
 * @param assignments - Draft assignments.
 * @returns Field errors. Empty means the draft can be saved.
 */
export function validateAssignments(
  nodeType: string,
  catalog: AttributeDefinition[],
  assignments: AttributeAssignment[],
): AttributeFieldError[] {
  const errors: AttributeFieldError[] = [];
  const byName = new Map(catalog.map((definition) => [definition.name, definition]));
  const counts = new Map<string, number>();

  assignments.forEach((assignment, index) => {
    const key = `${assignment.name}:${index}`;
    const definition = byName.get(assignment.name);
    if (!definition) {
      errors.push({ key, message: `Unknown attribute "${assignment.name}".` });
      return;
    }
    if (!appliesToNode(definition, nodeType)) {
      errors.push({
        key,
        message: `${definition.name} does not apply to ${nodeType}.`,
      });
      return;
    }
    counts.set(definition.name, (counts.get(definition.name) ?? 0) + 1);
    const tokens = allowedTokens(definition);
    if (tokens) {
      if (typeof assignment.value === "object" || !tokens.includes(String(assignment.value))) {
        errors.push({
          key,
          message: `"${String(assignment.value)}" is not an allowed ${definition.name} value.`,
        });
      }
    } else if (definition.valueSchema) {
      const candidates = schemaCandidates(assignment.value);
      if (!candidates.some((candidate) => schemaError(definition.valueSchema!, candidate) === null)) {
        const detail = schemaError(definition.valueSchema, candidates[0]);
        errors.push({
          key,
          message: `${definition.name} value is invalid: ${detail}`,
        });
      }
    }
    const payloadKeys = Object.keys(assignment.payload);
    if (payloadKeys.length > 0) {
      if (!definition.assignmentSchema) {
        errors.push({
          key,
          message: `${definition.name} does not accept assignment data.`,
        });
      } else {
        const detail = schemaError(definition.assignmentSchema, assignment.payload);
        if (detail) {
          errors.push({
            key,
            message: `${definition.name} data is invalid: ${detail}`,
          });
        }
      }
    }
    const duplicate = assignments.findIndex(
      (other, otherIndex) =>
        otherIndex < index &&
        other.name === assignment.name &&
        JSON.stringify(other.value) === JSON.stringify(assignment.value),
    );
    if (duplicate !== -1) {
      errors.push({ key, message: `Duplicate ${definition.name} value.` });
    }
  });

  for (const definition of catalog) {
    if (!definition.required || !appliesToNode(definition, nodeType)) {
      continue;
    }
    if ((counts.get(definition.name) ?? 0) === 0) {
      errors.push({
        key: `${definition.name}:required`,
        message: `${definition.name} is required.`,
      });
    }
    if (definition.cardinality === "one" && (counts.get(definition.name) ?? 0) > 1) {
      errors.push({
        key: `${definition.name}:cardinality`,
        message: `${definition.name} allows only one value.`,
      });
    }
  }

  return errors;
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
const LINE_RE =
  /^\s*-\s+(?<head>[^\s:]+)\s*:\s*(?<value>[A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[(?<payload>[^\]]*)\])?\s*$/;

function parseScalar(text: string): AttributeScalar {
  const stripped = text.trim();
  if (stripped.length >= 2 && stripped.startsWith('"') && stripped.endsWith('"')) {
    return stripped.slice(1, -1);
  }
  if (stripped === "true") {
    return true;
  }
  if (stripped === "false") {
    return false;
  }
  if (/^-?(0|[1-9][0-9]*)$/.test(stripped)) {
    return Number(stripped);
  }
  if (/^-?(0|[1-9][0-9]*)\.[0-9]+([eE][+-]?[0-9]+)?$/.test(stripped)) {
    return Number(stripped);
  }
  return stripped;
}

function parsePayload(payload: string): Record<string, AttributeScalar> {
  const data: Record<string, AttributeScalar> = {};
  let current = "";
  let inQuotes = false;
  const items: string[] = [];
  for (const ch of payload) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    }
    if (ch === "," && !inQuotes) {
      items.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) {
    items.push(current);
  }
  for (const item of items) {
    const sep = item.indexOf(":");
    if (sep === -1) {
      continue;
    }
    const key = item.slice(0, sep).trim();
    data[key] = parseScalar(item.slice(sep + 1));
  }
  return data;
}

/**
 * Parses a `## Classifications` body into assignments.
 * @param body - Section body without the heading.
 * @returns Assignments in document order.
 */
export function parseClassificationsBody(body: string): AttributeAssignment[] {
  const assignments: AttributeAssignment[] = [];
  for (const line of body.split("\n")) {
    const stripped = line.trim();
    if (!stripped || stripped.startsWith("#")) {
      continue;
    }
    const match = LINE_RE.exec(line);
    if (!match?.groups) {
      continue;
    }
    const head = match.groups.head;
    const at = head.lastIndexOf("@");
    const name = at === -1 ? head : head.slice(0, at);
    const pin = at === -1 ? null : head.slice(at + 1);
    assignments.push({
      name,
      value: match.groups.value,
      payload: match.groups.payload ? parsePayload(match.groups.payload) : {},
      pinnedVersion: pin,
    });
  }
  return assignments;
}

/**
 * Removes `## Classifications` from markdown.
 * @param markdown - Full node markdown.
 * @returns Body without the classifications section, and the parsed assignments.
 */
export function splitClassifications(markdown: string): {
  body: string;
  assignments: AttributeAssignment[];
} {
  const lines = markdown.split("\n");
  const kept: string[] = [];
  const section: string[] = [];
  let inSection = false;
  let found = false;
  for (const line of lines) {
    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = heading[1].length;
      if (level === 2 && heading[2].trim() === "Classifications") {
        inSection = true;
        found = true;
        continue;
      }
      if (inSection && level <= 2) {
        inSection = false;
      }
    }
    if (inSection) {
      section.push(line);
    } else {
      kept.push(line);
    }
  }
  const body = found ? `${kept.join("\n").replace(/\n+$/, "")}\n` : markdown;
  return {
    body,
    assignments: found ? parseClassificationsBody(section.join("\n")) : [],
  };
}

/**
 * Renders assignments as a `## Classifications` section.
 * @param assignments - Assignments to write.
 * @param catalog - Definitions used to drop illegal pins.
 * @returns Section text including the heading, or an empty string.
 */
export function renderClassificationsSection(
  assignments: AttributeAssignment[],
  catalog: AttributeDefinition[],
): string {
  if (assignments.length === 0) {
    return "";
  }
  const byName = new Map(catalog.map((definition) => [definition.name, definition]));
  const lines = assignments.map((assignment) => {
    const definition = byName.get(assignment.name);
    const pin =
      definition && pinStillLegal(assignment.pinnedVersion, definition.version)
        ? `@${assignment.pinnedVersion}`
        : "";
    const value =
      typeof assignment.value === "object" ? JSON.stringify(assignment.value) : formatScalar(assignment.value);
    const payload = Object.entries(assignment.payload)
      .map(([key, item]) => `${key}: ${formatScalar(item)}`)
      .join(", ");
    const bracket = payload ? ` [${payload}]` : "";
    return `- ${assignment.name}${pin}: ${value}${bracket}`;
  });
  return `\n## Classifications\n\n${lines.join("\n")}\n`;
}

/**
 * Joins a markdown body with a classifications section.
 * @param body - Markdown without classifications.
 * @param assignments - Assignments to append.
 * @param catalog - Definitions used when rendering pins.
 * @returns Full markdown.
 */
export function joinMarkdown(
  body: string,
  assignments: AttributeAssignment[],
  catalog: AttributeDefinition[],
): string {
  if (assignments.length === 0) {
    return body;
  }
  const trimmed = body.replace(/\s+$/, "");
  const section = renderClassificationsSection(assignments, catalog);
  return `${trimmed}${section}`;
}

/**
 * Reports whether the current assignments can be saved.
 * @param nodeType - Registry node type.
 * @param catalog - Attribute catalog.
 * @param assignments - Draft assignments, including empty placeholders.
 * @returns True when validation reports no errors.
 */
export function classificationsAreValid(
  nodeType: string,
  catalog: AttributeDefinition[],
  assignments: AttributeAssignment[],
): boolean {
  return (
    validateAssignments(
      nodeType,
      catalog,
      assignments.filter((item) => item.value !== "" && item.value !== undefined),
    ).length === 0
  );
}

/**
 * Definitions that apply to a node kind.
 * @param catalog - Full catalog.
 * @param nodeType - Registry node type.
 * @returns Applicable definitions, hiding open objects on markdown kinds.
 */
export function definitionsForNode(
  catalog: AttributeDefinition[],
  nodeType: string,
): AttributeDefinition[] {
  return catalog.filter((definition) => {
    if (!appliesToNode(definition, nodeType)) {
      return false;
    }
    if (nodeType !== "work_package" && isOpenObject(definition)) {
      return false;
    }
    return true;
  });
}
