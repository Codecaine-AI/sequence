import { SequenceViewer, type SequenceDocument } from "@codecaine-ai/sequence";
import "./styles.css";

export type EditorPreviewProps = {
  document: SequenceDocument;
  /** The program has errors: the preview shows the last valid document. */
  stale: boolean;
};

/** The live diagram on a dotted canvas, scrolling on its own. */
export function EditorPreview({ document, stale }: EditorPreviewProps) {
  return (
    <section className="editor-preview" aria-label="Preview">
      {stale ? (
        <span className="stale-pill">Showing last valid program</span>
      ) : null}
      <div className="editor-preview-scroll">
        <div className="editor-preview-content">
          <div className="diagram-card">
            <SequenceViewer document={document} />
          </div>
        </div>
      </div>
    </section>
  );
}
