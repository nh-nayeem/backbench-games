export type GameId = "hand-cricket" | "dots-and-boxes";

export type Member = {
  socketId: string;
  nickname: string;
};

export type HandCricketState = {
  innings: 1 | 2;
  batterSocketId: string;
  bowlerSocketId: string;
  firstInningsBatterSocketId: string;
  firstInningsScore: number | null;
  currentScore: number;
  target: number | null;
  submissions: {
    batter?: number;
    bowler?: number;
  };
  lastBall: {
    batterChoice: number;
    bowlerChoice: number;
    runs: number;
    isOut: boolean;
  } | null;
  winnerSocketId: string | null;
  resultText: string | null;
};

export type RoomState = {
  code: string;
  gameId: GameId;
  gameName: string;
  mode: "private" | "matchmaking";
  status: "waiting" | "in-game" | "finished";
  capacity: number;
  members: Member[];
  handCricket: HandCricketState | null;
};

export type GameDefinition = {
  id: GameId;
  name: string;
  minPlayers: number;
  maxPlayers: number;
};
