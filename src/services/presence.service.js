import User from "../models/user.model.js";

const userSockets = new Map();
const socketUsers = new Map();

function toUserId(value) {
	return String(value || "");
}

export function registerUserSocket(userId, socketId) {
	const normalizedUserId = toUserId(userId);
	if (!normalizedUserId || !socketId) {
		return { online: false, firstConnection: false };
	}

	const existingUserId = socketUsers.get(socketId);
	if (existingUserId && existingUserId !== normalizedUserId) {
		const existingSockets = userSockets.get(existingUserId);
		if (existingSockets) {
			existingSockets.delete(socketId);
			if (existingSockets.size === 0) {
				userSockets.delete(existingUserId);
			}
		}
	}

	const sockets = userSockets.get(normalizedUserId) || new Set();
	const wasOffline = sockets.size === 0;
	sockets.add(socketId);
	userSockets.set(normalizedUserId, sockets);
	socketUsers.set(socketId, normalizedUserId);

	return {
		online: true,
		firstConnection: wasOffline,
	};
}

export async function unregisterSocket(socketId) {
	const userId = socketUsers.get(socketId);
	if (!userId) {
		return null;
	}

	socketUsers.delete(socketId);
	const sockets = userSockets.get(userId);
	if (!sockets) {
		return null;
	}

	sockets.delete(socketId);
	if (sockets.size > 0) {
		userSockets.set(userId, sockets);
		return { userId, online: true };
	}

	userSockets.delete(userId);
	const lastSeenAt = new Date();
	await User.findByIdAndUpdate(userId, { $set: { lastSeenAt } });

	return { userId, online: false, lastSeenAt };
}

export function isUserOnline(userId) {
	return userSockets.has(toUserId(userId));
}

export function getOnlineUserIds() {
	return Array.from(userSockets.keys());
}