import { Router } from "express";
import { technicalCatalog } from "../config/technicalCatalog.js";

export const technicalCatalogRouter = Router();
technicalCatalogRouter.get("/technical-catalog", (_req, res) => res.json(technicalCatalog));
