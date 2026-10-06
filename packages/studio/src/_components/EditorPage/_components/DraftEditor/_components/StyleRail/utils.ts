/** True when any of the style fields is set (a section's Reset shows then). */
export const defined = (...values: unknown[]): boolean =>
  values.some((value) => value !== undefined);

export const px = (value: number): string => `${value}px`;
export const ratio = (value: number): string => value.toFixed(2);
