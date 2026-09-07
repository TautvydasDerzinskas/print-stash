import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import fs from "node:fs";
import { resolveCorsOrigins } from "./cors";
import { FRONTEND_DIST } from "./config";
import { HttpError } from "./utils/fileUtils";

import healthRoutes from "./routes/health";
import authRoutes from "./routes/auth";
import printsRoutes from "./routes/prints";
import platesRoutes from "./routes/plates";
import foldersRoutes from "./routes/folders";
import printFilesRoutes from "./routes/printFiles";
import settingsRoutes from "./routes/settings";
import importsRoutes from "./routes/imports";

export function createApp(): Express {
  const app = express();

  const origins = resolveCorsOrigins();
  app.use(
    cors({
      origin: origins.includes("*") ? true : origins,
      credentials: true,
      exposedHeaders: ["X-Has-More", "X-Next-Offset"],
    }),
  );

  app.use(express.json());

  // Serves the frontend's built static files (index.html, assets/*) when present — i.e. in the
  // production Docker image, which bundles frontend + backend behind one origin/port so the UI
  // can call the API with plain relative paths (no /api prefix, no separate proxy). Absent in
  // local dev (`npm run dev`), where the Vite dev server is used instead and this is a no-op.
  if (fs.existsSync(FRONTEND_DIST)) {
    app.use(express.static(FRONTEND_DIST));
  }

  app.use(healthRoutes);
  app.use(authRoutes);
  app.use(settingsRoutes);
  app.use(printsRoutes);
  app.use(platesRoutes);
  app.use(foldersRoutes);
  app.use(printFilesRoutes);
  app.use(importsRoutes);

  // 404 fallback for unmatched routes.
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ detail: "Not found" });
  });

  // Central error handler: HttpError carries its own status, everything else is a 500.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ detail: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ detail: "Internal server error" });
  });

  return app;
}
