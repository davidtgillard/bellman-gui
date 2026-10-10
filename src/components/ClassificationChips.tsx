import {
  definitionsForNode,
  valueLabel,
  visibleAssignments,
  type AttributeAssignment,
  type AttributeDefinition,
} from "../lib/attributes";

interface ClassificationChipsProps {
  nodeType: string;
  catalog: AttributeDefinition[];
  assignments: AttributeAssignment[];
}

function definitionFor(
  catalog: AttributeDefinition[],
  name: string,
): AttributeDefinition | undefined {
  return catalog.find((item) => item.name === name);
}

/**
 * Read-only attribute chips for the node detail header.
 * @param props - Chip inputs.
 * @param props.nodeType - Registry node type used to hide inapplicable attributes.
 * @param props.catalog - Attribute definitions for the open roadmap.
 * @param props.assignments - Assignments currently stored on the node.
 * @returns Chip list, or null when the node has no applicable attributes.
 */
export function ClassificationChips({
  nodeType,
  catalog,
  assignments,
}: ClassificationChipsProps) {
  const applicable = definitionsForNode(catalog, nodeType);
  const visible = visibleAssignments(nodeType, catalog, assignments);
  if (applicable.length === 0 && visible.length === 0) {
    return null;
  }

  const missing = applicable.filter(
    (definition) =>
      definition.required && !visible.some((item) => item.name === definition.name),
  );

  return (
    <ul className="classification-chips">
      {visible.map((assignment, index) => {
        const definition = definitionFor(catalog, assignment.name);
        const payload = Object.entries(assignment.payload)
          .map(([key, value]) => `${key} ${String(value)}`)
          .join(", ");
        return (
          <li key={`${assignment.name}-${index}`} className="classification-chip">
            <span>{valueLabel(definition, assignment.value)}</span>
            {payload ? <span className="classification-chip-payload">{payload}</span> : null}
          </li>
        );
      })}
      {missing.map((definition) => (
        <li key={`${definition.name}-required`} className="classification-chip classification-chip-missing">
          {definition.name
            .split("-")
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ")}{" "}
          — required
        </li>
      ))}
    </ul>
  );
}
