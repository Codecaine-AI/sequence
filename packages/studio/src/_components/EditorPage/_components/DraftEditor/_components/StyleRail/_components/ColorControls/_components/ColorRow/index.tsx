import "./styles.css";
import { validColor } from "./utils";

export type ColorRowProps = {
  label: string;
  /** The explicitly set value; undefined = inherited. */
  value: string | undefined;
  /** Resolved inherited color shown while unset. */
  effective: string;
  onChange: (value: string) => void;
};

/** Color row: label, hex readout (grayed while inherited), native swatch. */
export function ColorRow({ label, value, effective, onChange }: ColorRowProps) {
  const shown = validColor(value ?? effective);
  return (
    <label className="rail-row rail-row--color">
      <span className="rail-row-label">{label}</span>
      <span
        className={
          value === undefined
            ? "rail-value rail-value--inherited"
            : "rail-value"
        }
      >
        {shown}
      </span>
      <input
        className="rail-swatch"
        onChange={(event) => onChange(event.currentTarget.value)}
        type="color"
        value={shown}
      />
    </label>
  );
}
