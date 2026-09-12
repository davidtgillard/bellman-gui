/**
 * Returns an error message when a work-package name is not valid kebab-case.
 * Empty names are invalid for creation.
 * @param name - Raw name field value.
 * @returns Error message, or null when the name is valid.
 */
export function validateWorkPackageName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return "Enter a lowercase kebab-case name.";
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)) {
    return "Use lowercase letters, digits, and single hyphens.";
  }
  return null;
}
