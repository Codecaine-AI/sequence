import "./styles.css";

export type StatusPageProps = {
  message: string;
  onBack: () => void;
};

/** A plain page inside the shell's main: a message and the way back. */
export function StatusPage({ message, onBack }: StatusPageProps) {
  return (
    <div className="status-page">
      <p>{message}</p>
      <button type="button" className="btn btn-outline" onClick={onBack}>
        Back to gallery
      </button>
    </div>
  );
}
