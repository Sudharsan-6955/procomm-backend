import User from "../models/user.model.js";
import { firebaseAdmin } from "../config/firebase.js";

function normalizeText(value, max = 120) {
	const text = String(value || "").replace(/\s+/g, " ").trim();
	if (!text) {
		return "New message";
	}
	if (text.length <= max) {
		return text;
	}
	return `${text.slice(0, max - 1)}...`;
}

export async function sendChatPushNotifications({ recipientIds = [], chatId, senderName, messageText, messageId }) {
	const normalizedRecipientIds = recipientIds.map((id) => String(id));
	if (normalizedRecipientIds.length === 0) {
		return { successCount: 0, failureCount: 0 };
	}

	const recipients = await User.find({
		_id: { $in: normalizedRecipientIds },
		fcmTokens: { $exists: true, $ne: [] },
	}).select("_id fcmTokens");

	const tokenOwners = new Map();
	for (const user of recipients) {
		for (const token of user.fcmTokens || []) {
			if (!tokenOwners.has(token)) {
				tokenOwners.set(token, new Set());
			}
			tokenOwners.get(token).add(String(user._id));
		}
	}

	const tokens = Array.from(tokenOwners.keys());
	if (tokens.length === 0) {
		return { successCount: 0, failureCount: 0 };
	}

	const response = await firebaseAdmin.messaging().sendEachForMulticast({
		tokens,
		data: {
			type: "chat_message",
			chatId: String(chatId),
			messageId: String(messageId || ""),
			title: normalizeText(senderName || "ProComm", 60),
			body: normalizeText(messageText, 120),
			link: `/chat?chatId=${chatId}`,
		},
		webpush: {
			fcmOptions: {
				link: `/chat?chatId=${chatId}`,
			},
			notification: {
				tag: `chat-${chatId}`,
				requireInteraction: false,
			},
		},
	});

	const invalidTokenCodes = new Set([
		"messaging/invalid-registration-token",
		"messaging/registration-token-not-registered",
	]);

	const staleTokens = [];
	response.responses.forEach((result, index) => {
		if (!result.success && invalidTokenCodes.has(result.error?.code)) {
			staleTokens.push(tokens[index]);
		}
	});

	if (staleTokens.length > 0) {
		const staleUserIds = new Set();
		for (const token of staleTokens) {
			for (const userId of tokenOwners.get(token) || []) {
				staleUserIds.add(userId);
			}
		}

		await Promise.all(
			Array.from(staleUserIds).map((userId) =>
				User.findByIdAndUpdate(userId, { $pull: { fcmTokens: { $in: staleTokens } } })
			)
		);
	}

	return {
		successCount: response.successCount,
		failureCount: response.failureCount,
	};
}
