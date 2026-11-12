import { Router } from "express";
import { searchMarketplace } from "@/controllers/marketplace";
import { optionalAuth } from "@/middleware";

const searchRouter = Router();

searchRouter.get("/", optionalAuth, searchMarketplace);

export default searchRouter;
