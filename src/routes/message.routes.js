import { Router } from "express";
import {
	deleteMessage,
	editMessage,
	getMessagesByChat,
	sendMessage,
	toggleFavorite,
	togglePin,
} from "../controllers/message.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/:chatId", requireAuth, getMessagesByChat);
router.post("/:chatId", requireAuth, sendMessage);
router.patch("/:chatId/:messageId/edit", requireAuth, editMessage);
router.patch("/:chatId/:messageId/favorite", requireAuth, toggleFavorite);
router.patch("/:chatId/:messageId/pin", requireAuth, togglePin);
router.patch("/:chatId/:messageId/delete", requireAuth, deleteMessage);

export default router;
