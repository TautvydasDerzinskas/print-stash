import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { resolveCorsOrigins } from "./cors";
import { HttpError } from "./utils/fileUtils";

import healthRoutes from "./routes/health";
import authRoutes from "./routes/auth";
import printsRoutes from "./routes/prints";
import platesRoutes from "./routes/plates";
import foldersRoutes from "./routes/folders";
import printFilesRoutes from "./routes/printFiles";
import settingsRoutes from "./routes/settings";
import importsRoutes from "./routes/imports";
import collectionsRoutes from "./routes/collections";

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

  // Mounted under /api because the frontend is served separately by its own nginx container,
  // which reverse-proxies /api/* here unmodified (see frontend/nginx.conf).
  app.use("/api", healthRoutes);
  app.use("/api", authRoutes);
  app.use("/api", settingsRoutes);
  app.use("/api", printsRoutes);
  app.use("/api", platesRoutes);
  app.use("/api", foldersRoutes);
  app.use("/api", printFilesRoutes);
  app.use("/api", importsRoutes);
  app.use("/api", collectionsRoutes);

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
