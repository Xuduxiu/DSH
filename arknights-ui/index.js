/**
 * Arknights UI — Host identity.
 *
 * The visual protocol is a pure Client feature: global token layers, a theme
 * store, a frame-wide switcher, and a General-settings row. No Host service,
 * route or tool is needed, but the bundle still mounts a Host row so the
 * package appears in the inventory with its localized display metadata.
 */

export const name = 'arknights-ui'

/** No Host-side capability. */
export function apply() {}
