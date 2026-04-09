import "dotenv/config";
import http from "http";
import { Server } from "socket.io";
import app from "./src/app.js";
import { initSocket } from "./src/sockets/index.js";
import { connectDb } from "./src/config/db.js";
import { firebaseAdmin } from "./src/config/firebase.js";
import User from "./src/models/user.model.js";
import { verifySessionToken } from "./src/services/auth-helper.service.js";

const port = Number(process.env.PORT) || 5000;

const server = http.createServer(app);

const defaultOrigins = [
  "https://procomm-frontend.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

const envOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins.length ? allowedOrigins : true,
    methods: ["GET", "POST"],
  },
});

io.use(async (socket, next) => {
  try {
    const authHeader = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
    const token = String(authHeader || "").startsWith("Bearer ")
      ? String(authHeader).slice(7)
      : String(authHeader || "");

    if (!token) {
      next(new Error("Unauthorized socket"));
      return;
    }

    try {
      const decodedFirebase = await firebaseAdmin.auth().verifyIdToken(token);
      const user = await User.findOne({ firebaseUid: decodedFirebase.uid }).select("_id");
      if (user) {
        socket.data.userId = String(user._id);
        next();
        return;
      }
    } catch {
      // Fall through to session token verification.
    }

    const decodedSession = verifySessionToken(token);
    if (!decodedSession?.uid) {
      next(new Error("Unauthorized socket"));
      return;
    }

    const user = await User.findById(decodedSession.uid).select("_id");
    if (!user) {
      next(new Error("Unauthorized socket"));
      return;
    }

    socket.data.userId = String(user._id);
    next();
  } catch {
    next(new Error("Unauthorized socket"));
  }
});

initSocket(io);

// Make io available to routes
app.set("io", io);

async function startServer() {
  try {
    await connectDb();
    server.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message || error);
    process.exit(1);
  }
}

startServer();