import { createContext, useContext, useEffect } from "react";
import type React from "react";

export type PageHeader = { title?: string; actions?: React.ReactNode } | null;

/** Default no-op setter so usePageHeader is a harmless no-op for any page rendered outside
 *  AppLayout (e.g. tests) rather than throwing. */
export const PageHeaderContext = createContext<(header: PageHeader) => void>(() => {});

/** Lets a routed page override the shared TopBar's title/actions for as long as it's mounted --
 *  cleared automatically on unmount so the next route falls back to its own default chrome
 *  (see AppLayout's useRouteChrome). Pass `undefined` fields while data is still loading; the
 *  route's default title is used until a real title is available. */
export function usePageHeader(header: PageHeader) {
  const setHeader = useContext(PageHeaderContext);
  const title = header?.title;
  const actions = header?.actions;
  useEffect(() => {
    setHeader({ title, actions });
    return () => setHeader(null);
    // title/actions are the only meaningful inputs; setHeader is stable from AppLayout's state setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, actions]);
}
