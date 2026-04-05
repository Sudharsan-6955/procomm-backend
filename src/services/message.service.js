import Chat from "../models/chat.model.js";
import Message from "../models/message.model.js";

export async function userHasChatAccess(chatId, userId) {
	if (!chatId || !userId) {
		return false;
	}

	const chat = await Chat.findOne({
		_id: chatId,
		participants: userId,
	}).select("_id");

	return Boolean(chat);
}

function normalizeDeliveryStatus(message) {
	return {
		status: message.deliveryStatus?.status || "sent",
		deliveredAt: message.deliveryStatus?.deliveredAt || null,
		readAt: message.deliveryStatus?.readAt || null,
	};
}

export function mapMessageForUser(message, userId) {
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
		deliveryStatus: normalizeDeliveryStatus(message),
	};
}

export function mapMessageShared(message) {
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
		deliveryStatus: normalizeDeliveryStatus(message),
	};
}

export function getChatPartnerIds(chat, userId) {
	return (chat?.participants || [])
		.map((participant) => String(participant))
		.filter((participantId) => participantId !== String(userId));
}

export async function markMessagesDeliveredForUser(userId) {
	const chats = await Chat.find({ participants: userId }).select("_id");
	const chatIds = chats.map((chat) => chat._id);

	if (chatIds.length === 0) {
		return [];
	}

	const messages = await Message.find({
		chatId: { $in: chatIds },
		senderId: { $ne: userId },
		"deliveryStatus.status": "sent",
	});

	const deliveredAt = new Date();
	for (const message of messages) {
		message.deliveryStatus = {
			...(message.deliveryStatus || {}),
			status: "delivered",
			deliveredAt: message.deliveryStatus?.deliveredAt || deliveredAt,
		};
		await message.save();
	}

	return messages;
}

export async function markMessagesReadForChat(chatId, readerId) {
	const hasAccess = await userHasChatAccess(chatId, readerId);
	if (!hasAccess) {
		return [];
	}

	const messages = await Message.find({
		chatId,
		senderId: { $ne: readerId },
		"deliveryStatus.status": { $in: ["sent", "delivered"] },
	});

	if (messages.length === 0) {
		return [];
	}

	const readAt = new Date();
	for (const message of messages) {
		message.deliveryStatus = {
			...(message.deliveryStatus || {}),
			status: "read",
			deliveredAt: message.deliveryStatus?.deliveredAt || readAt,
			readAt,
		};
		await message.save();
	}

	return messages;
}

export async function promoteMessageToDelivered(message) {
	if (message.deliveryStatus?.status !== "sent") {
		return message;
	}

	message.deliveryStatus = {
		...(message.deliveryStatus || {}),
		status: "delivered",
		deliveredAt: message.deliveryStatus?.deliveredAt || new Date(),
	};
	
	const saved = await message.save();
	return saved;
}

export async function promoteMessageToRead(message) {
	if (message.deliveryStatus?.status === "read") {
		return message;
	}

	const now = new Date();
	message.deliveryStatus = {
		...(message.deliveryStatus || {}),
		status: "read",
		deliveredAt: message.deliveryStatus?.deliveredAt || now,
		readAt: now,
	};
	
	const saved = await message.save();
	return saved;
}
