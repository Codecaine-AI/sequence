import type { SequenceDocument } from "@codecaine-ai/sequence";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppShell, resolveNav, type NavSection, type ShellLinkProps } from "./_components/AppShell";
import { createDraft, listDrafts } from "./draft-store";
import { EditorPage, type ShellSlots } from "./EditorPage";
import { MINIMAL_FIXTURE, cloneSequenceDocument, nextDraftId } from "./fixtures";
import { GalleryPage } from "./GalleryPage";
import { Icon } from "./shared/_components/Icon";
import { useTheme } from "./useTheme";

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
const SIDEBAR_STORAGE_KEY = "sequence-studio.sidebar";
const STYLE_OPEN_KEY = "sequence-studio.showStyle";
const GALLERY_PATH = "/";
const DRAFT_PATH_PREFIX = "/drafts/";

const draftPath = (draftId: string): string => `${DRAFT_PATH_PREFIX}${encodeURIComponent(draftId)}`;

function routeFromPath(path: string): Route {
  return path.startsWith(DRAFT_PATH_PREFIX)
    ? { name: "editor", draftId: decodeURIComponent(path.slice(DRAFT_PATH_PREFIX.length)) }
    : { name: "gallery" };
}

function readStyleOpenPreference(): boolean {
  try {
    return window.localStorage.getItem(STYLE_OPEN_KEY) !== "false";
  } catch {
    return true;
  }
}

function writeStyleOpenPreference(open: boolean): void {
  try {
    window.localStorage.setItem(STYLE_OPEN_KEY, String(open));
  } catch {
    // A blocked localStorage should not break the toggle for this session.
  }
}

const NavigateContext = createContext<(path: string) => void>(() => undefined);

/** The shell's link component: a nav row that switches the in-memory route. */
function NavButton({ href, className, title, children, ...rest }: ShellLinkProps) {
  const navigate = useContext(NavigateContext);
  const dataActive = (rest as Record<string, unknown>)["data-active"] as string | undefined;
  return (
    <button
      type="button"
      className={className}
      title={title}
      aria-current={rest["aria-current"]}
      data-active={dataActive}
      onClick={() => navigate(href)}
    >
      {children}
    </button>
  );
}

export function App() {
  const [route, setRoute] = useState<Route>({ name: "gallery" });
  const [draftsVersion, setDraftsVersion] = useState(0);
  const [styleOpen, setStyleOpen] = useState(readStyleOpenPreference);
  const styleToggleRef = useRef<HTMLButtonElement>(null);
  const { theme, setTheme } = useTheme();
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

  const changeStyleOpen = useCallback((open: boolean) => {
    setStyleOpen(open);
    writeStyleOpenPreference(open);
  }, []);

  // Closing from inside the inspector (its close button, or Escape there or in
  // the rail) returns focus to the Style toggle. The shell's inspector returns
  // focus only to an opener it saw open the panel, and the editor mounts with
  // the panel already open.
  const closeStyle = useCallback(() => {
    changeStyleOpen(false);
    styleToggleRef.current?.focus({ preventScroll: true });
  }, [changeStyleOpen]);

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

  const themeToggle = (
    <button
      type="button"
      className="ds-shell-icon-button"
      aria-pressed={theme === "dark"}
      aria-label="Dark theme"
      title="Dark theme"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      <Icon name="moon" />
    </button>
  );

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
              <button
                ref={styleToggleRef}
                type="button"
                className="ds-shell-button"
                aria-expanded={styleOpen}
                aria-controls="ds-inspector"
                onClick={() => changeStyleOpen(!styleOpen)}
              >
                Style
              </button>
              {themeToggle}
            </>
          ) : route.name === "editor" ? (
            themeToggle
          ) : (
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => seedDraft(MINIMAL_FIXTURE.document, "Untitled sequence")}
              >
                <span aria-hidden="true">+</span> New sequence
              </button>
              {themeToggle}
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
            draftId={route.draftId}
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
