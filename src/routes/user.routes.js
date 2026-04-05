import { Router } from "express";
import {
	getMyProfile,
	updateMyProfile,
	searchProfiles,
	getAllUsers,
	seedTestUsers,
	registerPushToken,
	unregisterPushToken,
} from "../controllers/user.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/me", requireAuth, getMyProfile);
router.patch("/me", requireAuth, updateMyProfile);
router.get("/search", requireAuth, searchProfiles);
router.get("/list/all", requireAuth, getAllUsers);
router.post("/push-token", requireAuth, registerPushToken);
router.delete("/push-token", requireAuth, unregisterPushToken);

if (process.env.ENABLE_SEED_ROUTE === "true") {
	router.post("/seed", requireAuth, seedTestUsers);
}

export default router;
