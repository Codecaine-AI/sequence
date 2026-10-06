import "./styles.css";

export type ChevronProps = {
  open: boolean;
};

/** The section toggle's chevron: points down while open, right while closed. */
export function Chevron({ open }: ChevronProps) {
  return (
    <svg
      aria-hidden="true"
      className={open ? "rail-chevron" : "rail-chevron rail-chevron--closed"}
      fill="none"
      height="10"
      viewBox="0 0 10 10"
      width="10"
    >
      <path
        d="M2 3.5 L5 6.5 L8 3.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}
