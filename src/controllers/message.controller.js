import Chat from "../models/chat.model.js";
import Message from "../models/message.model.js";
import {
	getChatPartnerIds,
	promoteMessageToDelivered,
} from "../services/message.service.js";
import { isUserOnline } from "../services/presence.service.js";
import { sendChatPushNotifications } from "../services/push.service.js";

const DELETE_FOR_EVERYONE_WINDOW_MS = 15 * 60 * 1000;
const EDIT_WINDOW_MS = 3 * 60 * 1000;

async function assertChatAccess(chatId, userId) {
	const chat = await Chat.findById(chatId);
	if (!chat) {
		const error = new Error("Chat not found");
		error.statusCode = 404;
		throw error;
	}

	const hasAccess = chat.participants.some((participant) => String(participant) === String(userId));
	if (!hasAccess) {
		const error = new Error("Access denied for this chat");
		error.statusCode = 403;
		throw error;
	}

	return chat;
}

async function assertMessageAccess(chatId, messageId, userId) {
	await assertChatAccess(chatId, userId);

	const message = await Message.findOne({ _id: messageId, chatId });
	if (!message) {
		const error = new Error("Message not found");
		error.statusCode = 404;
		throw error;
	}

	return message;
}

function mapMessageForUser(message, userId) {
	const userIdStr = String(userId);
	const deletedForEveryone = Boolean(message.deletedForEveryone?.isDeleted);

	return {
		_id: String(message._id),
		chatId: String(message.chatId),
		text: deletedForEveryone ? "This message was deleted" : message.text,
		senderId: String(message.senderId),
		mentions: (message.mentions || []).map((id) => String(id)),
		createdAt: message.createdAt,
		updatedAt: message.updatedAt,
		isEdited: Boolean(message.isEdited),
		editedAt: message.editedAt,
		isDeletedForEveryone: deletedForEveryone,
		deletedAt: message.deletedForEveryone?.deletedAt || null,
		isFavorite: (message.favoritedBy || []).some((id) => String(id) === userIdStr),
		isPinned: (message.pinnedBy || []).some((id) => String(id) === userIdStr),
		deliveryStatus: {
			status: message.deliveryStatus?.status || "sent",
			deliveredAt: message.deliveryStatus?.deliveredAt || null,
			readAt: message.deliveryStatus?.readAt || null,
		},
	};
}

function mapMessageShared(message) {
	const deletedForEveryone = Boolean(message.deletedForEveryone?.isDeleted);

	return {
		_id: String(message._id),
		chatId: String(message.chatId),
		text: deletedForEveryone ? "This message was deleted" : message.text,
		senderId: String(message.senderId),
		mentions: (message.mentions || []).map((id) => String(id)),
		createdAt: message.createdAt,
		updatedAt: message.updatedAt,
		isEdited: Boolean(message.isEdited),
		editedAt: message.editedAt,
		isDeletedForEveryone: deletedForEveryone,
		deletedAt: message.deletedForEveryone?.deletedAt || null,
		deliveryStatus: {
			status: message.deliveryStatus?.status || "sent",
			deliveredAt: message.deliveryStatus?.deliveredAt || null,
			readAt: message.deliveryStatus?.readAt || null,
		},
	};
}

async function refreshChatPreview(chatId) {
	const chat = await Chat.findById(chatId);
	if (!chat) {
		return;
	}

	const latest = await Message.findOne({
		chatId,
		"deletedForEveryone.isDeleted": { $ne: true },
	}).sort({ createdAt: -1 });

	chat.lastMessage = latest?.text || "";
	chat.lastMessageAt = latest?.createdAt || chat.updatedAt || new Date();
	await chat.save();
}

async function emitToChatParticipants(io, chatId, eventName, payload) {
	if (!io) {
		return;
	}

	const chat = await Chat.findById(chatId).select("participants");
	if (!chat) {
		return;
	}

	for (const participantId of chat.participants || []) {
		io.to(`user:${String(participantId)}`).emit(eventName, payload);
	}
}

export async function getMessagesByChat(req, res, next) {
	try {
		const { chatId } = req.params;
		await assertChatAccess(chatId, req.user._id);

		const messages = await Message.find({
			chatId,
			deletedFor: { $ne: req.user._id },
		}).sort({ createdAt: 1 });

		res.json(messages.map((msg) => mapMessageForUser(msg, req.user._id)));
	} catch (err) {
		next(err);
	}
}

export async function sendMessage(req, res, next) {
	try {
		const { chatId } = req.params;
		const { text, mentionUserIds = [] } = req.body;

		if (!text || !String(text).trim()) {
			const error = new Error("Message text is required");
			error.statusCode = 400;
			throw error;
		}

		const chat = await assertChatAccess(chatId, req.user._id);

		const safeMentions = mentionUserIds
			.filter((id) => chat.participants.some((participant) => String(participant) === String(id)))
			.slice(0, 10);

		const created = await Message.create({
			chatId,
			senderId: req.user._id,
			text: String(text).trim(),
			mentions: safeMentions,
		});

		const recipientIds = getChatPartnerIds(chat, req.user._id);
		if (recipientIds.some((participantId) => isUserOnline(participantId))) {
			await promoteMessageToDelivered(created);
		}

		chat.lastMessage = created.text;
		chat.lastMessageAt = created.createdAt;
		await chat.save();

		const payload = mapMessageForUser(created, req.user._id);

		const io = req.app.get("io");
		if (io) {
			const sharedPayload = {
				...mapMessageShared(created),
				senderName: req.user?.name || "New message",
			};
			for (const participantId of chat.participants || []) {
				io.to(`user:${String(participantId)}`).emit("message:new", sharedPayload);
			}
		}

		const pushRecipientIds = recipientIds.filter((participantId) => String(participantId) !== String(req.user._id));
		if (pushRecipientIds.length > 0) {
			try {
				await sendChatPushNotifications({
					recipientIds: pushRecipientIds,
					chatId,
					senderName: req.user?.name || "New message",
					messageText: created.text,
				});
			} catch (pushError) {
				console.warn("Push notification failed:", pushError?.message || pushError);
			}
		}

		res.status(201).json(payload);
	} catch (err) {
		next(err);
	}
}

export async function editMessage(req, res, next) {
	try {
		const { chatId, messageId } = req.params;
		const { text } = req.body;

		if (!text || !String(text).trim()) {
			const error = new Error("Updated text is required");
			error.statusCode = 400;
			throw error;
		}

		const message = await assertMessageAccess(chatId, messageId, req.user._id);
		if (String(message.senderId) !== String(req.user._id)) {
			const error = new Error("Only sender can edit this message");
			error.statusCode = 403;
			throw error;
		}

		if (message.deletedForEveryone?.isDeleted) {
			const error = new Error("Cannot edit a deleted message");
			error.statusCode = 400;
			throw error;
		}

		const createdAtMs = new Date(message.createdAt).getTime();
		const ageMs = Date.now() - createdAtMs;
		if (Number.isNaN(createdAtMs) || ageMs > EDIT_WINDOW_MS) {
			const error = new Error("Edit is only available for 3 minutes");
			error.statusCode = 400;
			throw error;
		}

		message.text = String(text).trim();
		message.isEdited = true;
		message.editedAt = new Date();
		await message.save();

		await refreshChatPreview(chatId);

		const io = req.app.get("io");
		await emitToChatParticipants(io, chatId, "message:updated", mapMessageShared(message));

		res.json(mapMessageForUser(message, req.user._id));
	} catch (err) {
		next(err);
	}
}

export async function toggleFavorite(req, res, next) {
	try {
		const { chatId, messageId } = req.params;
		const message = await assertMessageAccess(chatId, messageId, req.user._id);

		const userIdStr = String(req.user._id);
		const hasFavorite = (message.favoritedBy || []).some((id) => String(id) === userIdStr);

		if (hasFavorite) {
			message.favoritedBy = (message.favoritedBy || []).filter((id) => String(id) !== userIdStr);
		} else {
			message.favoritedBy = [...(message.favoritedBy || []), req.user._id];
		}

		await message.save();

		const payload = mapMessageForUser(message, req.user._id);
		const io = req.app.get("io");
		if (io) {
			io.to(`user:${userIdStr}`).emit("message:updated", payload);
		}

		res.json(payload);
	} catch (err) {
		next(err);
	}
}

export async function togglePin(req, res, next) {
	try {
		const { chatId, messageId } = req.params;
		const message = await assertMessageAccess(chatId, messageId, req.user._id);

		const userIdStr = String(req.user._id);
		const hasPin = (message.pinnedBy || []).some((id) => String(id) === userIdStr);

		if (hasPin) {
			message.pinnedBy = (message.pinnedBy || []).filter((id) => String(id) !== userIdStr);
		} else {
			message.pinnedBy = [...(message.pinnedBy || []), req.user._id];
		}

		await message.save();

		const payload = mapMessageForUser(message, req.user._id);
		const io = req.app.get("io");
		if (io) {
			io.to(`user:${userIdStr}`).emit("message:updated", payload);
		}

		res.json(payload);
	} catch (err) {
		next(err);
	}
}

export async function deleteMessage(req, res, next) {
	try {
		const { chatId, messageId } = req.params;
		const { scope } = req.body;
		const message = await assertMessageAccess(chatId, messageId, req.user._id);

		if (scope === "everyone") {
			if (String(message.senderId) !== String(req.user._id)) {
				const error = new Error("Only sender can delete for everyone");
				error.statusCode = 403;
				throw error;
			}

			const createdAtMs = new Date(message.createdAt).getTime();
			const ageMs = Date.now() - createdAtMs;
			if (Number.isNaN(createdAtMs) || ageMs > DELETE_FOR_EVERYONE_WINDOW_MS) {
				const error = new Error("Delete for everyone is only available for 15 minutes");
				error.statusCode = 400;
				throw error;
			}

			if (!message.deletedForEveryone?.isDeleted) {
				message.deletedForEveryone = {
					isDeleted: true,
					deletedAt: new Date(),
					deletedBy: req.user._id,
				};
				message.text = "This message was deleted";
				message.isEdited = false;
				message.editedAt = null;
				await message.save();
			}

			await refreshChatPreview(chatId);

			const payload = mapMessageForUser(message, req.user._id);
			const io = req.app.get("io");
			await emitToChatParticipants(io, chatId, "message:updated", mapMessageShared(message));

			res.json(payload);
			return;
		}

		const userIdStr = String(req.user._id);
		const alreadyDeletedForMe = (message.deletedFor || []).some((id) => String(id) === userIdStr);
		if (!alreadyDeletedForMe) {
			message.deletedFor = [...(message.deletedFor || []), req.user._id];
			await message.save();
		}

		const io = req.app.get("io");
		if (io) {
			io.to(`user:${userIdStr}`).emit("message:removed", {
				chatId: String(chatId),
				messageId: String(message._id),
			});
		}

		res.json({ ok: true, removed: true, messageId: String(message._id), chatId: String(chatId) });
	} catch (err) {
		next(err);
	}
}
