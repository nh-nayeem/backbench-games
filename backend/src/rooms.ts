import { randomInt } from "node:crypto";
import type {
  GameDefinition,
  GameId,
  HandCricketPlayerRole,
  Member,
  Room,
  RoomMode,
  RoomState
} from "./types.js";

const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const ROOM_CODE_LENGTH = 4;

export const games: Record<GameId, GameDefinition> = {
  "hand-cricket": {
    id: "hand-cricket",
    name: "Hand Cricket",
    minPlayers: 2,
    maxPlayers: 2
  },
  "dots-and-boxes": {
    id: "dots-and-boxes",
    name: "Dots and Boxes",
    minPlayers: 2,
    maxPlayers: 2
  }
};

const rooms = new Map<string, Room>();

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

function generateRoomCode() {
  let code = "";

  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }

  return code;
}

function getUniqueRoomCode() {
  let code = generateRoomCode();

  while (rooms.has(code)) {
    code = generateRoomCode();
  }

  return code;
}

function getGame(gameId: GameId) {
  return games[gameId];
}

function isSupportedGameId(gameId: string): gameId is GameId {
  return gameId === "hand-cricket" || gameId === "dots-and-boxes";
}

function toRoomState(code: string, room: Room): RoomState {
  return {
    code,
    gameId: room.gameId,
    gameName: getGame(room.gameId).name,
    mode: room.mode,
    status: room.status,
    capacity: room.capacity,
    members: room.members.map((member) => ({ ...member })),
    handCricket: room.handCricket
      ? {
          ...room.handCricket,
          submissions: { ...room.handCricket.submissions },
          lastBall: room.handCricket.lastBall
            ? { ...room.handCricket.lastBall }
            : null
        }
      : null
  };
}

function createHandCricketState(members: Member[]) {
  const firstBatterIndex = randomInt(members.length);
  const batter = members[firstBatterIndex];
  const bowler = members[firstBatterIndex === 0 ? 1 : 0];

  return {
    innings: 1 as const,
    batterSocketId: batter.socketId,
    bowlerSocketId: bowler.socketId,
    firstInningsBatterSocketId: batter.socketId,
    firstInningsScore: null,
    currentScore: 0,
    target: null,
    submissions: {},
    lastBall: null,
    winnerSocketId: null,
    resultText: null
  };
}

function maybeStartGame(room: Room) {
  if (room.status !== "waiting" || room.members.length < room.capacity) {
    return;
  }

  if (room.gameId !== "hand-cricket") {
    return;
  }

  room.status = "in-game";
  room.handCricket = createHandCricketState(room.members);
}

function getPlayerRole(room: Room, socketId: string): HandCricketPlayerRole | null {
  if (!room.handCricket || room.status !== "in-game") {
    return null;
  }

  if (room.handCricket.batterSocketId === socketId) {
    return "batting";
  }

  if (room.handCricket.bowlerSocketId === socketId) {
    return "bowling";
  }

  return null;
}

function getNickname(room: Room, socketId: string) {
  return (
    room.members.find((member) => member.socketId === socketId)?.nickname ??
    "Player"
  );
}

function resolveHandCricketBall(room: Room) {
  const game = room.handCricket;

  if (!game?.submissions.batter || !game.submissions.bowler) {
    return;
  }

  const batterChoice = game.submissions.batter;
  const bowlerChoice = game.submissions.bowler;
  const isOut = batterChoice === bowlerChoice;
  const runs = isOut ? 0 : batterChoice;

  game.lastBall = {
    batterChoice,
    bowlerChoice,
    runs,
    isOut
  };
  game.submissions = {};

  if (isOut && game.innings === 1) {
    const firstInningsScore = game.currentScore;
    const nextBatterSocketId = game.bowlerSocketId;
    const nextBowlerSocketId = game.batterSocketId;

    game.innings = 2;
    game.firstInningsScore = firstInningsScore;
    game.currentScore = 0;
    game.target = firstInningsScore + 1;
    game.batterSocketId = nextBatterSocketId;
    game.bowlerSocketId = nextBowlerSocketId;
    return;
  }

  if (isOut && game.innings === 2) {
    const firstBatterName = getNickname(room, game.firstInningsBatterSocketId);
    const firstInningsScore = game.firstInningsScore ?? 0;

    if (game.currentScore === firstInningsScore) {
      room.status = "finished";
      game.winnerSocketId = null;
      game.resultText = "Match tied.";
      return;
    }

    room.status = "finished";
    game.winnerSocketId = game.firstInningsBatterSocketId;
    game.resultText = `${firstBatterName} wins by ${
      firstInningsScore - game.currentScore
    } run(s).`;
    return;
  }

  game.currentScore += runs;

  if (game.innings === 2 && game.target && game.currentScore >= game.target) {
    const secondBatterName = getNickname(room, game.batterSocketId);

    room.status = "finished";
    game.winnerSocketId = game.batterSocketId;
    game.resultText = `${secondBatterName} wins by chasing the target.`;
  }
}

export function sanitizeNickname(nickname: unknown) {
  if (typeof nickname !== "string") {
    return "";
  }

  return nickname.trim().slice(0, 32);
}

export function sanitizeSocketId(socketId: unknown) {
  if (typeof socketId !== "string") {
    return "";
  }

  return socketId.trim();
}

export function sanitizeGameId(gameId: unknown) {
  if (typeof gameId !== "string" || !isSupportedGameId(gameId)) {
    return null;
  }

  return gameId;
}

export function listGames() {
  return Object.values(games);
}

export function createRoom(gameId: GameId, mode: RoomMode, creator: Member) {
  const code = getUniqueRoomCode();
  const game = getGame(gameId);

  rooms.set(code, {
    gameId,
    mode,
    status: "waiting",
    capacity: game.maxPlayers,
    members: [creator],
    handCricket: null
  });

  return toRoomState(code, rooms.get(code)!);
}

export function createPrivateRoom(gameId: GameId, creator: Member) {
  return createRoom(gameId, "private", creator);
}

export function getRoomState(code: string) {
  const normalizedCode = normalizeCode(code);
  const room = rooms.get(normalizedCode);

  if (!room) {
    return null;
  }

  return toRoomState(normalizedCode, room);
}

export function joinRoom(code: string, member: Member) {
  const normalizedCode = normalizeCode(code);
  const room = rooms.get(normalizedCode);

  if (!room) {
    return null;
  }

  const existingMember = room.members.find(
    (roomMember) => roomMember.socketId === member.socketId
  );

  if (existingMember) {
    existingMember.nickname = member.nickname;
  } else {
    if (room.members.length >= room.capacity) {
      return null;
    }

    room.members.push(member);
  }

  maybeStartGame(room);

  return toRoomState(normalizedCode, room);
}

export function joinOrCreateMatchmakingRoom(gameId: GameId, member: Member) {
  for (const [code, room] of rooms.entries()) {
    if (
      room.gameId === gameId &&
      room.mode === "matchmaking" &&
      room.status === "waiting" &&
      room.members.length < room.capacity
    ) {
      return joinRoom(code, member);
    }
  }

  return createRoom(gameId, "matchmaking", member);
}

export function submitHandCricketChoice(
  code: string,
  socketId: string,
  choice: number
) {
  const normalizedCode = normalizeCode(code);
  const room = rooms.get(normalizedCode);

  if (
    !room ||
    room.gameId !== "hand-cricket" ||
    !room.handCricket ||
    choice < 1 ||
    choice > 6
  ) {
    return null;
  }

  const role = getPlayerRole(room, socketId);

  if (role === "batting") {
    room.handCricket.submissions.batter = choice;
  }

  if (role === "bowling") {
    room.handCricket.submissions.bowler = choice;
  }

  resolveHandCricketBall(room);

  return toRoomState(normalizedCode, room);
}

export function removeMemberFromRoom(code: string, socketId: string) {
  const normalizedCode = normalizeCode(code);
  const room = rooms.get(normalizedCode);

  if (!room) {
    return null;
  }

  room.members = room.members.filter((member) => member.socketId !== socketId);

  if (room.members.length === 0) {
    rooms.delete(normalizedCode);
    return null;
  }

  if (room.status === "in-game" && !room.handCricket?.winnerSocketId) {
    const remainingMember = room.members[0];
    room.status = "finished";

    if (room.handCricket && remainingMember) {
      room.handCricket.winnerSocketId = remainingMember.socketId;
      room.handCricket.resultText = `${remainingMember.nickname} wins by walkover.`;
    }
  }

  return toRoomState(normalizedCode, room);
}

export function removeMemberFromAllRooms(socketId: string) {
  const updatedRooms: RoomState[] = [];
  const deletedRoomCodes: string[] = [];

  for (const [code, room] of rooms.entries()) {
    const originalMemberCount = room.members.length;
    room.members = room.members.filter((member) => member.socketId !== socketId);

    if (room.members.length === originalMemberCount) {
      continue;
    }

    if (room.members.length === 0) {
      rooms.delete(code);
      deletedRoomCodes.push(code);
      continue;
    }

    if (room.status === "in-game" && !room.handCricket?.winnerSocketId) {
      const remainingMember = room.members[0];
      room.status = "finished";

      if (room.handCricket && remainingMember) {
        room.handCricket.winnerSocketId = remainingMember.socketId;
        room.handCricket.resultText = `${remainingMember.nickname} wins by walkover.`;
      }
    }

    updatedRooms.push(toRoomState(code, room));
  }

  return { updatedRooms, deletedRoomCodes };
}
