/**
 * Elements in the app shell that the editor fills through portals: the topbar
 * title (the editable draft title), the topbar actions (the save notice) and
 * the inspector body (the Style rail). Null until the shell has mounted them.
 */
export type ShellSlots = {
  title: HTMLElement | null;
  actions: HTMLElement | null;
  inspector: HTMLElement | null;
};
