import { Router } from "express";
import { getMyChats, createOrGetDirectChat } from "../controllers/chat.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", requireAuth, getMyChats);
router.post("/direct", requireAuth, createOrGetDirectChat);

export default router;
