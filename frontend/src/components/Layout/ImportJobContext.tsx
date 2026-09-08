import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { importsApi, type ImportJob } from "../../api/imports";
import { UnauthorizedError } from "../../api/client";

type StartCollectionImportPayload = Parameters<typeof importsApi.fromCollection>[0];
type StartZipImportPayload = Parameters<typeof importsApi.zipFromLink>[0];

type ImportJobContextValue = {
  /** Non-null exactly while a batch import (MakerWorld collection or remote-zip) is running --
   *  drives the global progress bar and disables the Add/Import/Upload menu app-wide. */
  activeJob: ImportJob | null;
  isImporting: boolean;
  startCollectionImport: (payload: StartCollectionImportPayload) => Promise<void>;
  startZipImport: (payload: StartZipImportPayload) => Promise<void>;
};

const ImportJobContext = createContext<ImportJobContextValue | null>(null);

const POLL_INTERVAL_MS = 1000;

export function ImportJobProvider({
  onUnauthorized,
  onJobCompleted,
  children,
}: {
  onUnauthorized?: () => void;
  /** Called once, right after a job leaves RUNNING -- refreshes the current grid and the
   *  notification bell (the job's own completion is what created the notification). */
  onJobCompleted?: () => void;
  children: React.ReactNode;
}) {
  const [activeJob, setActiveJob] = useState<ImportJob | null>(null);
  const pollRef = useRef<number | null>(null);
  const onJobCompletedRef = useRef(onJobCompleted);
  onJobCompletedRef.current = onJobCompleted;

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollJob = useCallback(async (jobId: string) => {
    try {
      const job = await importsApi.getImportJob(jobId);
      if (job.status === "RUNNING") {
        setActiveJob(job);
        return;
      }
      stopPolling();
      setActiveJob(null);
      onJobCompletedRef.current?.();
    } catch (err) {
      stopPolling();
      setActiveJob(null);
      if (err instanceof UnauthorizedError) onUnauthorized?.();
    }
  }, [onUnauthorized, stopPolling]);

  const startPolling = useCallback((jobId: string) => {
    stopPolling();
    pollRef.current = window.setInterval(() => { void pollJob(jobId); }, POLL_INTERVAL_MS);
  }, [pollJob, stopPolling]);

  // Restores the progress bar / lock after a page refresh mid-import.
  useEffect(() => {
    (async () => {
      try {
        const job = await importsApi.getActiveImportJob();
        if (job && job.status === "RUNNING") {
          setActiveJob(job);
          startPolling(job.id);
        }
      } catch (err) {
        if (err instanceof UnauthorizedError) onUnauthorized?.();
      }
    })();
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCollectionImport = useCallback(async (payload: StartCollectionImportPayload) => {
    const { job_id } = await importsApi.fromCollection(payload);
    const job = await importsApi.getImportJob(job_id);
    setActiveJob(job);
    startPolling(job_id);
  }, [startPolling]);

  const startZipImport = useCallback(async (payload: StartZipImportPayload) => {
    const { job_id } = await importsApi.zipFromLink(payload);
    const job = await importsApi.getImportJob(job_id);
    setActiveJob(job);
    startPolling(job_id);
  }, [startPolling]);

  const value = useMemo(
    () => ({ activeJob, isImporting: activeJob !== null, startCollectionImport, startZipImport }),
    [activeJob, startCollectionImport, startZipImport],
  );

  return (
    <ImportJobContext.Provider value={value}>
      {children}
    </ImportJobContext.Provider>
  );
}

export function useImportJob() {
  const ctx = useContext(ImportJobContext);
  if (!ctx) throw new Error("useImportJob must be used within an ImportJobProvider");
  return ctx;
}
