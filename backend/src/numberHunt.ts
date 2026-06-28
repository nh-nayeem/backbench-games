export type NumberHuntPlayer = {
  socketId: string;
  nickname: string;
  connected: boolean;
};

export type NumberHuntLastLock = {
  number: number;
  socketId: string;
  nickname: string;
  playerIndex: 0 | 1;
};

export type NumberHuntState = {
  maxNumber: 100;
  players: [NumberHuntPlayer, NumberHuntPlayer];
  currentTarget: number;
  scores: [number, number];
  lastLock: NumberHuntLastLock | null;
  status: "playing" | "paused" | "finished";
  winnerIndex: 0 | 1 | null;
  resultText: string | null;
  disconnectedPlayerIndex: 0 | 1 | null;
};

const MAX_NUMBER = 100;

function getPlayerIndex(state: NumberHuntState, socketId: string) {
  const playerIndex = state.players.findIndex(
    (player) => player.socketId === socketId
  );

  return playerIndex === 0 || playerIndex === 1 ? playerIndex : null;
}

function completeGame(state: NumberHuntState) {
  state.status = "finished";
  state.disconnectedPlayerIndex = null;

  if (state.scores[0] > state.scores[1]) {
    state.winnerIndex = 0;
    state.resultText = `${state.players[0].nickname} wins.`;
    return;
  }

  if (state.scores[1] > state.scores[0]) {
    state.winnerIndex = 1;
    state.resultText = `${state.players[1].nickname} wins.`;
    return;
  }

  state.winnerIndex = null;
  state.resultText = "Game drawn.";
}

export function createNumberHuntState(
  players: [NumberHuntPlayer, NumberHuntPlayer]
): NumberHuntState {
  return {
    maxNumber: MAX_NUMBER,
    players,
    currentTarget: 1,
    scores: [0, 0],
    lastLock: null,
    status: "playing",
    winnerIndex: null,
    resultText: null,
    disconnectedPlayerIndex: null
  };
}

export function resetNumberHuntState(
  previousState: NumberHuntState
): NumberHuntState {
  return createNumberHuntState([
    { ...previousState.players[0], connected: true },
    { ...previousState.players[1], connected: true }
  ]);
}

export function applyNumberHuntPick(
  state: NumberHuntState,
  socketId: string,
  selectedNumber: number
) {
  if (
    state.status !== "playing" ||
    !Number.isInteger(selectedNumber) ||
    selectedNumber !== state.currentTarget
  ) {
    return false;
  }

  const playerIndex = getPlayerIndex(state, socketId);

  if (playerIndex === null) {
    return false;
  }

  const player = state.players[playerIndex];
  state.scores[playerIndex] += 1;
  state.lastLock = {
    number: selectedNumber,
    socketId,
    nickname: player.nickname,
    playerIndex
  };

  if (selectedNumber >= MAX_NUMBER) {
    completeGame(state);
    return true;
  }

  state.currentTarget = selectedNumber + 1;
  return true;
}

export function pauseNumberHuntPlayer(
  state: NumberHuntState,
  socketId: string
) {
  const playerIndex = getPlayerIndex(state, socketId);

  if (playerIndex === null || state.status === "finished") {
    return false;
  }

  state.players[playerIndex].connected = false;
  state.disconnectedPlayerIndex = playerIndex;
  state.status = "paused";
  return true;
}

export function reconnectNumberHuntPlayer(
  state: NumberHuntState,
  nickname: string,
  socketId: string
) {
  const playerIndex = state.players.findIndex(
    (player) => !player.connected && player.nickname === nickname
  );

  if (playerIndex !== 0 && playerIndex !== 1) {
    return false;
  }

  state.players[playerIndex].socketId = socketId;
  state.players[playerIndex].connected = true;
  state.disconnectedPlayerIndex = null;

  if (state.status === "paused" && state.players.every((player) => player.connected)) {
    state.status = "playing";
  }

  return true;
}
