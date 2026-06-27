import { randomInt } from "node:crypto";
import {
  applyDotsAndBoxesMove,
  createDotsAndBoxesState,
  getAvailableDotsAndBoxesEdges,
  getCompletingDotsAndBoxesEdges,
  pauseDotsAndBoxesPlayer,
  reconnectDotsAndBoxesPlayer,
  resetDotsAndBoxesState,
  type DotsAndBoxesEdge
} from "./dotsAndBoxes.js";
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
const COMPUTER_SOCKET_ID = "computer:notebook-bot";
const COMPUTER_NICKNAME = "Notebook Bot";

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
      : null,
    dotsAndBoxes: room.dotsAndBoxes
      ? {
          ...room.dotsAndBoxes,
          players: [
            { ...room.dotsAndBoxes.players[0] },
            { ...room.dotsAndBoxes.players[1] }
          ],
          edges: room.dotsAndBoxes.edges.map((edge) => ({ ...edge })),
          boxes: room.dotsAndBoxes.boxes.map((box) => ({ ...box })),
          scores: [...room.dotsAndBoxes.scores] as [number, number]
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

function isComputerMember(member: Member) {
  return member.socketId === COMPUTER_SOCKET_ID;
}

function getComputerMember() {
  return {
    socketId: COMPUTER_SOCKET_ID,
    nickname: COMPUTER_NICKNAME
  };
}

function maybeStartGame(room: Room) {
  if (room.status !== "waiting" || room.members.length < room.capacity) {
    return;
  }

  if (room.gameId === "hand-cricket") {
    room.status = "in-game";
    room.handCricket = createHandCricketState(room.members);
  }

  if (room.gameId === "dots-and-boxes") {
    const players = room.members.map((member) => ({
      ...member,
      connected: true
    }));

    room.status = "in-game";
    room.dotsAndBoxes = createDotsAndBoxesState([
      players[0],
      players[1]
    ]);
  }
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

function replaceSocketIdInHandCricket(room: Room, oldSocketId: string, socketId: string) {
  const game = room.handCricket;

  if (!game) {
    return;
  }

  if (game.batterSocketId === oldSocketId) {
    game.batterSocketId = socketId;
  }

  if (game.bowlerSocketId === oldSocketId) {
    game.bowlerSocketId = socketId;
  }

  if (game.firstInningsBatterSocketId === oldSocketId) {
    game.firstInningsBatterSocketId = socketId;
  }
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

function submitComputerHandCricketChoice(room: Room) {
  if (room.mode !== "computer" || !room.handCricket || room.status !== "in-game") {
    return;
  }

  const computerRole = getPlayerRole(room, COMPUTER_SOCKET_ID);

  if (computerRole === "batting" && !room.handCricket.submissions.batter) {
    room.handCricket.submissions.batter = randomInt(1, 7);
  }

  if (computerRole === "bowling" && !room.handCricket.submissions.bowler) {
    room.handCricket.submissions.bowler = randomInt(1, 7);
  }

  resolveHandCricketBall(room);
}

function submitComputerDotsAndBoxesMoves(room: Room) {
  if (room.mode !== "computer" || !room.dotsAndBoxes) {
    return;
  }

  while (
    room.dotsAndBoxes.status === "playing" &&
    room.dotsAndBoxes.players[room.dotsAndBoxes.currentPlayerIndex].socketId ===
      COMPUTER_SOCKET_ID
  ) {
    const completingEdges = getCompletingDotsAndBoxesEdges(room.dotsAndBoxes);
    const availableEdges =
      completingEdges.length > 0
        ? completingEdges
        : getAvailableDotsAndBoxesEdges(room.dotsAndBoxes);

    if (availableEdges.length === 0) {
      return;
    }

    const edge = availableEdges[randomInt(availableEdges.length)];

    if (!applyDotsAndBoxesMove(room.dotsAndBoxes, COMPUTER_SOCKET_ID, edge)) {
      return;
    }
  }

  if (room.dotsAndBoxes.status === "finished") {
    room.status = "finished";
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
    handCricket: null,
    dotsAndBoxes: null
  });

  return toRoomState(code, rooms.get(code)!);
}

export function createPrivateRoom(gameId: GameId, creator: Member) {
  return createRoom(gameId, "private", creator);
}

export function createComputerRoom(gameId: GameId, creator: Member) {
  const roomState = createRoom(gameId, "computer", creator);
  const normalizedCode = normalizeCode(roomState.code);
  const room = rooms.get(normalizedCode);

  if (!room) {
    return roomState;
  }

  room.members.push(getComputerMember());
  maybeStartGame(room);
  submitComputerHandCricketChoice(room);
  submitComputerDotsAndBoxesMoves(room);

  return toRoomState(normalizedCode, room);
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
  } else if (room.mode === "computer") {
    const humanMember = room.members.find(
      (roomMember) =>
        !isComputerMember(roomMember) && roomMember.nickname === member.nickname
    );

    if (!humanMember) {
      return null;
    }

    const oldSocketId = humanMember.socketId;
    humanMember.socketId = member.socketId;
    replaceSocketIdInHandCricket(room, oldSocketId, member.socketId);

    if (room.dotsAndBoxes) {
      const humanPlayer = room.dotsAndBoxes.players.find(
        (player) => player.socketId === oldSocketId
      );

      if (humanPlayer) {
        humanPlayer.socketId = member.socketId;
        humanPlayer.connected = true;
      }
    }
  } else if (
    room.gameId === "dots-and-boxes" &&
    room.dotsAndBoxes &&
    reconnectDotsAndBoxesPlayer(room.dotsAndBoxes, member.nickname, member.socketId)
  ) {
    room.members.push(member);
  } else {
    if (room.gameId === "dots-and-boxes" && room.dotsAndBoxes) {
      return null;
    }

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

  if (!role) {
    return null;
  }

  if (role === "batting") {
    room.handCricket.submissions.batter = choice;
  }

  if (role === "bowling") {
    room.handCricket.submissions.bowler = choice;
  }

  submitComputerHandCricketChoice(room);
  resolveHandCricketBall(room);

  return toRoomState(normalizedCode, room);
}

export function submitDotsAndBoxesEdge(
  code: string,
  socketId: string,
  edge: DotsAndBoxesEdge
) {
  const normalizedCode = normalizeCode(code);
  const room = rooms.get(normalizedCode);

  if (
    !room ||
    room.gameId !== "dots-and-boxes" ||
    !room.dotsAndBoxes ||
    !applyDotsAndBoxesMove(room.dotsAndBoxes, socketId, edge)
  ) {
    return null;
  }

  submitComputerDotsAndBoxesMoves(room);

  if (room.dotsAndBoxes.status === "finished") {
    room.status = "finished";
  }

  return toRoomState(normalizedCode, room);
}

export function playAgainDotsAndBoxes(code: string, socketId: string) {
  const normalizedCode = normalizeCode(code);
  const room = rooms.get(normalizedCode);

  if (
    !room ||
    room.gameId !== "dots-and-boxes" ||
    !room.dotsAndBoxes ||
    room.dotsAndBoxes.status !== "finished" ||
    !room.dotsAndBoxes.players.every((player) => player.connected) ||
    !room.dotsAndBoxes.players.some((player) => player.socketId === socketId)
  ) {
    return null;
  }

  room.status = "in-game";
  room.dotsAndBoxes = resetDotsAndBoxesState(room.dotsAndBoxes);

  return toRoomState(normalizedCode, room);
}

export function removeMemberFromRoom(code: string, socketId: string) {
  const normalizedCode = normalizeCode(code);
  const room = rooms.get(normalizedCode);

  if (!room) {
    return null;
  }

  room.members = room.members.filter((member) => member.socketId !== socketId);

  if (room.mode === "computer") {
    rooms.delete(normalizedCode);
    return null;
  }

  if (room.members.length === 0) {
    rooms.delete(normalizedCode);
    return null;
  }

  if (room.gameId === "dots-and-boxes" && room.dotsAndBoxes) {
    pauseDotsAndBoxesPlayer(room.dotsAndBoxes, socketId);
    return toRoomState(normalizedCode, room);
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

    if (room.mode === "computer") {
      rooms.delete(code);
      deletedRoomCodes.push(code);
      continue;
    }

    if (room.members.length === 0) {
      rooms.delete(code);
      deletedRoomCodes.push(code);
      continue;
    }

    if (room.gameId === "dots-and-boxes" && room.dotsAndBoxes) {
      pauseDotsAndBoxesPlayer(room.dotsAndBoxes, socketId);
      updatedRooms.push(toRoomState(code, room));
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
