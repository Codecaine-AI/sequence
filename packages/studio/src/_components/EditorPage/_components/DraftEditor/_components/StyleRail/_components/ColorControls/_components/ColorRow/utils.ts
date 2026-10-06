/** A color the native swatch accepts: the value if it is #rrggbb, else black. */
export function validColor(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
}
