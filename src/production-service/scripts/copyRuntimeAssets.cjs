const { cpSync, mkdirSync } = require("node:fs");

mkdirSync("dist/config", { recursive: true });
cpSync("src/config/stations.json", "dist/config/stations.json");
cpSync("src/config/technicalCatalog.json", "dist/config/technicalCatalog.json");
cpSync("src/config/componentCalculatorProfiles.json", "dist/config/componentCalculatorProfiles.json");
cpSync("src/config/operationAuthority.json", "dist/config/operationAuthority.json");
cpSync("src/config/flowLabStations.json", "dist/config/flowLabStations.json");

mkdirSync("dist/openapi", { recursive: true });
cpSync("openapi/production-service.openapi.json", "dist/openapi/production-service.openapi.json");
