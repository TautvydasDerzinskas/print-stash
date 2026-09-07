import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import { useTranslation } from "react-i18next";
import { uploadGeneratedThumbnail } from "../../../../../services/api";
import { type ResolvedTheme } from "../../../../../constants/settingsOptions";
import { generateModelSnapshot, queueSnapshotJob, snapshotCache } from "../../../../../services/modelSnapshotCache";

type SnapshotState = "idle" | "loading" | "error";
type ModelSnapshotProps = {
  url: string;
  ext: string;
  plateId?: string;
  theme: ResolvedTheme;
  mode?: "automatic" | "on-demand";
};

export function ModelSnapshot({ url, ext, plateId, mode = "automatic" }: ModelSnapshotProps) {
  const { t } = useTranslation(["library"]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [state, setState] = useState<SnapshotState>("idle");
  const [requested, setRequested] = useState(mode === "automatic");

  useEffect(() => {
    if (mode === "automatic") setRequested(true);
  }, [mode]);

  useEffect(() => {
    let disposed = false;
    let observer: IntersectionObserver | null = null;
    const cacheKey = plateId ? `plate:${plateId}` : url;
    if (snapshotCache.has(cacheKey)) {
      setSnapshot(snapshotCache.get(cacheKey)!);
      return;
    }
    const load = async () => {
      if (!containerRef.current) return;
      setState("loading");
      try {
        const rect = containerRef.current.getBoundingClientRect();
        const width = Math.max(120, Math.floor(rect.width || 240));
        const height = Math.max(120, Math.floor(rect.height || 180));
        const image = await queueSnapshotJob(async () => {
          if (disposed) return null;
          return generateModelSnapshot(url, ext, width, height, "light");
        });
        if (disposed || !image) return;
        snapshotCache.set(cacheKey, image);
        setSnapshot(image);
        setState("idle");
        if (plateId) {
          try {
            const imageBlob = await fetch(image).then(response => response.blob());
            await uploadGeneratedThumbnail(plateId, imageBlob);
          } catch (err) {
            console.warn("Generated preview could not be persisted:", err);
          }
        }
      } catch (err) {
        console.warn("Snapshot generation failed:", err);
        if (!disposed) {
          setState("error");
        }
      }
    };
    if (!requested) {
      setState("idle");
      return () => { disposed = true; };
    }
    if (mode === "automatic" && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer?.disconnect();
        void load();
      }, { rootMargin: "240px" });
      if (containerRef.current) observer.observe(containerRef.current);
    } else {
      void load();
    }
    return () => {
      disposed = true;
      observer?.disconnect();
    };
  }, [url, ext, plateId, mode, requested]);

  return (
    <Box
      ref={containerRef}
      sx={{
        width: "100%",
        height: "100%",
        bgcolor: "action.hover",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 1,
        overflow: "hidden",
      }}
    >
      {snapshot ? (
        <Box
          component="img"
          src={snapshot}
          alt={t("library:modelViewer.previewAlt")}
          sx={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : state === "loading" ? (
        <Typography variant="caption" color="text.secondary">
          {t("library:modelViewer.generatingPreview")}
        </Typography>
      ) : mode === "on-demand" && !requested ? (
        <Button
          type="button"
          size="small"
          variant="outlined"
          onClick={event => { event.stopPropagation(); setRequested(true); }}
        >
          {t("library:modelViewer.generatePreview")}
        </Button>
      ) : (
        <Typography variant="caption" color="text.secondary">
          {t("library:modelViewer.waitingToGenerate")}
        </Typography>
      )}
    </Box>
  );
}
