import { createApp } from "./app";
import { API_PORT } from "./config";
import "./db"; // ensures storage directories exist before we start serving

const app = createApp();

app.listen(API_PORT, () => {
  console.log(`PrintStash API listening on port ${API_PORT}`);
});
