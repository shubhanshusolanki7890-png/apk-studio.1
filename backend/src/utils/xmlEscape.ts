/**
 * Escapes XML special characters and Android resource string apostrophes
 * to prevent malformed XML or injection in strings.xml, styles.xml, and AndroidManifest.xml.
 */
export function escapeXml(unsafe: string): string {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, "\\'");
}

/**
 * Escapes a string for safe inclusion inside a Java double-quoted string literal.
 */
export function escapeJavaString(unsafe: string): string {
  return String(unsafe)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}
