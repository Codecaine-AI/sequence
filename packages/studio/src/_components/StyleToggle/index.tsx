import { useLayoutEffect, type RefObject } from "react";

export type StyleToggleProps = {
  /** The button's element: closing the inspector returns focus to it. */
  toggleRef: RefObject<HTMLButtonElement | null>;
  /** The Style inspector is open. */
  open: boolean;
  onOpen: () => void;
  /** Closes the inspector and returns focus here. */
  onClose: () => void;
};

/** The topbar button that opens and closes the Style inspector. */
export function StyleToggle({ toggleRef, open, onOpen, onClose }: StyleToggleProps) {
  // Leaving the editor by a click that does not move focus (Safari) removes
  // this button while it has focus. Hand focus to the next topbar control, the
  // theme toggle, which stays on every page, instead of dropping it to <body>.
  // A layout cleanup runs while the button is still in the page.
  useLayoutEffect(() => {
    const button = toggleRef.current;
    return () => {
      if (button && button === document.activeElement) {
        (button.nextElementSibling as HTMLElement | null)?.focus({ preventScroll: true });
      }
    };
  }, [toggleRef]);

  return (
    <button
      ref={toggleRef}
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
