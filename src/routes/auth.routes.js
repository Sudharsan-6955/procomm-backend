import { Router } from "express";
import {
	verifyFirebasePhone,
	verifyFirebaseLogin,
	sendEmailOtpCode,
	verifyEmailOtpCode,
	loginWithPhone,
} from "../controllers/auth.controller.js";

const router = Router();

router.post("/firebase-phone", verifyFirebasePhone);
router.post("/firebase-login", verifyFirebaseLogin);
router.post("/email-otp/send", sendEmailOtpCode);
router.post("/email-otp/verify", verifyEmailOtpCode);
router.post("/phone-login", loginWithPhone);

export default router;
