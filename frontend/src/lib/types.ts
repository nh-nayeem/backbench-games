export type GameId = "hand-cricket" | "dots-and-boxes" | "number-hunt";

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

export type DotsAndBoxesEdge = {
  orientation: "horizontal" | "vertical";
  row: number;
  col: number;
};

export type DotsAndBoxesState = {
  boardSize: 5;
  players: [
    {
      socketId: string;
      nickname: string;
      connected: boolean;
    },
    {
      socketId: string;
      nickname: string;
      connected: boolean;
    }
  ];
  currentPlayerIndex: 0 | 1;
  edges: Array<DotsAndBoxesEdge & { ownerIndex: number }>;
  boxes: Array<{
    row: number;
    col: number;
    ownerIndex: number;
  }>;
  scores: [number, number];
  status: "playing" | "paused" | "finished";
  winnerIndex: 0 | 1 | null;
  resultText: string | null;
  disconnectedPlayerIndex: 0 | 1 | null;
};

export type NumberHuntState = {
  maxNumber: 100;
  players: [
    {
      socketId: string;
      nickname: string;
      connected: boolean;
    },
    {
      socketId: string;
      nickname: string;
      connected: boolean;
    }
  ];
  currentTarget: number;
  scores: [number, number];
  lastLock: {
    number: number;
    socketId: string;
    nickname: string;
    playerIndex: 0 | 1;
  } | null;
  status: "playing" | "paused" | "finished";
  winnerIndex: 0 | 1 | null;
  resultText: string | null;
  disconnectedPlayerIndex: 0 | 1 | null;
};

export type RoomState = {
  code: string;
  gameId: GameId;
  gameName: string;
  mode: "private" | "matchmaking" | "computer";
  status: "waiting" | "in-game" | "finished";
  capacity: number;
  members: Member[];
  handCricket: HandCricketState | null;
  dotsAndBoxes: DotsAndBoxesState | null;
  numberHunt: NumberHuntState | null;
};

export type GameDefinition = {
  id: GameId;
  name: string;
  minPlayers: number;
  maxPlayers: number;
};
