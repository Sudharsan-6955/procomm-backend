import { randomInt } from "node:crypto";
import User from "../models/user.model.js";
import EmailOtp from "../models/emailOtp.model.js";
import { firebaseAdmin } from "../config/firebase.js";
import { sendOtpMail } from "../services/mail.service.js";
import {
	getBearerToken,
	hashOtp,
	isValidEmail,
	normalizeEmail,
	issueSessionToken,
} from "../services/auth-helper.service.js";
import { toUserPayload } from "../services/user-payload.service.js";

export async function verifyFirebasePhone(req, res, next) {
	try {
		const idToken = getBearerToken(req.headers.authorization) || req.body?.token;
		if (!idToken) {
			const error = new Error("Missing Firebase ID token");
			error.statusCode = 401;
			throw error;
		}

		const decoded = await firebaseAdmin.auth().verifyIdToken(idToken);
		const firebaseUid = decoded?.uid;
		const phoneNumber = decoded?.phone_number;

		if (!firebaseUid || !phoneNumber) {
			const error = new Error("Invalid Firebase token payload. Sign in with phone auth and retry.");
			error.statusCode = 400;
			throw error;
		}

		let user = await User.findOne({ firebaseUid });

		if (!user) {
			const { name, profilePic } = req.body || {};
			user = await User.create({
				firebaseUid,
				phoneNumber,
				email: decoded?.email ? normalizeEmail(decoded.email) : undefined,
				name: name || "User " + phoneNumber.slice(-4),
				profilePic: profilePic || `https://i.pravatar.cc/150?img=${Math.floor(Math.random() * 100)}`,
				authProvider: "phone",
			});
		} else {
			let shouldSave = false;
			if (user.phoneNumber !== phoneNumber) {
				user.phoneNumber = phoneNumber;
				shouldSave = true;
			}
			if (req.body?.name && user.name === `User ${user.phoneNumber.slice(-4)}`) {
				user.name = req.body.name;
				shouldSave = true;
			}
			if (decoded?.email && !user.email) {
				user.email = normalizeEmail(decoded.email);
				shouldSave = true;
			}
			if (user.authProvider !== "phone") {
				user.authProvider = "phone";
				shouldSave = true;
			}
			user.lastSeenAt = new Date();
			shouldSave = true;

			if (shouldSave) {
				await user.save();
			}
		}

		res.status(200).json(toUserPayload(user));
	} catch (err) {
		next(err);
	}
}

export async function sendEmailOtpCode(req, res, next) {
	try {
		const email = normalizeEmail(req.body?.email);
		if (!isValidEmail(email)) {
			const error = new Error("Valid email is required");
			error.statusCode = 400;
			throw error;
		}

		const otp = String(randomInt(100000, 1000000));
		const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

		await EmailOtp.findOneAndUpdate(
			{ email },
			{ $set: { otpHash: hashOtp(email, otp), expiresAt, attempts: 0 } },
			{ upsert: true, new: true }
		);

		await sendOtpMail({ toEmail: email, otp });

		res.status(200).json({
			message: "OTP sent successfully",
			email,
			expiresInSeconds: 600,
		});
	} catch (err) {
		next(err);
	}
}

export async function verifyEmailOtpCode(req, res, next) {
	try {
		const email = normalizeEmail(req.body?.email);
		const otp = String(req.body?.otp || "").trim();

		if (!isValidEmail(email)) {
			const error = new Error("Valid email is required");
			error.statusCode = 400;
			throw error;
		}

		if (!/^\d{6}$/.test(otp)) {
			const error = new Error("Enter a valid 6-digit OTP");
			error.statusCode = 400;
			throw error;
		}

		const otpDoc = await EmailOtp.findOne({ email });
		if (!otpDoc) {
			const error = new Error("OTP not found. Request a new code.");
			error.statusCode = 400;
			throw error;
		}

		if (otpDoc.expiresAt.getTime() < Date.now()) {
			await EmailOtp.deleteOne({ _id: otpDoc._id });
			const error = new Error("OTP expired. Request a new code.");
			error.statusCode = 400;
			throw error;
		}

		if (otpDoc.attempts >= 5) {
			const error = new Error("Too many attempts. Request a new OTP.");
			error.statusCode = 429;
			throw error;
		}

		if (otpDoc.otpHash !== hashOtp(email, otp)) {
			otpDoc.attempts += 1;
			await otpDoc.save();
			const error = new Error("Invalid OTP code");
			error.statusCode = 400;
			throw error;
		}

		await EmailOtp.deleteOne({ _id: otpDoc._id });

		let user = await User.findOne({ email });
		if (!user) {
			const profileName = String(req.body?.name || "").trim();
			user = await User.create({
				email,
				name: profileName || email.split("@")[0],
				profilePic: `https://i.pravatar.cc/150?img=${Math.floor(Math.random() * 100)}`,
				authProvider: "email",
				firebaseUid: `email_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
			});
		} else {
			user.lastSeenAt = new Date();
			if (!user.authProvider) {
				user.authProvider = "email";
			}
			await user.save();
		}

		res.status(200).json({
			token: issueSessionToken(user),
			user: toUserPayload(user),
		});
	} catch (err) {
		next(err);
	}
}

export async function verifyFirebaseLogin(req, res, next) {
	try {
		const idToken = getBearerToken(req.headers.authorization) || req.body?.token;
		if (!idToken) {
			const error = new Error("Missing Firebase ID token");
			error.statusCode = 401;
			throw error;
		}

		const decoded = await firebaseAdmin.auth().verifyIdToken(idToken);
		const firebaseUid = decoded?.uid;
		const email = normalizeEmail(decoded?.email || req.body?.email);

		if (!firebaseUid || !isValidEmail(email)) {
			const error = new Error("Invalid Firebase token payload for email login");
			error.statusCode = 400;
			throw error;
		}

		let user = await User.findOne({ $or: [{ firebaseUid }, { email }] });
		const nextName = String(req.body?.name || decoded?.name || "").trim();
		const nextProfilePic = String(req.body?.profilePic || decoded?.picture || "").trim();

		if (!user) {
			user = await User.create({
				firebaseUid,
				email,
				name: nextName || email.split("@")[0],
				profilePic: nextProfilePic || `https://i.pravatar.cc/150?img=${Math.floor(Math.random() * 100)}`,
				authProvider: "google",
			});
		} else {
			let shouldSave = false;
			if (!user.firebaseUid || user.firebaseUid !== firebaseUid) {
				user.firebaseUid = firebaseUid;
				shouldSave = true;
			}
			if (!user.email || user.email !== email) {
				user.email = email;
				shouldSave = true;
			}
			if (nextName && user.name !== nextName) {
				user.name = nextName;
				shouldSave = true;
			}
			if (nextProfilePic && user.profilePic !== nextProfilePic) {
				user.profilePic = nextProfilePic;
				shouldSave = true;
			}
			if (user.authProvider !== "google") {
				user.authProvider = "google";
				shouldSave = true;
			}
			user.lastSeenAt = new Date();
			shouldSave = true;
			if (shouldSave) {
				await user.save();
			}
		}

		res.status(200).json({
			token: idToken,
			user: toUserPayload(user),
		});
	} catch (err) {
		next(err);
	}
}

export async function loginWithPhone(req, res, next) {
	try {
		const { phoneNumber, name, profilePic } = req.body || {};

		if (!phoneNumber || typeof phoneNumber !== "string") {
			const error = new Error("Phone number is required");
			error.statusCode = 400;
			throw error;
		}

		let user = await User.findOne({ phoneNumber: phoneNumber.trim() });

		if (!user) {
			const firebaseUid = `phone_${phoneNumber.replace(/\D/g, "")}_${Date.now()}`;
			user = await User.create({
				phoneNumber: phoneNumber.trim(),
				name: name || "User " + phoneNumber.slice(-4),
				profilePic: profilePic || `https://i.pravatar.cc/150?img=${Math.floor(Math.random() * 100)}`,
				firebaseUid,
				authProvider: "phone",
			});
		} else {
			user.lastSeenAt = new Date();
			user.authProvider = "phone";
			if (name) {
				user.name = name;
			}
			if (profilePic) {
				user.profilePic = profilePic;
			}
			await user.save();
		}

		const token = issueSessionToken(user);

		res.json({
			...toUserPayload(user),
			token,
		});
	} catch (err) {
		next(err);
	}
}
