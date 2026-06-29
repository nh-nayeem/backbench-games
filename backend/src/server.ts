import http from "node:http";
import path from "node:path";
import { randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { Server } from "socket.io";
import {
  COMPUTER_SOCKET_ID,
  createComputerRoom,
  createPrivateRoom,
  getRoomState,
  joinRoom,
  joinOrCreateMatchmakingRoom,
  listGames,
  removeMemberFromAllRooms,
  removeMemberFromRoom,
  playAgainDotsAndBoxes,
  playAgainHandCricket,
  playAgainNumberHunt,
  sanitizeGameId,
  sanitizeNickname,
  sanitizeSocketId,
  submitDotsAndBoxesEdge,
  submitHandCricketChoice,
  submitNumberHuntPick
} from "./rooms.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({
  path: path.resolve(dirname, "../.env")
});

const isDev = process.env.DEV === "true";
const port = Number(process.env.PORT ?? 4000);
const defaultFrontendOrigin = isDev ? "http://localhost:3000" : "";
const frontendOrigins = (process.env.FRONTEND_ORIGIN ?? defaultFrontendOrigin)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();
const httpServer = http.createServer(app);
const numberHuntBotTimers = new Map<string, ReturnType<typeof setTimeout>>();
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

    if (roomState.status === "in-game") {
      io.to(roomState.code).emit("match-ready", {
        code: roomState.code,
        gameId: roomState.gameId
      });
    }
  }
}

function clearNumberHuntBotTimer(code: string) {
  const normalizedCode = code.toUpperCase();
  const timer = numberHuntBotTimers.get(normalizedCode);

  if (timer) {
    clearTimeout(timer);
    numberHuntBotTimers.delete(normalizedCode);
  }
}

function scheduleNumberHuntBot(code: string) {
  const roomState = getRoomState(code);

  if (
    !roomState ||
    roomState.gameId !== "number-hunt" ||
    roomState.mode !== "computer" ||
    roomState.status !== "in-game" ||
    roomState.numberHunt?.status !== "playing"
  ) {
    return;
  }

  const target = roomState.numberHunt.currentTarget;
  clearNumberHuntBotTimer(roomState.code);

  const timer = setTimeout(() => {
    numberHuntBotTimers.delete(roomState.code);
    const nextRoomState = submitNumberHuntPick(
      roomState.code,
      COMPUTER_SOCKET_ID,
      target
    );

    if (!nextRoomState) {
      return;
    }

    io.to(nextRoomState.code).emit("room-state", nextRoomState);
    scheduleNumberHuntBot(nextRoomState.code);
  }, randomInt(1000, 15001));

  numberHuntBotTimers.set(roomState.code, timer);
}

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/games", (_request, response) => {
  response.json({ games: listGames() });
});

app.post("/rooms", (request, response) => {
  const nickname = sanitizeNickname(request.body?.nickname);
  const socketId = sanitizeSocketId(request.body?.socketId);

  if (!nickname || !socketId) {
    response.status(400).json({ error: "Nickname and socketId are required." });
    return;
  }

  const roomState = createPrivateRoom("hand-cricket", { nickname, socketId });
  const socket = io.sockets.sockets.get(socketId);

  if (socket) {
    socket.join(roomState.code);
  }

  scheduleNumberHuntBot(roomState.code);
  response.status(201).json(roomState);
});

app.post("/games/:gameId/rooms", (request, response) => {
  const gameId = sanitizeGameId(request.params.gameId);
  const nickname = sanitizeNickname(request.body?.nickname);
  const socketId = sanitizeSocketId(request.body?.socketId);

  if (!gameId) {
    response.status(404).json({ error: "Game not found." });
    return;
  }

  if (!nickname || !socketId) {
    response.status(400).json({ error: "Nickname and socketId are required." });
    return;
  }

  const roomState = createPrivateRoom(gameId, { nickname, socketId });
  const socket = io.sockets.sockets.get(socketId);

  if (socket) {
    socket.join(roomState.code);
  }

  response.status(201).json(roomState);
});

app.post("/games/:gameId/computer", (request, response) => {
  const gameId = sanitizeGameId(request.params.gameId);
  const nickname = sanitizeNickname(request.body?.nickname);
  const socketId = sanitizeSocketId(request.body?.socketId);

  if (!gameId) {
    response.status(404).json({ error: "Game not found." });
    return;
  }

  if (!nickname || !socketId) {
    response.status(400).json({ error: "Nickname and socketId are required." });
    return;
  }

  const roomState = createComputerRoom(gameId, { nickname, socketId });
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
    emitRoomState(roomState.code);
    callback?.({ ok: true, room: roomState });
  });

  socket.on("join-matchmaking", (payload, callback) => {
    const gameId = sanitizeGameId(payload?.gameId);
    const nickname = sanitizeNickname(payload?.nickname);

    if (!gameId || !nickname) {
      callback?.({ ok: false, reason: "invalid-request" });
      return;
    }

    const roomState = joinOrCreateMatchmakingRoom(gameId, {
      socketId: socket.id,
      nickname
    });

    if (!roomState) {
      callback?.({ ok: false, reason: "matchmaking-failed" });
      return;
    }

    socket.join(roomState.code);
    emitRoomState(roomState.code);
    callback?.({ ok: true, room: roomState });
  });

  socket.on("hand-cricket-choice", (payload, callback) => {
    const code = typeof payload?.code === "string" ? payload.code : "";
    const choice = Number(payload?.choice);
    const roomState = submitHandCricketChoice(code, socket.id, choice);

    if (!roomState) {
      callback?.({ ok: false, reason: "invalid-choice" });
      return;
    }

    io.to(roomState.code).emit("room-state", roomState);
    callback?.({ ok: true, room: roomState });
  });

  socket.on("hand-cricket-play-again", (payload, callback) => {
    const code = typeof payload?.code === "string" ? payload.code : "";
    const roomState = playAgainHandCricket(code, socket.id);

    if (!roomState) {
      callback?.({ ok: false, reason: "invalid-request" });
      return;
    }

    io.to(roomState.code).emit("room-state", roomState);
    callback?.({ ok: true, room: roomState });
  });

  socket.on("dots-and-boxes-edge", (payload, callback) => {
    const code = typeof payload?.code === "string" ? payload.code : "";
    const edge = payload?.edge;
    const orientation = edge?.orientation;

    if (orientation !== "horizontal" && orientation !== "vertical") {
      callback?.({ ok: false, reason: "invalid-edge" });
      return;
    }

    const roomState = submitDotsAndBoxesEdge(code, socket.id, {
      orientation,
      row: Number(edge?.row),
      col: Number(edge?.col)
    });

    if (!roomState) {
      callback?.({ ok: false, reason: "invalid-edge" });
      return;
    }

    io.to(roomState.code).emit("room-state", roomState);
    callback?.({ ok: true, room: roomState });
  });

  socket.on("dots-and-boxes-play-again", (payload, callback) => {
    const code = typeof payload?.code === "string" ? payload.code : "";
    const roomState = playAgainDotsAndBoxes(code, socket.id);

    if (!roomState) {
      callback?.({ ok: false, reason: "invalid-request" });
      return;
    }

    io.to(roomState.code).emit("room-state", roomState);
    callback?.({ ok: true, room: roomState });
  });

  socket.on("number-hunt-pick", (payload, callback) => {
    const code = typeof payload?.code === "string" ? payload.code : "";
    const selectedNumber = Number(payload?.number);
    const roomState = submitNumberHuntPick(code, socket.id, selectedNumber);

    if (!roomState) {
      callback?.({ ok: false, reason: "invalid-number" });
      return;
    }

    clearNumberHuntBotTimer(roomState.code);
    io.to(roomState.code).emit("room-state", roomState);
    scheduleNumberHuntBot(roomState.code);
    callback?.({ ok: true, room: roomState });
  });

  socket.on("number-hunt-play-again", (payload, callback) => {
    const code = typeof payload?.code === "string" ? payload.code : "";
    const roomState = playAgainNumberHunt(code, socket.id);

    if (!roomState) {
      callback?.({ ok: false, reason: "invalid-request" });
      return;
    }

    clearNumberHuntBotTimer(roomState.code);
    io.to(roomState.code).emit("room-state", roomState);
    scheduleNumberHuntBot(roomState.code);
    callback?.({ ok: true, room: roomState });
  });

  socket.on("leave-room", (payload) => {
    const code = typeof payload?.code === "string" ? payload.code : "";

    if (!code) {
      return;
    }

    const updatedRoom = removeMemberFromRoom(code, socket.id);
    clearNumberHuntBotTimer(code);
    socket.leave(code.toUpperCase());

    if (updatedRoom) {
      emitRoomState(updatedRoom.code);
    }
  });

  socket.on("disconnect", () => {
    const { updatedRooms, deletedRoomCodes } = removeMemberFromAllRooms(socket.id);

    for (const deletedRoomCode of deletedRoomCodes) {
      clearNumberHuntBotTimer(deletedRoomCode);
    }

    for (const roomState of updatedRooms) {
      io.to(roomState.code).emit("room-state", roomState);
    }
  });
});

httpServer.listen(port, () => {
  console.log(`Backbench Games backend listening on port ${port}`);
});
