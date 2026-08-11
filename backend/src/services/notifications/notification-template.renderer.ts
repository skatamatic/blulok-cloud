/**
 * Simple {{placeholder}} template renderer for outbound SMS/email.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string | undefined | null>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    const re = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(re, value ?? '');
  }
  return result.trim();
}
