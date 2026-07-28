const { cpSync, mkdirSync } = require("node:fs");

mkdirSync("dist/config", { recursive: true });
cpSync("src/config/stations.json", "dist/config/stations.json");

mkdirSync("dist/openapi", { recursive: true });
cpSync("openapi/production-service.openapi.json", "dist/openapi/production-service.openapi.json");
