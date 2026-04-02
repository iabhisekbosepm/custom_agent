/** Generate a unique ID using the built-in crypto API. */
export function generateId(): string {
  return crypto.randomUUID();
}
