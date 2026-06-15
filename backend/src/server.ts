import http from "node:http";
import "dotenv/config";
import cors from "cors";
import express from "express";
import { Server } from "socket.io";
import {
  createRoom,
  getRoomState,
  joinRoom,
  removeMemberFromAllRooms,
  removeMemberFromRoom,
  sanitizeNickname,
  sanitizeSocketId
} from "./rooms.js";

const isDev = process.env.DEV === "true";
const port = Number(process.env.PORT ?? 4000);
const defaultFrontendOrigin = isDev ? "http://localhost:3000" : "";
const frontendOrigins = (process.env.FRONTEND_ORIGIN ?? defaultFrontendOrigin)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: frontendOrigins
  }
});

app.use(
  cors({
    origin: frontendOrigins
  })
);
app.use(express.json());

function emitRoomState(code: string) {
  const roomState = getRoomState(code);

  if (roomState) {
    io.to(roomState.code).emit("room-state", roomState);
  }
}

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/rooms", (request, response) => {
  const nickname = sanitizeNickname(request.body?.nickname);
  const socketId = sanitizeSocketId(request.body?.socketId);

  if (!nickname || !socketId) {
    response.status(400).json({ error: "Nickname and socketId are required." });
    return;
  }

  const roomState = createRoom({ nickname, socketId });
  const socket = io.sockets.sockets.get(socketId);

  if (socket) {
    socket.join(roomState.code);
  }

  response.status(201).json(roomState);
});

io.on("connection", (socket) => {
  socket.on("join-room", (payload, callback) => {
    const code = typeof payload?.code === "string" ? payload.code : "";
    const nickname = sanitizeNickname(payload?.nickname);

    if (!code || !nickname) {
      callback?.({ ok: false, reason: "invalid-request" });
      return;
    }

    const roomState = joinRoom(code, {
      socketId: socket.id,
      nickname
    });

    if (!roomState) {
      callback?.({ ok: false, reason: "room-not-found" });
      return;
    }

    socket.join(roomState.code);
    io.to(roomState.code).emit("room-state", roomState);
    callback?.({ ok: true, room: roomState });
  });

  socket.on("leave-room", (payload) => {
    const code = typeof payload?.code === "string" ? payload.code : "";

    if (!code) {
      return;
    }

    const updatedRoom = removeMemberFromRoom(code, socket.id);
    socket.leave(code.toUpperCase());

    if (updatedRoom) {
      emitRoomState(updatedRoom.code);
    }
  });

  socket.on("disconnect", () => {
    const { updatedRooms } = removeMemberFromAllRooms(socket.id);

    for (const roomState of updatedRooms) {
      io.to(roomState.code).emit("room-state", roomState);
    }
  });
});

httpServer.listen(port, () => {
  console.log(`Backbench Games backend listening on port ${port}`);
});
