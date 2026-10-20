/**
 * Shape of the ids Qloo hands out: `urn:...` for tags and typed entities, UUIDs or 32-hex strings for
 * entities, `MOCK-...` in mock mode. Ids from the browser are checked against this before they reach a
 * query string or a prompt; commas and other separators can never be part of an id.
 */
export const QLOO_ID_PATTERN = /^(?:urn:[\w:.-]+|MOCK-[\w-]+|[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}|[0-9A-Fa-f]{32})$/;

export const isQlooId = (value: string): boolean => QLOO_ID_PATTERN.test(value);
