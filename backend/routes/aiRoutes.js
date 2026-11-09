import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import {
  handleSuggest,
  handleGetSummary,
  handleSuggestAliases,
} from "../controllers/aiController.js";

const router = Router();

// POST /api/ai/suggest (Signed-in users only)
router.post("/suggest", requireAuth, handleSuggest);

// GET /api/ai/summary/:shortCode
router.get("/summary/:shortCode", handleGetSummary);

// POST /api/ai/suggest-aliases (Signed-in users only)
router.post("/suggest-aliases", requireAuth, handleSuggestAliases);

export default router;
