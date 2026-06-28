import type { DotsAndBoxesState } from "./dotsAndBoxes.js";
import type { NumberHuntState } from "./numberHunt.js";

export type Member = {
  socketId: string;
  nickname: string;
};

export type GameId = "hand-cricket" | "dots-and-boxes" | "number-hunt";

export type RoomMode = "private" | "matchmaking" | "computer";

export type RoomStatus = "waiting" | "in-game" | "finished";

export type GameDefinition = {
  id: GameId;
  name: string;
  minPlayers: number;
  maxPlayers: number;
};

export type HandCricketPlayerRole = "batting" | "bowling";

export type HandCricketSubmission = {
  batter?: number;
  bowler?: number;
};

export type HandCricketState = {
  innings: 1 | 2;
  batterSocketId: string;
  bowlerSocketId: string;
  firstInningsBatterSocketId: string;
  firstInningsScore: number | null;
  currentScore: number;
  target: number | null;
  submissions: HandCricketSubmission;
  lastBall: {
    batterChoice: number;
    bowlerChoice: number;
    runs: number;
    isOut: boolean;
  } | null;
  winnerSocketId: string | null;
  resultText: string | null;
};

export type Room = {
  gameId: GameId;
  mode: RoomMode;
  status: RoomStatus;
  capacity: number;
  members: Member[];
  handCricket: HandCricketState | null;
  dotsAndBoxes: DotsAndBoxesState | null;
  numberHunt: NumberHuntState | null;
};

export type RoomState = {
  code: string;
  gameId: GameId;
  gameName: string;
  mode: RoomMode;
  status: RoomStatus;
  capacity: number;
  members: Member[];
  handCricket: HandCricketState | null;
  dotsAndBoxes: DotsAndBoxesState | null;
  numberHunt: NumberHuntState | null;
};
