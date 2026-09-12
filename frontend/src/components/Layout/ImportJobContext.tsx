import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { useNavigate } from "react-router-dom";
import { importsApi, type ImportJob } from "../../api/imports";
import { UnauthorizedError } from "../../api/client";

type StartCollectionImportPayload = Parameters<typeof importsApi.fromCollection>[0];
type StartZipImportPayload = Parameters<typeof importsApi.zipFromLink>[0];
type StartThingiverseLikesImportPayload = Parameters<typeof importsApi.fromThingiverseLikes>[0];
type StartThingiverseCollectionImportPayload = Parameters<typeof importsApi.fromThingiverseCollection>[0];
type StartPrintablesCollectionImportPayload = Parameters<typeof importsApi.fromPrintablesCollection>[0];

type ImportJobContextValue = {
  /** Non-null exactly while a batch import (MakerWorld collection, a Thingiverse Collection or
   *  Likes list, or remote-zip) is running -- drives the global progress bar and disables the
   *  Add/Import/Upload menu app-wide. */
  activeJob: ImportJob | null;
  isImporting: boolean;
  startCollectionImport: (payload: StartCollectionImportPayload) => Promise<void>;
  startZipImport: (payload: StartZipImportPayload) => Promise<void>;
  startThingiverseLikesImport: (payload: StartThingiverseLikesImportPayload) => Promise<void>;
  startThingiverseCollectionImport: (payload: StartThingiverseCollectionImportPayload) => Promise<void>;
  startPrintablesCollectionImport: (payload: StartPrintablesCollectionImportPayload) => Promise<void>;
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
  const navigate = useNavigate();
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
      // Any finished import lands the viewer somewhere useful: exactly one resulting print (see
      // the backend's resultPrintId -- set for a "ZIP" job, or a "COLLECTION" batch job that
      // happened to succeed on just one item) opens straight to its details page, matching
      // useUploadImport's openForViewing for a synchronous single-link import. Not edit mode: an
      // import arrives with real metadata already, unlike a plain upload. More than one result
      // has no single "it" to open, so it goes to the models grid instead -- and nothing goes
      // anywhere for a job that imported nothing at all (every item failed).
      if (job.status === "DONE") {
        if (job.result_print_id) {
          navigate(`/models/${job.result_print_id}`);
        } else if (job.imported + job.already_in_library > 1) {
          // job.imported alone undercounts a batch where some items were dedup hits (already in
          // the library) rather than newly imported -- those still landed a real print each, and
          // still count toward "more than one result" the same as a fresh import would.
          navigate("/models");
        }
      }
    } catch (err) {
      stopPolling();
      setActiveJob(null);
      if (err instanceof UnauthorizedError) onUnauthorized?.();
    }
  }, [onUnauthorized, stopPolling, navigate]);

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

  const startThingiverseLikesImport = useCallback(async (payload: StartThingiverseLikesImportPayload) => {
    const { job_id } = await importsApi.fromThingiverseLikes(payload);
    const job = await importsApi.getImportJob(job_id);
    setActiveJob(job);
    startPolling(job_id);
  }, [startPolling]);

  const startThingiverseCollectionImport = useCallback(async (payload: StartThingiverseCollectionImportPayload) => {
    const { job_id } = await importsApi.fromThingiverseCollection(payload);
    const job = await importsApi.getImportJob(job_id);
    setActiveJob(job);
    startPolling(job_id);
  }, [startPolling]);

  const startPrintablesCollectionImport = useCallback(async (payload: StartPrintablesCollectionImportPayload) => {
    const { job_id } = await importsApi.fromPrintablesCollection(payload);
    const job = await importsApi.getImportJob(job_id);
    setActiveJob(job);
    startPolling(job_id);
  }, [startPolling]);

  const value = useMemo(
    () => ({
      activeJob,
      isImporting: activeJob !== null,
      startCollectionImport,
      startZipImport,
      startThingiverseLikesImport,
      startThingiverseCollectionImport,
      startPrintablesCollectionImport,
    }),
    [
      activeJob,
      startCollectionImport,
      startZipImport,
      startThingiverseLikesImport,
      startThingiverseCollectionImport,
      startPrintablesCollectionImport,
    ],
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
