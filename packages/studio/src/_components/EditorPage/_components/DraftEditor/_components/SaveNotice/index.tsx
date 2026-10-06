import "./styles.css";

export type SaveNoticeProps = {
  saved: boolean;
};

/** "Saved" in the topbar actions; empty but holding its width otherwise. */
export function SaveNotice({ saved }: SaveNoticeProps) {
  return (
    <span className="save-notice" aria-live="polite">
      {saved ? "Saved" : ""}
    </span>
  );
}
