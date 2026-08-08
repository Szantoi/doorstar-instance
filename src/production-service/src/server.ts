import "dotenv/config";
import { createApp } from "./app.js";
import { logger } from "./logger.js";

const port = Number(process.env.PORT ?? 4610);
// The production API is reached through its local reverse proxy. Binding to
// loopback by default keeps a local/demo process off the LAN unless an
// explicitly reviewed deployment overrides HOST.
const host = process.env.HOST ?? "127.0.0.1";
const app = createApp();

app.listen(port, host, () => {
  logger.info({ port, host }, "production-service listening");
});
