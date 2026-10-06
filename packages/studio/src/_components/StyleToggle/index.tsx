import type { Ref } from "react";

export type StyleToggleProps = {
  ref?: Ref<HTMLButtonElement>;
  /** The Style inspector is open. */
  open: boolean;
  onOpen: () => void;
  /** Closes the inspector and returns focus here. */
  onClose: () => void;
};

/** The topbar button that opens and closes the Style inspector. */
export function StyleToggle({ ref, open, onOpen, onClose }: StyleToggleProps) {
  return (
    <button
      ref={ref}
      type="button"
      className="ds-shell-button"
      aria-expanded={open}
      aria-controls="ds-inspector"
      // Closing goes through onClose, which also moves focus here: a mouse
      // click does not focus a button in Safari, so focus could stay on a rail
      // control inside the hidden panel.
      onClick={() => (open ? onClose() : onOpen())}
    >
      Style
    </button>
  );
}
