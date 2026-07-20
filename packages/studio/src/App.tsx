import { useState } from "react";
import { EditorPage } from "./EditorPage";
import { GalleryPage } from "./GalleryPage";

/**
 * In-memory routing, canvas-studio style: a gallery landing page listing
 * examples and local drafts, and a full-screen editor for one opened draft.
 */
type Route = { name: "gallery" } | { name: "editor"; draftId: string };

export function App() {
  const [route, setRoute] = useState<Route>({ name: "gallery" });

  if (route.name === "editor") {
    return (
      <EditorPage
        key={route.draftId}
        draftId={route.draftId}
        onBack={() => setRoute({ name: "gallery" })}
      />
    );
  }

  return (
    <GalleryPage
      onOpenDraft={(draftId) => setRoute({ name: "editor", draftId })}
    />
  );
}
