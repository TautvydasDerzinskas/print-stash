import { createApp } from "./app";
import { API_PORT } from "./config";
import { scanMountImports } from "./services/mountImport";
import "./db"; // ensures storage directories exist before we start serving

const app = createApp();

app.listen(API_PORT, () => {
  console.log(`PrintStash API listening on port ${API_PORT}`);
  // Fire-and-forget background scan, mirrors MakersVault's lifespan background thread.
  scanMountImports().catch((err) => {
    console.error("[mount-import] Unhandled error during scan:", err);
  });
});
