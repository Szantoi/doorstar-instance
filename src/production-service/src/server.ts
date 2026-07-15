import "dotenv/config";
import { createApp } from "./app.js";
import { logger } from "./logger.js";

const port = Number(process.env.PORT ?? 4610);
const app = createApp();

app.listen(port, () => {
  logger.info({ port }, "production-service listening");
});
