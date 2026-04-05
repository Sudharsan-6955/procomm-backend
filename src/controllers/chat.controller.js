import mongoose from "mongoose";
import Chat from "../models/chat.model.js";
import User from "../models/user.model.js";
import Message from "../models/message.model.js";

async function getUnreadCountForChat(chatId, userId) {
	const count = await Message.countDocuments({
		chatId,
		senderId: { $ne: userId },
		"deliveryStatus.status": { $in: ["sent", "delivered"] },
	});
	return count;
}

function toChatListItem(chat, currentUserId, unreadCount = 0) {
	const other = (chat.participants || []).find((participant) => String(participant._id) !== String(currentUserId));

	return {
		_id: String(chat._id),
		participants: (chat.participants || []).map((participant) => ({
			_id: String(participant._id),
			name: participant.name,
			phoneNumber: participant.phoneNumber,
			email: participant.email || "",
			profilePic: participant.profilePic,
			authProvider: participant.authProvider || "",
			about: participant.about || "",
			instagram: participant.instagram || "",
			facebook: participant.facebook || "",
			github: participant.github || "",
			linkedin: participant.linkedin || "",
			lastSeenAt: participant.lastSeenAt,
		})),
		otherUser: other
			? {
					_id: String(other._id),
					name: other.name,
					phoneNumber: other.phoneNumber,
					email: other.email || "",
					profilePic: other.profilePic,
					authProvider: other.authProvider || "",
					about: other.about || "",
					instagram: other.instagram || "",
					facebook: other.facebook || "",
					github: other.github || "",
					linkedin: other.linkedin || "",
					lastSeenAt: other.lastSeenAt,
			  }
			: null,
		lastMessage: chat.lastMessage || "",
		lastMessageAt: chat.lastMessageAt,
		unreadCount,
	};
}

export async function getMyChats(req, res, next) {
	try {
		const chats = await Chat.find({ participants: req.user._id })
			.populate("participants", "name phoneNumber email authProvider profilePic about instagram facebook github linkedin lastSeenAt")
			.sort({ lastMessageAt: -1 });

		const chatsWithUnread = await Promise.all(
			chats.map(async (chat) => {
				const unreadCount = await getUnreadCountForChat(String(chat._id), String(req.user._id));
				return toChatListItem(chat, req.user._id, unreadCount);
			})
		);

		res.json(chatsWithUnread);
	} catch (err) {
		next(err);
	}
}

export async function createOrGetDirectChat(req, res, next) {
	try {
		const { targetUserId } = req.body || {};
		if (!targetUserId || !mongoose.Types.ObjectId.isValid(targetUserId)) {
			const error = new Error("Valid targetUserId is required");
			error.statusCode = 400;
			throw error;
		}

		if (String(targetUserId) === String(req.user._id)) {
			const error = new Error("Cannot create direct chat with yourself");
			error.statusCode = 400;
			throw error;
		}

		const targetExists = await User.exists({ _id: targetUserId });
		if (!targetExists) {
			const error = new Error("Target user not found");
			error.statusCode = 404;
			throw error;
		}

		let chat = await Chat.findOne({
			participants: { $all: [req.user._id, targetUserId], $size: 2 },
		});

		if (!chat) {
			chat = await Chat.create({
				participants: [req.user._id, targetUserId],
				lastMessage: "",
				lastMessageAt: new Date(),
			});
		}

		await chat.populate("participants", "name phoneNumber email authProvider profilePic about instagram facebook github linkedin lastSeenAt");
		const unreadCount = await getUnreadCountForChat(String(chat._id), String(req.user._id));

		res.status(201).json(toChatListItem(chat, req.user._id, unreadCount));
	} catch (err) {
		next(err);
	}
}
