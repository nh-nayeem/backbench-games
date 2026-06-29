export type DotsAndBoxesEdge = {
  orientation: "horizontal" | "vertical";
  row: number;
  col: number;
};

export type DotsAndBoxesPlayer = {
  socketId: string;
  nickname: string;
  connected: boolean;
};

export type DotsAndBoxesClaimedEdge = DotsAndBoxesEdge & {
  ownerIndex: number;
};

export type DotsAndBoxesBox = {
  row: number;
  col: number;
  ownerIndex: number;
};

export type DotsAndBoxesStatus = "playing" | "paused" | "finished";

export type DotsAndBoxesState = {
  boardSize: 8;
  players: [DotsAndBoxesPlayer, DotsAndBoxesPlayer];
  currentPlayerIndex: 0 | 1;
  edges: DotsAndBoxesClaimedEdge[];
  boxes: DotsAndBoxesBox[];
  scores: [number, number];
  status: DotsAndBoxesStatus;
  winnerIndex: 0 | 1 | null;
  resultText: string | null;
  disconnectedPlayerIndex: 0 | 1 | null;
};

const BOARD_SIZE = 8;
const TOTAL_BOXES = BOARD_SIZE * BOARD_SIZE;

function edgeKey(edge: DotsAndBoxesEdge) {
  return `${edge.orientation}:${edge.row}:${edge.col}`;
}

function isValidEdge(edge: DotsAndBoxesEdge) {
  if (edge.orientation === "horizontal") {
    return (
      Number.isInteger(edge.row) &&
      Number.isInteger(edge.col) &&
      edge.row >= 0 &&
      edge.row <= BOARD_SIZE &&
      edge.col >= 0 &&
      edge.col < BOARD_SIZE
    );
  }

  if (edge.orientation === "vertical") {
    return (
      Number.isInteger(edge.row) &&
      Number.isInteger(edge.col) &&
      edge.row >= 0 &&
      edge.row < BOARD_SIZE &&
      edge.col >= 0 &&
      edge.col <= BOARD_SIZE
    );
  }

  return false;
}

function hasEdge(edgeKeys: Set<string>, edge: DotsAndBoxesEdge) {
  return edgeKeys.has(edgeKey(edge));
}

function boxEdges(row: number, col: number): DotsAndBoxesEdge[] {
  return [
    { orientation: "horizontal", row, col },
    { orientation: "horizontal", row: row + 1, col },
    { orientation: "vertical", row, col },
    { orientation: "vertical", row, col: col + 1 }
  ];
}

function adjacentBoxes(edge: DotsAndBoxesEdge) {
  const boxes: Array<{ row: number; col: number }> = [];

  if (edge.orientation === "horizontal") {
    if (edge.row > 0) {
      boxes.push({ row: edge.row - 1, col: edge.col });
    }

    if (edge.row < BOARD_SIZE) {
      boxes.push({ row: edge.row, col: edge.col });
    }
  } else {
    if (edge.col > 0) {
      boxes.push({ row: edge.row, col: edge.col - 1 });
    }

    if (edge.col < BOARD_SIZE) {
      boxes.push({ row: edge.row, col: edge.col });
    }
  }

  return boxes;
}

function getPlayerIndex(state: DotsAndBoxesState, socketId: string) {
  const playerIndex = state.players.findIndex(
    (player) => player.socketId === socketId
  );

  return playerIndex === 0 || playerIndex === 1 ? playerIndex : null;
}

function completeGameIfNeeded(state: DotsAndBoxesState) {
  if (state.boxes.length < TOTAL_BOXES) {
    return;
  }

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

export function createDotsAndBoxesState(
  players: [DotsAndBoxesPlayer, DotsAndBoxesPlayer]
): DotsAndBoxesState {
  return {
    boardSize: BOARD_SIZE,
    players,
    currentPlayerIndex: 0,
    edges: [],
    boxes: [],
    scores: [0, 0],
    status: "playing",
    winnerIndex: null,
    resultText: null,
    disconnectedPlayerIndex: null
  };
}

export function resetDotsAndBoxesState(
  previousState: DotsAndBoxesState
): DotsAndBoxesState {
  return createDotsAndBoxesState([
    { ...previousState.players[0], connected: true },
    { ...previousState.players[1], connected: true }
  ]);
}

export function applyDotsAndBoxesMove(
  state: DotsAndBoxesState,
  socketId: string,
  edge: DotsAndBoxesEdge
) {
  if (state.status !== "playing" || !isValidEdge(edge)) {
    return false;
  }

  const playerIndex = getPlayerIndex(state, socketId);

  if (playerIndex === null || playerIndex !== state.currentPlayerIndex) {
    return false;
  }

  const claimedEdgeKeys = new Set(state.edges.map(edgeKey));

  if (hasEdge(claimedEdgeKeys, edge)) {
    return false;
  }

  state.edges.push({ ...edge, ownerIndex: playerIndex });
  claimedEdgeKeys.add(edgeKey(edge));

  const claimedBoxKeys = new Set(
    state.boxes.map((box) => `${box.row}:${box.col}`)
  );
  const completedBoxes = adjacentBoxes(edge).filter((box) => {
    if (claimedBoxKeys.has(`${box.row}:${box.col}`)) {
      return false;
    }

    return boxEdges(box.row, box.col).every((boxEdge) =>
      hasEdge(claimedEdgeKeys, boxEdge)
    );
  });

  for (const box of completedBoxes) {
    state.boxes.push({ ...box, ownerIndex: playerIndex });
  }

  state.scores[playerIndex] += completedBoxes.length;

  if (completedBoxes.length === 0) {
    state.currentPlayerIndex = playerIndex === 0 ? 1 : 0;
  }

  completeGameIfNeeded(state);

  return true;
}

export function getAvailableDotsAndBoxesEdges(state: DotsAndBoxesState) {
  const claimedEdgeKeys = new Set(state.edges.map(edgeKey));
  const edges: DotsAndBoxesEdge[] = [];

  for (let row = 0; row <= BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const edge = { orientation: "horizontal" as const, row, col };

      if (!hasEdge(claimedEdgeKeys, edge)) {
        edges.push(edge);
      }
    }
  }

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col <= BOARD_SIZE; col += 1) {
      const edge = { orientation: "vertical" as const, row, col };

      if (!hasEdge(claimedEdgeKeys, edge)) {
        edges.push(edge);
      }
    }
  }

  return edges;
}

export function getCompletingDotsAndBoxesEdges(state: DotsAndBoxesState) {
  const claimedEdgeKeys = new Set(state.edges.map(edgeKey));
  const claimedBoxKeys = new Set(
    state.boxes.map((box) => `${box.row}:${box.col}`)
  );

  return getAvailableDotsAndBoxesEdges(state).filter((edge) => {
    const edgeKeysAfterMove = new Set(claimedEdgeKeys);
    edgeKeysAfterMove.add(edgeKey(edge));

    return adjacentBoxes(edge).some((box) => {
      if (claimedBoxKeys.has(`${box.row}:${box.col}`)) {
        return false;
      }

      return boxEdges(box.row, box.col).every((boxEdge) =>
        hasEdge(edgeKeysAfterMove, boxEdge)
      );
    });
  });
}

export function pauseDotsAndBoxesPlayer(
  state: DotsAndBoxesState,
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

export function reconnectDotsAndBoxesPlayer(
  state: DotsAndBoxesState,
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
