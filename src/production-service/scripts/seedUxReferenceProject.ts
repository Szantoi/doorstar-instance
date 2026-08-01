import "dotenv/config";
import { seedUxReferenceProject } from "./uxReferenceProjectFixture.js";

await seedUxReferenceProject({
  databaseUrl: process.env.DATABASE_URL,
  arguments: process.argv.slice(2),
  nodeEnv: process.env.NODE_ENV,
});

