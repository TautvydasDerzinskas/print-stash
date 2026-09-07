/** The app's top-level views. There's no URL router (see App.tsx) -- this is plain state, shared
 *  as a type so App/AppLayout/Sidebar/TopBar all agree on the same set of names. */
export type ActiveView = "dashboard" | "library" | "settings" | "adminSettings";
