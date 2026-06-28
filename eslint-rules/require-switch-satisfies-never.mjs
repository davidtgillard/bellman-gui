/** @typedef {import('eslint').Rule} Rule */

/** @param {import('@typescript-eslint/types').TSESTree.Node | null | undefined} node */
function isNeverSatisfies(node) {
  return (
    node?.type === "TSSatisfiesExpression" &&
    node.typeAnnotation?.type === "TSNeverKeyword"
  );
}

/**
 * @param {import('@typescript-eslint/types').TSESTree.Node | null | undefined} node
 * @param {WeakSet<object>} visited
 */
function containsNeverSatisfies(node, visited = new WeakSet()) {
  if (!node || typeof node !== "object") {
    return false;
  }

  if (visited.has(node)) {
    return false;
  }
  visited.add(node);

  if (isNeverSatisfies(node)) {
    return true;
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") {
      continue;
    }

    if (Array.isArray(value)) {
      if (value.some((item) => containsNeverSatisfies(item, visited))) {
        return true;
      }
      continue;
    }

    if (value && typeof value === "object" && "type" in value) {
      if (containsNeverSatisfies(value, visited)) {
        return true;
      }
    }
  }

  return false;
}

/** @type {Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require switch default branches to use the `value satisfies never` pattern for exhaustive matching.",
    },
    messages: {
      missingDefault:
        "Switch statement must include a default case with `value satisfies never` for exhaustive matching.",
      missingSatisfiesNever:
        "Switch default case must include `value satisfies never` (or `throw`/`return value satisfies never`) for exhaustive matching.",
    },
    schema: [],
  },
  create(context) {
    return {
      SwitchStatement(node) {
        const defaultCase = node.cases.find((caseNode) => caseNode.test === null);
        if (!defaultCase) {
          context.report({ node, messageId: "missingDefault" });
          return;
        }

        if (!defaultCase.consequent.some((statement) => containsNeverSatisfies(statement))) {
          context.report({ node: defaultCase, messageId: "missingSatisfiesNever" });
        }
      },
    };
  },
};

export default rule;
