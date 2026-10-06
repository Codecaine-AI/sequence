import type { KeyboardEvent, MouseEvent } from "react";
import "./styles.css";

export type CardActionProps = {
  label: string;
  ariaLabel: string;
  danger?: boolean;
  onActivate: () => void;
};

/**
 * A button inside a card button: a span with role="button", since a <button>
 * cannot nest. It stops the event so the card does not open.
 */
export function CardAction({
  label,
  ariaLabel,
  danger = false,
  onActivate,
}: CardActionProps) {
  const handleClick = (event: MouseEvent<HTMLSpanElement>) => {
    event.stopPropagation();
    onActivate();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    onActivate();
  };

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      className={danger ? "card-action danger" : "card-action"}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {label}
    </span>
  );
}
