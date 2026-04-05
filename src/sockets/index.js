import {
  getOnlineUserIds,
  registerUserSocket,
  unregisterSocket,
} from "../services/presence.service.js";
import {
  mapMessageShared,
  markMessagesDeliveredForUser,
  markMessagesReadForChat,
  userHasChatAccess,
} from "../services/message.service.js";

export const initSocket = (io) => {
  io.on("connection", (socket) => {
    socket.on("join", async () => {
      const normalizedUserId = String(socket.data.userId || "");
      if (!normalizedUserId) {
        return;
      }

      const result = registerUserSocket(normalizedUserId, socket.id);
      socket.data.userId = normalizedUserId;
      socket.join(`user:${normalizedUserId}`);

      socket.emit("presence:state", {
        onlineUserIds: getOnlineUserIds(),
      });

      if (!result.firstConnection) {
        return;
      }

      io.emit("presence:update", {
        userId: normalizedUserId,
        online: true,
      });

      const deliveredMessages = await markMessagesDeliveredForUser(normalizedUserId);
      for (const message of deliveredMessages) {
        const payload = mapMessageShared(message);
        io.to(`user:${String(message.senderId)}`).emit("message:updated", payload);
        io.to(`user:${normalizedUserId}`).emit("message:updated", payload);
      }
    });

    socket.on("joinChat", async (chatId) => {
      const userId = String(socket.data.userId || "");
      if (!userId || !chatId) {
        return;
      }

      const allowed = await userHasChatAccess(chatId, userId);
      if (!allowed) {
        return;
      }

      socket.join(`chat:${String(chatId)}`);
      // Note: Do NOT auto-mark as read on join
      // Wait for explicit chat:markRead event when user opens conversation
    });

    socket.on("chat:markRead", async (chatId) => {
      const userId = socket.data.userId;
      if (!userId || !chatId) {
        return;
      }

      // Batch mark all unread messages as read
      const readMessages = await markMessagesReadForChat(chatId, userId);
      
      // Broadcast updates to both participants
      for (const message of readMessages) {
        const payload = mapMessageShared(message);
        // Notify sender that message was read
        io.to(`user:${String(message.senderId)}`).emit("message:updated", payload);
        // Confirm to reader
        io.to(`user:${userId}`).emit("message:updated", payload);
      }

      // Also emit a read receipt confirmation event
      if (readMessages.length > 0) {
        io.to(`chat:${String(chatId)}`).emit("chat:messagesRead", {
          chatId: String(chatId),
          readBy: userId,
          messageCount: readMessages.length,
        });
      }
    });

    socket.on("message:send", (data) => {
      // Message creation is handled by authenticated REST endpoint.
      void data;
    });

    socket.on("typing", (data) => {
      const { chatId } = data;
      const userId = String(socket.data.userId || "");
      if (chatId) {
        socket.to(`chat:${String(chatId)}`).emit("user:typing", { userId });
      }
    });

    socket.on("disconnect", async () => {
      try {
        const result = await unregisterSocket(socket.id);
        if (result && !result.online) {
          io.emit("presence:update", {
            userId: String(result.userId),
            online: false,
            lastSeenAt: result.lastSeenAt,
          });
        }
      } catch (error) {
        console.error("Failed to unregister socket:", error);
      }
    });
  });
};