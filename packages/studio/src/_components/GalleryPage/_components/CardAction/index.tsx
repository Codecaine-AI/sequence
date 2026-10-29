import "./styles.css";

export type CardActionProps = {
  label: string;
  ariaLabel: string;
  danger?: boolean;
  onActivate: () => void;
};

/** A small button over a gallery card, such as Rename or Delete. */
export function CardAction({
  label,
  ariaLabel,
  danger = false,
  onActivate,
}: CardActionProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={danger ? "card-action danger" : "card-action"}
      onClick={onActivate}
    >
      {label}
    </button>
  );
}
