import type { SequenceDocument } from "@codecaine-ai/sequence";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell, resolveNav, type NavSection } from "./_components/AppShell";
import { EditorPage, type ShellSlots } from "./_components/EditorPage";
import { GalleryPage } from "./_components/GalleryPage";
import { NavButton, NavigateContext } from "./_components/NavButton";
import { StyleToggle } from "./_components/StyleToggle";
import { ThemeToggle } from "./_components/ThemeToggle";
import { useStyleInspector } from "./useStyleInspector";
import { Icon } from "@/shared/_components/Icon";
import { createDraft, listDrafts } from "@/shared/draft-store";
import { MINIMAL_FIXTURE, cloneSequenceDocument, nextDraftId } from "@/shared/fixtures";

/**
 * In-memory routing, canvas-studio style: a gallery landing page listing
 * examples and local drafts, and an editor for one opened draft. Both render
 * inside the design-system app shell: the sidebar navigates between the
 * gallery and the drafts, the topbar holds the page title and actions, and the
 * Style rail is the inspector. Nav hrefs are virtual paths for resolveNav; the
 * pages have no URLs, so nav rows are buttons.
 */
type Route = { name: "gallery" } | { name: "editor"; draftId: string };

const APP_NAME = "Sequence Studio";
// One key for the theme toggle in every page's topbar actions, so React keeps
// its element across pages: a focused toggle keeps focus when a click that
// does not move focus (Safari) changes the page.
const THEME_TOGGLE_KEY = "theme-toggle";
const SIDEBAR_STORAGE_KEY = "sequence-studio.sidebar";
const GALLERY_PATH = "/";
const DRAFT_PATH_PREFIX = "/drafts/";

const draftPath = (draftId: string): string => `${DRAFT_PATH_PREFIX}${encodeURIComponent(draftId)}`;

function routeFromPath(path: string): Route {
  return path.startsWith(DRAFT_PATH_PREFIX)
    ? { name: "editor", draftId: decodeURIComponent(path.slice(DRAFT_PATH_PREFIX.length)) }
    : { name: "gallery" };
}

export function App() {
  const [route, setRoute] = useState<Route>({ name: "gallery" });
  const [draftsVersion, setDraftsVersion] = useState(0);
  const { styleOpen, styleToggleRef, changeStyleOpen, closeStyle } = useStyleInspector();
  // Portal targets in the shell that the editor fills with its own controls.
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null);
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  const [inspectorSlot, setInspectorSlot] = useState<HTMLElement | null>(null);
  const slots = useMemo<ShellSlots>(
    () => ({ title: titleSlot, actions: actionsSlot, inspector: inspectorSlot }),
    [titleSlot, actionsSlot, inspectorSlot],
  );

  // The nav lists the drafts: re-read on every navigation (route) and after a
  // rename or delete (draftsVersion).
  const drafts = useMemo(() => listDrafts(), [route, draftsVersion]);
  const refreshDrafts = useCallback(() => setDraftsVersion((version) => version + 1), []);

  const navigate = useCallback((path: string) => setRoute(routeFromPath(path)), []);
  const openDraft = useCallback((draftId: string) => setRoute({ name: "editor", draftId }), []);

  const seedDraft = useCallback(
    (source: SequenceDocument, title: string) => {
      const document = cloneSequenceDocument(source);
      document.id = nextDraftId(listDrafts());
      const created = createDraft(document, title);
      openDraft(created.id);
    },
    [openDraft],
  );

  // The one answer to "does the open draft exist": the topbar, the inspector
  // and the page all follow it, so a draft deleted in another tab gives the
  // not-found page, never a mix of not-found chrome and a live editor.
  const currentDraft = route.name === "editor" ? drafts.find((draft) => draft.id === route.draftId) : undefined;
  // The Style toggle, the inspector and the editor's title slot exist only
  // while a draft is open; a missing draft gets a plain page.
  const editing = currentDraft !== undefined;
  const pageTitle = route.name === "gallery" ? APP_NAME : (currentDraft?.title ?? "Draft not found");
  // The document title is the page's h1 (layout.md rule 10).
  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  const sections: NavSection[] = [
    {
      id: "primary",
      label: "Primary",
      items: [
        {
          id: "gallery",
          label: "Gallery",
          href: GALLERY_PATH,
          icon: <Icon name="gallery" />,
          children: drafts.map((draft) => ({ id: draft.id, label: draft.title, href: draftPath(draft.id) })),
        },
      ],
    },
  ];
  const path = route.name === "editor" ? draftPath(route.draftId) : GALLERY_PATH;

  return (
    <NavigateContext.Provider value={navigate}>
      <AppShell
        appName={APP_NAME}
        storageKey={SIDEBAR_STORAGE_KEY}
        sections={resolveNav(sections, path)}
        linkComponent={NavButton}
        lane={route.name === "editor" ? "full" : undefined}
        title={editing ? <span className="studio-title-slot" ref={setTitleSlot} /> : pageTitle}
        actions={
          editing ? (
            <>
              <span className="studio-actions-slot" ref={setActionsSlot} />
              <StyleToggle
                toggleRef={styleToggleRef}
                open={styleOpen}
                onOpen={() => changeStyleOpen(true)}
                onClose={closeStyle}
              />
              <ThemeToggle key={THEME_TOGGLE_KEY} />
            </>
          ) : route.name === "editor" ? (
            <ThemeToggle key={THEME_TOGGLE_KEY} />
          ) : (
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => seedDraft(MINIMAL_FIXTURE.document, "Untitled sequence")}
              >
                <span aria-hidden="true">+</span> New sequence
              </button>
              <ThemeToggle key={THEME_TOGGLE_KEY} />
            </>
          )
        }
        inspector={
          editing
            ? {
                title: "Style",
                open: styleOpen,
                onClose: closeStyle,
                content: <div className="studio-inspector-slot" ref={setInspectorSlot} />,
              }
            : undefined
        }
      >
        {route.name === "editor" ? (
          <EditorPage
            key={route.draftId}
            draft={currentDraft}
            slots={slots}
            onDraftsChanged={refreshDrafts}
            onCloseStyle={closeStyle}
            onBack={() => navigate(GALLERY_PATH)}
          />
        ) : (
          <GalleryPage
            drafts={drafts}
            onOpenDraft={openDraft}
            onSeedDraft={seedDraft}
            onDraftsChanged={refreshDrafts}
          />
        )}
      </AppShell>
    </NavigateContext.Provider>
  );
}
