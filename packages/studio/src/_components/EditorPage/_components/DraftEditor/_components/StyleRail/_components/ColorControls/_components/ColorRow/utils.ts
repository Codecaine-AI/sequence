import { flat } from "@codecaine-ai/design-system";

/** The swatch's fallback: the ink token, resolved to the hex a native swatch needs. */
const FALLBACK_COLOR = flat.light["color.text.ink"];

/** A color the native swatch accepts: the value if it is #rrggbb, else the ink color. */
export function validColor(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : FALLBACK_COLOR;
}
