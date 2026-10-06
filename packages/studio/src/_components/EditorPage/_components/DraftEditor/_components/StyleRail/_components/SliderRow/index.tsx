import "./styles.css";

export type SliderRowProps = {
  label: string;
  value: number | undefined;
  effective: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
};

/** Slider row for lengths, opacities, and scale, with a numeric readout. */
export function SliderRow({
  label,
  value,
  effective,
  min,
  max,
  step,
  format,
  onChange,
}: SliderRowProps) {
  const shown = value ?? effective;
  return (
    <label className="rail-row rail-row--slider">
      <span className="rail-slider-head">
        <span className="rail-row-label">{label}</span>
        <span
          className={
            value === undefined
              ? "rail-value rail-value--inherited"
              : "rail-value"
          }
        >
          {format(shown)}
        </span>
      </span>
      <input
        className="rail-range"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        step={step}
        type="range"
        value={shown}
      />
    </label>
  );
}
