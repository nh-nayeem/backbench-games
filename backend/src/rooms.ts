import { randomInt } from "node:crypto";
import type { Member, Room, RoomState } from "./types.js";

const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const ROOM_CODE_LENGTH = 4;

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

function toRoomState(code: string, room: Room): RoomState {
  return {
    code,
    members: room.members.map((member) => ({ ...member }))
  };
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

export function createRoom(creator: Member) {
  const code = getUniqueRoomCode();

  rooms.set(code, {
    members: [creator]
  });

  return toRoomState(code, rooms.get(code)!);
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
    room.members.push(member);
  }

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
    } else {
      updatedRooms.push(toRoomState(code, room));
    }
  }

  return { updatedRooms, deletedRoomCodes };
}
