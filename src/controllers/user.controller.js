import User from "../models/user.model.js";
import { toUserPayload } from "../services/user-payload.service.js";

export async function seedTestUsers(req, res, next) {
	try {
		const testUsers = [
			{
				phoneNumber: "+10000000001",
				name: "Ava Thompson",
				profilePic: "https://i.pravatar.cc/150?img=32",
				firebaseUid: "test_user_ph1_001",
			},
			{
				phoneNumber: "+10000000002",
				name: "Jordan Mitchell",
				profilePic: "https://i.pravatar.cc/150?img=45",
				firebaseUid: "test_user_ph2_001",
			},
		];

		const created = [];
		for (const userData of testUsers) {
			const existing = await User.findOne({ phoneNumber: userData.phoneNumber });
			if (!existing) {
				const user = await User.create(userData);
				created.push({
					_id: String(user._id),
					phoneNumber: user.phoneNumber,
					name: user.name,
					profilePic: user.profilePic,
				});
			}
		}

		res.json({
			message: "Test users seeded successfully",
			created,
		});
	} catch (err) {
		next(err);
	}
}

export async function getMyProfile(req, res, next) {
	try {
		const user = await User.findByIdAndUpdate(
			req.user._id,
			{ $set: { lastSeenAt: new Date() } },
			{ new: true }
		);

		if (!user) {
			const error = new Error("User not found");
			error.statusCode = 404;
			throw error;
		}

		res.json(toUserPayload(user));
	} catch (err) {
		next(err);
	}
}

export async function updateMyProfile(req, res, next) {
	try {
		const { name, about, profilePic, instagram, facebook, github, linkedin } = req.body || {};
		const updates = {};

		if (typeof name === "string") {
			const trimmedName = name.trim();
			if (!trimmedName) {
				const error = new Error("Name cannot be empty");
				error.statusCode = 400;
				throw error;
			}
			updates.name = trimmedName;
		}

		if (typeof profilePic === "string") {
			updates.profilePic = profilePic.trim() || undefined;
		}

		if (typeof about === "string") {
			const trimmedAbout = about.trim();
			if (trimmedAbout.length > 50) {
				const error = new Error("About must be 50 characters or less");
				error.statusCode = 400;
				throw error;
			}
			updates.about = trimmedAbout;
		}

		if (typeof instagram === "string") {
			updates.instagram = instagram.trim();
		}

		if (typeof facebook === "string") {
			updates.facebook = facebook.trim();
		}

		if (typeof github === "string") {
			updates.github = github.trim();
		}

		if (typeof linkedin === "string") {
			updates.linkedin = linkedin.trim();
		}

		updates.lastSeenAt = new Date();

		const user = await User.findByIdAndUpdate(
			req.user._id,
			{ $set: updates },
			{ new: true, runValidators: true }
		);

		if (!user) {
			const error = new Error("User not found");
			error.statusCode = 404;
			throw error;
		}

		res.json(toUserPayload(user));
	} catch (err) {
		next(err);
	}
}

export async function searchProfiles(req, res, next) {
	try {
		const q = String(req.query?.q || "").trim();
		if (!q) {
			return res.json([]);
		}

		const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const pattern = new RegExp(escaped, "i");

		const users = await User.find({
			_id: { $ne: req.user._id },
			$or: [{ name: pattern }, { phoneNumber: pattern }, { email: pattern }],
		})
			.sort({ updatedAt: -1 })
			.limit(20)
			.select("name phoneNumber email profilePic lastSeenAt");

		res.json(
			users.map((user) => ({
				_id: String(user._id),
				name: user.name,
				phoneNumber: user.phoneNumber,
				email: user.email || "",
				profilePic: user.profilePic,
				lastSeenAt: user.lastSeenAt,
			}))
		);
	} catch (err) {
		next(err);
	}
}

export async function getAllUsers(req, res, next) {
	try {
		const limit = Math.min(Number(req.query?.limit) || 10, 50);
		const skip = Math.max(Number(req.query?.skip) || 0, 0);

		const users = await User.find({ _id: { $ne: req.user._id } })
			.sort({ lastSeenAt: -1 })
			.skip(skip)
			.limit(limit)
			.select("name phoneNumber email profilePic lastSeenAt");

		const total = await User.countDocuments({ _id: { $ne: req.user._id } });

		res.json({
			users: users.map((user) => ({
				_id: String(user._id),
				name: user.name,
				phoneNumber: user.phoneNumber,
				email: user.email || "",
				profilePic: user.profilePic,
				lastSeenAt: user.lastSeenAt,
			})),
			total,
			skip,
			limit,
		});
	} catch (err) {
		next(err);
	}
}

export async function registerPushToken(req, res, next) {
	try {
		const token = String(req.body?.token || "").trim();
		if (!token || token.length < 20) {
			const error = new Error("Valid push token is required");
			error.statusCode = 400;
			throw error;
		}

		await User.findByIdAndUpdate(req.user._id, { $addToSet: { fcmTokens: token } });
		res.json({ ok: true });
	} catch (err) {
		next(err);
	}
}

export async function unregisterPushToken(req, res, next) {
	try {
		const token = String(req.body?.token || "").trim();
		if (!token) {
			const error = new Error("Push token is required");
			error.statusCode = 400;
			throw error;
		}

		await User.findByIdAndUpdate(req.user._id, { $pull: { fcmTokens: token } });
		res.json({ ok: true });
	} catch (err) {
		next(err);
	}
}
