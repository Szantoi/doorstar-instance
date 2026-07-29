import "dotenv/config";

const sourceUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!sourceUrl) {
  throw new Error("DATABASE_URL or TEST_DATABASE_URL is required");
}

const testUrl = new URL(sourceUrl);
testUrl.searchParams.set("schema", "doorstar_test");
process.env.DATABASE_URL = testUrl.toString();
process.env.PORT ??= "4610";

await import("../src/server.js");
