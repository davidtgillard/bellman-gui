import { useMemo, useState } from "react";
import {
  allowedTokens,
  definitionsForNode,
  isOpenObject,
  issueMentionsAttribute,
  keyedDescription,
  openScalarKind,
  remainingTokens,
  validateAssignments,
  valueLabel,
  type AttributeAssignment,
  type AttributeDefinition,
  type AttributeFieldError,
  type AttributeScalar,
} from "../lib/attributes";

interface ClassificationsEditorProps {
  nodeType: string;
  catalog: AttributeDefinition[];
  assignments: AttributeAssignment[];
  disabled?: boolean;
  /** Create dialogs only collect required attributes. */
  requiredOnly?: boolean;
  /** Bellman validate issues to pin onto matching attribute rows. */
  serverIssues?: Array<{ message: string }>;
  onChange: (assignments: AttributeAssignment[]) => void;
}

function addValueLabel(name: string): string {
  return `Add ${name} value`;
}

function errorsFor(
  errors: AttributeFieldError[],
  name: string,
  index: number,
): string[] {
  return errors.filter((error) => error.key === `${name}:${index}`).map((error) => error.message);
}

function schemaProperties(
  schema: Record<string, unknown> | null,
): Array<{ name: string; type: string }> {
  if (!schema || schema.type !== "object" || !schema.properties || typeof schema.properties !== "object") {
    return [];
  }
  return Object.entries(schema.properties as Record<string, { type?: string }>).map(
    ([name, property]) => ({ name, type: property.type ?? "string" }),
  );
}

function emptyAssignment(name: string): AttributeAssignment {
  return { name, value: "", payload: {}, pinnedVersion: null };
}

function tokenOptionLabel(definition: AttributeDefinition, token: string): string {
  const title = valueLabel(definition, token);
  const description = keyedDescription(definition, token);
  return description ? `${title} — ${description}` : title;
}

/**
 * Schema-driven editor for assigning attribute values already defined on the roadmap.
 * @param props - Editor inputs.
 * @param props.nodeType - Registry node type.
 * @param props.catalog - Attribute definitions for the open roadmap.
 * @param props.assignments - Draft assignments, including empty placeholders.
 * @param props.disabled - When true, the fieldset cannot be edited.
 * @param props.requiredOnly - When true, optional attributes stay off the form.
 * @param props.serverIssues - Validate messages mapped onto matching rows.
 * @param props.onChange - Called with the next assignment list.
 * @returns Attribute assignment form.
 */
export function ClassificationsEditor({
  nodeType,
  catalog,
  assignments,
  disabled = false,
  requiredOnly = false,
  serverIssues = [],
  onChange,
}: ClassificationsEditorProps) {
  const definitions = useMemo(
    () =>
      definitionsForNode(catalog, nodeType).filter(
        (definition) => !requiredOnly || definition.required,
      ),
    [catalog, nodeType, requiredOnly],
  );
  const errors = useMemo(
    () => validateAssignments(nodeType, catalog, assignments.filter((item) => item.value !== "")),
    [assignments, catalog, nodeType],
  );
  const [manyQuery, setManyQuery] = useState<Record<string, string>>({});
  const [manyOpen, setManyOpen] = useState<Record<string, boolean>>({});
  const [openDraft, setOpenDraft] = useState<Record<string, string>>({});

  const updateAt = (index: number, next: AttributeAssignment) => {
    onChange(assignments.map((item, itemIndex) => (itemIndex === index ? next : item)));
  };

  const removeAt = (index: number) => {
    onChange(assignments.filter((_, itemIndex) => itemIndex !== index));
  };

  const addAssignment = (name: string, value: AttributeAssignment["value"]) => {
    const duplicate = assignments.some(
      (item) => item.name === name && JSON.stringify(item.value) === JSON.stringify(value),
    );
    if (duplicate || value === "") {
      return;
    }
    onChange([...assignments, { name, value, payload: {}, pinnedVersion: null }]);
  };

  const byName = new Map(catalog.map((definition) => [definition.name, definition]));
  const rowDefinitions: AttributeDefinition[] = [...definitions];
  for (const assignment of assignments) {
    if (rowDefinitions.some((definition) => definition.name === assignment.name)) {
      continue;
    }
    const definition = byName.get(assignment.name);
    if (definition) {
      rowDefinitions.push(definition);
    }
  }

  return (
    <fieldset className="classifications-editor" disabled={disabled}>
      <legend>Attributes</legend>
      {rowDefinitions.length === 0 ? (
        <p className="field-hint">
          {catalog.length === 0
            ? "No attribute definitions found in this roadmap."
            : "No attributes apply to this node."}
        </p>
      ) : (
        rowDefinitions.map((definition) => {
          const matches = assignments
            .map((assignment, index) => ({ assignment, index }))
            .filter((item) => item.assignment.name === definition.name);
          const groupErrors = [
            ...errors
              .filter(
                (error) =>
                  error.key === `${definition.name}:required` ||
                  error.key === `${definition.name}:cardinality`,
              )
              .map((error) => error.message),
            ...serverIssues
              .filter((issue) => issueMentionsAttribute(issue.message, definition.name))
              .map((issue) => issue.message),
          ];
          if (definition.cardinality === "many") {
            return (
              <ManyAttributeRow
                key={definition.name}
                definition={definition}
                matches={matches}
                groupErrors={groupErrors}
                errors={errors}
                query={manyQuery[definition.name] ?? ""}
                open={manyOpen[definition.name] === true}
                openDraft={openDraft[definition.name] ?? ""}
                disabled={disabled}
                onQueryChange={(value) =>
                  setManyQuery((current) => ({ ...current, [definition.name]: value }))
                }
                onOpenChange={(value) =>
                  setManyOpen((current) => ({ ...current, [definition.name]: value }))
                }
                onOpenDraftChange={(value) =>
                  setOpenDraft((current) => ({ ...current, [definition.name]: value }))
                }
                onAdd={(value) => addAssignment(definition.name, value)}
                onUpdate={updateAt}
                onRemove={removeAt}
              />
            );
          }
          const row = matches[0] ?? {
            assignment: emptyAssignment(definition.name),
            index: null as number | null,
          };
          return (
            <OneAttributeRow
              key={definition.name}
              definition={definition}
              assignment={row.assignment}
              index={row.index}
              rowErrors={[
                ...(row.index === null
                  ? errors
                      .filter((error) => error.key === `${definition.name}:required`)
                      .map((error) => error.message)
                  : errorsFor(errors, row.assignment.name, row.index)),
                ...groupErrors,
              ]}
              onAdd={(value) => addAssignment(definition.name, value)}
              onUpdate={updateAt}
            />
          );
        })
      )}
    </fieldset>
  );
}

function OneAttributeRow({
  definition,
  assignment,
  index,
  rowErrors,
  onAdd,
  onUpdate,
}: {
  definition: AttributeDefinition;
  assignment: AttributeAssignment;
  index: number | null;
  rowErrors: string[];
  onAdd: (value: AttributeAssignment["value"]) => void;
  onUpdate: (index: number, next: AttributeAssignment) => void;
}) {
  const tokens = allowedTokens(definition);
  const payloadFields = schemaProperties(definition.assignmentSchema);
  const openObject = isOpenObject(definition);
  const scalarKind = openScalarKind(definition);
  const uniqueErrors = [...new Set(rowErrors)];

  const setValue = (value: AttributeAssignment["value"]) => {
    if (index === null) {
      if (value !== "" && value !== undefined) {
        onAdd(value);
      }
      return;
    }
    onUpdate(index, { ...assignment, value });
  };

  return (
    <div className="classification-row">
      <label className="edit-field">
        <span>
          {definition.name}
          {definition.required ? " *" : ""}
        </span>
        {tokens ? (
          <select
            value={typeof assignment.value === "string" ? assignment.value : ""}
            aria-invalid={uniqueErrors.length > 0}
            className={uniqueErrors.length > 0 ? "is-invalid" : undefined}
            onChange={(event) => setValue(event.target.value)}
          >
            <option value="">Select…</option>
            {tokens.map((token) => (
              <option key={token} value={token} title={keyedDescription(definition, token)}>
                {tokenOptionLabel(definition, token)}
              </option>
            ))}
          </select>
        ) : openObject ? (
          <div className="classification-object">
            {schemaProperties(definition.valueSchema).map((field) => (
              <label key={field.name} className="edit-field">
                <span>{field.name}</span>
                <input
                  type={field.type === "number" ? "number" : "text"}
                  value={
                    typeof assignment.value === "object"
                      ? String(assignment.value[field.name] ?? "")
                      : ""
                  }
                  onChange={(event) => {
                    const current = typeof assignment.value === "object" ? assignment.value : {};
                    const parsed: AttributeScalar =
                      field.type === "number" && event.target.value !== ""
                        ? Number(event.target.value)
                        : event.target.value;
                    setValue({ ...current, [field.name]: parsed });
                  }}
                />
              </label>
            ))}
          </div>
        ) : scalarKind === "number" ? (
          <input
            type="number"
            step="any"
            value={assignment.value === "" || assignment.value === undefined ? "" : String(assignment.value)}
            aria-invalid={uniqueErrors.length > 0}
            className={uniqueErrors.length > 0 ? "is-invalid" : undefined}
            onChange={(event) => {
              const raw = event.target.value;
              setValue(raw === "" ? "" : Number(raw));
            }}
          />
        ) : scalarKind === "boolean" ? (
          <select
            value={typeof assignment.value === "boolean" ? String(assignment.value) : ""}
            aria-invalid={uniqueErrors.length > 0}
            className={uniqueErrors.length > 0 ? "is-invalid" : undefined}
            onChange={(event) => {
              const raw = event.target.value;
              setValue(raw === "" ? "" : raw === "true");
            }}
          >
            <option value="">Select…</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : (
          <input
            type="text"
            value={typeof assignment.value === "string" ? assignment.value : ""}
            aria-invalid={uniqueErrors.length > 0}
            className={uniqueErrors.length > 0 ? "is-invalid" : undefined}
            onChange={(event) => setValue(event.target.value)}
          />
        )}
        {definition.description ? (
          <span className="field-hint">{definition.description}</span>
        ) : null}
      </label>
      {index !== null && payloadFields.length > 0
        ? payloadFields.map((field) => (
            <label key={field.name} className="edit-field">
              <span>{field.name}</span>
              <input
                type={field.type === "number" ? "number" : "text"}
                step={field.type === "number" ? "any" : undefined}
                value={String(assignment.payload[field.name] ?? "")}
                onChange={(event) => {
                  const raw = event.target.value;
                  const payload = { ...assignment.payload };
                  if (raw === "") {
                    delete payload[field.name];
                  } else {
                    payload[field.name] = field.type === "number" ? Number(raw) : raw;
                  }
                  onUpdate(index, { ...assignment, payload });
                }}
              />
            </label>
          ))
        : null}
      {uniqueErrors.map((message) => (
        <p key={message} className="field-error" role="alert">
          {message}
        </p>
      ))}
    </div>
  );
}

function ManyAttributeRow({
  definition,
  matches,
  groupErrors,
  errors,
  query,
  open,
  openDraft,
  disabled,
  onQueryChange,
  onOpenChange,
  onOpenDraftChange,
  onAdd,
  onUpdate,
  onRemove,
}: {
  definition: AttributeDefinition;
  matches: Array<{ assignment: AttributeAssignment; index: number }>;
  groupErrors: string[];
  errors: AttributeFieldError[];
  query: string;
  open: boolean;
  openDraft: string;
  disabled: boolean;
  onQueryChange: (value: string) => void;
  onOpenChange: (value: boolean) => void;
  onOpenDraftChange: (value: string) => void;
  onAdd: (value: AttributeAssignment["value"]) => void;
  onUpdate: (index: number, next: AttributeAssignment) => void;
  onRemove: (index: number) => void;
}) {
  const remaining = remainingTokens(
    definition,
    matches.map((item) => item.assignment),
  );
  const payloadFields = schemaProperties(definition.assignmentSchema);
  const scalarKind = openScalarKind(definition);
  const suggestionId = `classification-suggestions-${definition.name}`;
  const candidates = (remaining ?? []).filter((token) => {
    const haystack = `${token} ${valueLabel(definition, token)} ${keyedDescription(definition, token)}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });
  const uniqueErrors = [
    ...new Set([
      ...groupErrors,
      ...matches.flatMap((item) => errorsFor(errors, definition.name, item.index)),
    ]),
  ];

  const addOpenValue = () => {
    const raw = openDraft.trim();
    if (!raw) {
      return;
    }
    const value: AttributeAssignment["value"] =
      scalarKind === "number" ? Number(raw) : scalarKind === "boolean" ? raw === "true" : raw;
    onAdd(value);
    onOpenDraftChange("");
  };

  return (
    <div className="classification-row">
      <span className="edit-field">
        <span>
          {definition.name}
          {definition.required ? " *" : ""}
        </span>
        {definition.description ? (
          <span className="field-hint">{definition.description}</span>
        ) : null}
      </span>
      {matches.length === 0 ? (
        <p className="field-hint">None selected.</p>
      ) : (
        <ul className="classification-value-chips">
          {matches.map(({ assignment, index }) => (
            <li key={`${definition.name}-${index}`} className="classification-many-item">
              <span className="wp-dependency-chip">
                <span>{valueLabel(definition, assignment.value)}</span>
                <button
                  type="button"
                  className="wp-dependency-remove"
                  onClick={() => onRemove(index)}
                  aria-label={`Remove ${valueLabel(definition, assignment.value)}`}
                >
                  ×
                </button>
              </span>
              {payloadFields.map((field) => (
                <label key={field.name} className="edit-field">
                  <span>{field.name}</span>
                  <input
                    type={field.type === "number" ? "number" : "text"}
                    step={field.type === "number" ? "any" : undefined}
                    value={String(assignment.payload[field.name] ?? "")}
                    onChange={(event) => {
                      const raw = event.target.value;
                      const payload = { ...assignment.payload };
                      if (raw === "") {
                        delete payload[field.name];
                      } else {
                        payload[field.name] = field.type === "number" ? Number(raw) : raw;
                      }
                      onUpdate(index, { ...assignment, payload });
                    }}
                  />
                </label>
              ))}
            </li>
          ))}
        </ul>
      )}
      {remaining ? (
        remaining.length > 0 ? (
          <div className="attribute-value-add">
            <label className="edit-field">
              <span>{addValueLabel(definition.name)}</span>
              <input
                type="search"
                role="combobox"
                aria-expanded={open && candidates.length > 0}
                aria-controls={suggestionId}
                aria-autocomplete="list"
                placeholder="Search values…"
                value={query}
                disabled={disabled}
                onChange={(event) => {
                  onQueryChange(event.target.value);
                  onOpenChange(true);
                }}
                onFocus={() => onOpenChange(true)}
                onBlur={() => {
                  window.setTimeout(() => onOpenChange(false), 120);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    onOpenChange(false);
                    return;
                  }
                  if (event.key === "Enter" && candidates[0]) {
                    event.preventDefault();
                    onAdd(candidates[0]);
                    onQueryChange("");
                    onOpenChange(false);
                  }
                }}
              />
            </label>
            {open && candidates.length > 0 ? (
              <ul id={suggestionId} className="wp-dependency-suggestions" role="listbox">
                {candidates.map((token) => (
                  <li key={token} role="option">
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        onAdd(token);
                        onQueryChange("");
                        onOpenChange(false);
                      }}
                    >
                      <span>{valueLabel(definition, token)}</span>
                      {keyedDescription(definition, token) ? (
                        <span className="field-hint">{keyedDescription(definition, token)}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null
      ) : (
        <div className="attribute-value-add">
          <label className="edit-field">
            <span>{addValueLabel(definition.name)}</span>
            {scalarKind === "number" ? (
              <input
                type="number"
                step="any"
                value={openDraft}
                disabled={disabled}
                onChange={(event) => onOpenDraftChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addOpenValue();
                  }
                }}
              />
            ) : scalarKind === "boolean" ? (
              <select
                value={openDraft}
                disabled={disabled}
                onChange={(event) => {
                  onOpenDraftChange(event.target.value);
                  if (event.target.value !== "") {
                    onAdd(event.target.value === "true");
                    onOpenDraftChange("");
                  }
                }}
              >
                <option value="">Select…</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : (
              <input
                type="text"
                placeholder="Enter a value…"
                value={openDraft}
                disabled={disabled}
                onChange={(event) => onOpenDraftChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addOpenValue();
                  }
                }}
              />
            )}
          </label>
          {scalarKind !== "boolean" ? (
            <button type="button" onClick={addOpenValue} disabled={disabled || openDraft.trim() === ""}>
              Add
            </button>
          ) : null}
        </div>
      )}
      {uniqueErrors.map((message) => (
        <p key={message} className="field-error" role="alert">
          {message}
        </p>
      ))}
    </div>
  );
}
