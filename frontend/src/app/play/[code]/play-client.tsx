"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { NicknameScreen } from "../../components/NicknameScreen";
import {
  clearBackbenchStorage,
  ResetButton
} from "../../components/ResetButton";
import { ensureSocketConnected, getSocket } from "../../../lib/socket";
import type { DotsAndBoxesEdge, RoomState } from "../../../lib/types";

type JoinResponse =
  | {
      ok: true;
      room: RoomState;
    }
  | {
      ok: false;
      reason: string;
    };

type ChoiceResponse =
  | {
      ok: true;
      room: RoomState;
    }
  | {
      ok: false;
      reason: string;
    };

type DotsAndBoxesResponse = ChoiceResponse;

type PlayClientProps = {
  code: string;
};

const handChoices = [
  { value: 1, icon: "☝️" },
  { value: 2, icon: "✌️" },
  { value: 3, icon: "🤟" },
  { value: 4, icon: "🖖" },
  { value: 5, icon: "🖐️" },
  { value: 6, icon: "👍" }
];

function edgeKey(edge: DotsAndBoxesEdge) {
  return `${edge.orientation}:${edge.row}:${edge.col}`;
}

function getDotsPlayerInitial(nickname: string) {
  if (nickname === "Notebook Bot") {
    return "C";
  }

  return nickname.trim().charAt(0).toUpperCase() || "P";
}

export function PlayClient({ code }: PlayClientProps) {
  const router = useRouter();
  const [nickname, setNickname] = useState<string | null>(null);
  const [socketId, setSocketId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [status, setStatus] = useState<"joining" | "joined" | "not-found">(
    "joining"
  );
  const [pendingChoice, setPendingChoice] = useState<number | null>(null);
  const [pendingDotsEdge, setPendingDotsEdge] = useState<string | null>(null);
  const revealedBallKey = useRef("");
  const [showReveal, setShowReveal] = useState(false);
  const [error, setError] = useState("");

  const handCricket = roomState?.handCricket ?? null;
  const dotsAndBoxes = roomState?.dotsAndBoxes ?? null;
  const batter = roomState?.members.find(
    (member) => member.socketId === handCricket?.batterSocketId
  );
  const bowler = roomState?.members.find(
    (member) => member.socketId === handCricket?.bowlerSocketId
  );
  const role = useMemo(() => {
    if (!handCricket || !socketId) {
      return null;
    }

    if (handCricket.batterSocketId === socketId) {
      return "batting";
    }

    if (handCricket.bowlerSocketId === socketId) {
      return "bowling";
    }

    return null;
  }, [handCricket, socketId]);
  const hasSubmitted = Boolean(
    role === "batting"
      ? handCricket?.submissions.batter
      : handCricket?.submissions.bowler
  );
  const finalOutcome =
    roomState?.status === "finished" && handCricket
      ? handCricket.winnerSocketId === null
        ? "tie"
        : handCricket.winnerSocketId === socketId
          ? "win"
          : "lose"
      : null;
  const lastBallKey = handCricket?.lastBall
    ? [
        handCricket.innings,
        handCricket.currentScore,
        handCricket.lastBall.batterChoice,
        handCricket.lastBall.bowlerChoice,
        handCricket.lastBall.isOut
      ].join(":")
    : "";
  const shouldShowDrawOverlay =
    roomState?.status !== "finished" &&
    Boolean(handCricket) &&
    (Boolean(pendingChoice) || hasSubmitted || showReveal);

  useEffect(() => {
    setNickname(localStorage.getItem("backbench:nickname"));
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!nickname) {
      return;
    }

    let didCancel = false;
    const socket = getSocket();

    function handleRoomState(nextRoomState: RoomState) {
      if (nextRoomState.code === code) {
        setRoomState(nextRoomState);
        setStatus("joined");
        setPendingChoice(null);
        setPendingDotsEdge(null);
      }
    }

    socket.on("room-state", handleRoomState);

    async function joinPlayRoom() {
      try {
        const connectedSocket = await ensureSocketConnected();
        setSocketId(connectedSocket.id ?? null);

        if (didCancel) {
          return;
        }

        connectedSocket.emit(
          "join-room",
          { code, nickname },
          (response: JoinResponse) => {
            if (didCancel) {
              return;
            }

            if (!response.ok) {
              setStatus("not-found");
              return;
            }

            setRoomState(response.room);
            setStatus("joined");
          }
        );
      } catch (caughtError) {
        if (!didCancel) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Could not join game."
          );
        }
      }
    }

    joinPlayRoom();

    return () => {
      didCancel = true;
      socket.off("room-state", handleRoomState);
      socket.emit("leave-room", { code });
    };
  }, [code, nickname]);

  useEffect(() => {
    if (!lastBallKey || lastBallKey === revealedBallKey.current) {
      return;
    }

    revealedBallKey.current = lastBallKey;
    setShowReveal(true);

    const timeout = window.setTimeout(() => {
      setShowReveal(false);
    }, 1600);

    return () => window.clearTimeout(timeout);
  }, [lastBallKey]);

  function resetMemory() {
    clearBackbenchStorage();
    getSocket().disconnect();
    setNickname(null);
    setRoomState(null);
    setStatus("joining");
    setError("");
    router.push("/");
  }

  function submitChoice(choice: number) {
    setPendingChoice(choice);
    setError("");

    getSocket().emit(
      "hand-cricket-choice",
      { code, choice },
      (response: ChoiceResponse) => {
        if (!response.ok) {
          setPendingChoice(null);
          setError("Could not submit that choice.");
        }
      }
    );
  }

  function submitDotsAndBoxesEdge(edge: DotsAndBoxesEdge) {
    const nextPendingEdge = edgeKey(edge);
    setPendingDotsEdge(nextPendingEdge);
    setError("");

    getSocket().emit(
      "dots-and-boxes-edge",
      { code, edge },
      (response: DotsAndBoxesResponse) => {
        if (!response.ok) {
          setPendingDotsEdge(null);
          setError("Could not claim that line.");
        }
      }
    );
  }

  function playAgainDotsAndBoxes() {
    setError("");

    getSocket().emit(
      "dots-and-boxes-play-again",
      { code },
      (response: DotsAndBoxesResponse) => {
        if (!response.ok) {
          setError("Could not start a new game.");
        }
      }
    );
  }

  if (!isReady) {
    return null;
  }

  if (!nickname) {
    return <NicknameScreen onSave={setNickname} />;
  }

  if (status === "not-found") {
    return (
      <main className="page">
        <ResetButton nickname={nickname} onReset={resetMemory} />
        <section className="panel stack">
          <h1 className="title">Game not found</h1>
          <p className="muted">No active game exists for {code}.</p>
        </section>
      </main>
    );
  }

  if (roomState?.gameId === "dots-and-boxes") {
    const boardSize = dotsAndBoxes?.boardSize ?? 5;
    const dotCount = boardSize + 1;
    const dotGap = 84;
    const boardPadding = 28;
    const boardExtent = boardPadding * 2 + boardSize * dotGap;
    const claimedEdges = new Map(
      dotsAndBoxes?.edges.map((edge) => [edgeKey(edge), edge]) ?? []
    );
    const claimedBoxes = new Map(
      dotsAndBoxes?.boxes.map((box) => [`${box.row}:${box.col}`, box]) ?? []
    );
    const myPlayerIndex = dotsAndBoxes?.players.findIndex(
      (player) => player.socketId === socketId
    );
    const isMyTurn =
      dotsAndBoxes?.status === "playing" &&
      myPlayerIndex === dotsAndBoxes.currentPlayerIndex;
    const currentPlayer = dotsAndBoxes
      ? dotsAndBoxes.players[dotsAndBoxes.currentPlayerIndex]
      : null;
    const disconnectedPlayer =
      dotsAndBoxes?.disconnectedPlayerIndex === 0 ||
      dotsAndBoxes?.disconnectedPlayerIndex === 1
        ? dotsAndBoxes.players[dotsAndBoxes.disconnectedPlayerIndex]
        : null;
    const finalMessage =
      dotsAndBoxes?.status === "finished"
        ? dotsAndBoxes.resultText ??
          (dotsAndBoxes.winnerIndex === null
            ? "Game drawn."
            : `${dotsAndBoxes.players[dotsAndBoxes.winnerIndex].nickname} wins.`)
        : null;

    const horizontalEdges = Array.from({ length: dotCount }, (_row, row) =>
      Array.from({ length: boardSize }, (_col, col) => ({
        orientation: "horizontal" as const,
        row,
        col
      }))
    ).flat();
    const verticalEdges = Array.from({ length: boardSize }, (_row, row) =>
      Array.from({ length: dotCount }, (_col, col) => ({
        orientation: "vertical" as const,
        row,
        col
      }))
    ).flat();

    return (
      <main className="page app-page">
        <ResetButton nickname={nickname} onReset={resetMemory} />
        <div className="play-shell dots-play-shell">
          <aside className="paper-note play-meta-note">
            <div>
              <h1 className="title">Dots & Boxes</h1>
              <p className="muted">Room {code}</p>
            </div>

            {error ? <p className="error">{error}</p> : null}
            {!roomState || !dotsAndBoxes ? (
              <p className="muted">Loading game...</p>
            ) : null}

            {dotsAndBoxes ? (
              <>
              <div className="dots-scoreboard">
                {dotsAndBoxes.players.map((player, index) => (
                  <div
                    className={
                      index === dotsAndBoxes.currentPlayerIndex &&
                      dotsAndBoxes.status === "playing"
                        ? "dots-player dots-player-active"
                        : "dots-player"
                    }
                    key={player.socketId}
                  >
                    <span className="score-label">
                      {player.socketId === socketId ? "You" : "Opponent"}
                    </span>
                    <strong>
                      {player.nickname} ({getDotsPlayerInitial(player.nickname)})
                      {!player.connected ? " (disconnected)" : ""}
                    </strong>
                    <span>{dotsAndBoxes.scores[index]} box(es)</span>
                  </div>
                ))}
              </div>

              <p className="result">
                {dotsAndBoxes.status === "paused" && disconnectedPlayer
                  ? `${disconnectedPlayer.nickname} disconnected. Waiting for them to reconnect.`
                  : dotsAndBoxes.status === "finished"
                    ? finalMessage
                    : isMyTurn
                      ? "Your turn. Claim a line."
                    : `${currentPlayer?.nickname ?? "Player"}'s turn.`}
              </p>
              </>
            ) : null}
          </aside>

          <section className="panel stack wide-panel play-panel dots-game-panel">
            {dotsAndBoxes ? (
              <>

              <div className="dots-paper">
                <svg
                  aria-label="Dots and Boxes board"
                  className="dots-board"
                  role="img"
                  viewBox={`0 0 ${boardExtent} ${boardExtent}`}
                >
                  {Array.from({ length: boardSize }, (_boxRow, row) =>
                    Array.from({ length: boardSize }, (_boxCol, col) => {
                      const box = claimedBoxes.get(`${row}:${col}`);

                      return box ? (
                        <g key={`box:${row}:${col}`}>
                          <rect
                            className={
                              dotsAndBoxes.players[box.ownerIndex].socketId ===
                              socketId
                                ? "dots-box dots-box-mine"
                                : "dots-box dots-box-opponent"
                            }
                            height={dotGap - 10}
                            rx="8"
                            width={dotGap - 10}
                            x={boardPadding + col * dotGap + 5}
                            y={boardPadding + row * dotGap + 5}
                          />
                          <text
                            className={
                              dotsAndBoxes.players[box.ownerIndex].socketId ===
                              socketId
                                ? "dots-box-initial dots-box-initial-mine"
                                : "dots-box-initial dots-box-initial-opponent"
                            }
                            dominantBaseline="middle"
                            textAnchor="middle"
                            x={boardPadding + col * dotGap + dotGap / 2}
                            y={boardPadding + row * dotGap + dotGap / 2 + 2}
                          >
                            {getDotsPlayerInitial(
                              dotsAndBoxes.players[box.ownerIndex].nickname
                            )}
                          </text>
                        </g>
                      ) : null;
                    })
                  )}

                  {[...horizontalEdges, ...verticalEdges].map((edge) => {
                    const claimedEdge = claimedEdges.get(edgeKey(edge));
                    const x1 =
                      boardPadding +
                      edge.col * dotGap;
                    const y1 =
                      boardPadding +
                      edge.row * dotGap;
                    const x2 =
                      edge.orientation === "horizontal" ? x1 + dotGap : x1;
                    const y2 =
                      edge.orientation === "vertical" ? y1 + dotGap : y1;

                    if (claimedEdge) {
                      return (
                        <line
                          className={`dots-edge dots-edge-player-${claimedEdge.ownerIndex}`}
                          key={edgeKey(edge)}
                          x1={x1}
                          x2={x2}
                          y1={y1}
                          y2={y2}
                        />
                      );
                    }

                    return (
                      <line
                        className="dots-edge-hit"
                        key={edgeKey(edge)}
                        onClick={() => {
                          if (!isMyTurn || pendingDotsEdge) {
                            return;
                          }

                          submitDotsAndBoxesEdge(edge);
                        }}
                        opacity={isMyTurn && !pendingDotsEdge ? 1 : 0}
                        pointerEvents={
                          isMyTurn && !pendingDotsEdge ? "stroke" : "none"
                        }
                        x1={x1}
                        x2={x2}
                        y1={y1}
                        y2={y2}
                      />
                    );
                  })}

                  {Array.from({ length: dotCount }, (_dotRow, row) =>
                    Array.from({ length: dotCount }, (_dotCol, col) => (
                      <circle
                        className="dots-dot"
                        cx={boardPadding + col * dotGap}
                        cy={boardPadding + row * dotGap}
                        key={`dot:${row}:${col}`}
                        r="7"
                      />
                    ))
                  )}
                </svg>
              </div>

              {dotsAndBoxes.status === "finished" ? (
                <div className="dots-final">
                  <h2>{finalMessage}</h2>
                  <button
                    className="button"
                    onClick={playAgainDotsAndBoxes}
                    type="button"
                  >
                    Play Again
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="page app-page">
      <ResetButton nickname={nickname} onReset={resetMemory} />
      {shouldShowDrawOverlay && handCricket ? (
        <div className="draw-overlay" role="status">
          <div className="draw-pop">
            {showReveal && handCricket.lastBall ? (
              <>
                <p className="eyebrow">Draw revealed</p>
                <div className="draw-faceoff">
                  <span>{handChoices[handCricket.lastBall.batterChoice - 1].icon}</span>
                  <strong>vs</strong>
                  <span>{handChoices[handCricket.lastBall.bowlerChoice - 1].icon}</span>
                </div>
                <p className="draw-result">
                  {handCricket.lastBall.isOut
                    ? "Out!"
                    : `${handCricket.lastBall.runs} run(s)`}
                </p>
              </>
            ) : (
              <>
                <p className="eyebrow">Hands are hidden</p>
                <div className="draw-loader">
                  <span>✊</span>
                  <span>✋</span>
                  <span>🤞</span>
                </div>
                <p className="draw-result">Waiting for the draw...</p>
              </>
            )}
          </div>
        </div>
      ) : null}
      {finalOutcome && handCricket ? (
        <div className="draw-overlay" role="status">
          <div className={`result-pop result-pop-${finalOutcome}`}>
            <p className="eyebrow">Match finished</p>
            <div className="result-icon">
              {finalOutcome === "win"
                ? "🏆"
                : finalOutcome === "lose"
                  ? "😮"
                  : "🤝"}
            </div>
            <h2 className="result-title">
              {finalOutcome === "win"
                ? "You won!"
                : finalOutcome === "lose"
                  ? "You lost"
                  : "Match tied"}
            </h2>
            <p className="muted">{handCricket.resultText}</p>
          </div>
        </div>
      ) : null}
      <div className="play-shell">
        <aside className="paper-note play-meta-note">
          <div>
            <h1 className="title">Hand Cricket</h1>
            <p className="muted">Room {code}</p>
          </div>

          {error ? <p className="error">{error}</p> : null}
          {!roomState || !handCricket ? (
            <p className="muted">Loading game...</p>
          ) : null}

          {roomState && handCricket ? (
            <>
            <div className="score-grid">
              <div className="score-box">
                <span className="score-label">Innings</span>
                <strong>{handCricket.innings}</strong>
              </div>
              <div className="score-box">
                <span className="score-label">Score</span>
                <strong>{handCricket.currentScore}</strong>
              </div>
              <div className="score-box">
                <span className="score-label">Target</span>
                <strong>{handCricket.target ?? "-"}</strong>
              </div>
            </div>

            <div className="role-grid">
              <div className="member">
                <strong>Batting</strong>
                <span>
                  {batter?.nickname ?? "Player"}{" "}
                  {batter?.socketId === socketId ? "(you)" : "(opponent)"}
                </span>
              </div>
              <div className="member">
                <strong>Bowling</strong>
                <span>
                  {bowler?.nickname ?? "Player"}{" "}
                  {bowler?.socketId === socketId ? "(you)" : "(opponent)"}
                </span>
              </div>
            </div>

            {handCricket.lastBall ? (
              <p className="muted">
                Last ball: batter {handCricket.lastBall.batterChoice}, bowler{" "}
                {handCricket.lastBall.bowlerChoice}
                {handCricket.lastBall.isOut
                  ? ". Out."
                  : `. ${handCricket.lastBall.runs} run(s).`}
              </p>
            ) : null}

            {roomState.status === "finished" ? (
              <p className="result">{handCricket.resultText}</p>
            ) : null}
            </>
          ) : null}
        </aside>

        <section className="panel stack wide-panel play-panel play-stage-panel">
          {roomState && handCricket ? (
            roomState.status === "finished" ? (
              <p className="result">{handCricket.resultText}</p>
            ) : (
              <>
                <div
                  className={
                    hasSubmitted || pendingChoice
                      ? "hand-wheel hand-wheel-locked"
                      : "hand-wheel hand-wheel-active"
                  }
                >
                  <div className="wheel-center" aria-hidden="true">
                    <span>{role === "batting" ? "🏏" : "⚾"}</span>
                  </div>
                  {handChoices.map((choice) => (
                    <button
                      className="hand-button"
                      disabled={Boolean(pendingChoice) || hasSubmitted}
                      key={choice.value}
                      onClick={() => submitChoice(choice.value)}
                    >
                      <span className="hand-icon">{choice.icon}</span>
                      <span>{choice.value}</span>
                    </button>
                  ))}
                </div>
                {hasSubmitted || pendingChoice ? (
                  <p className="muted">Choice locked. Waiting for opponent...</p>
                ) : null}
              </>
            )
          ) : (
            <p className="muted">Loading game...</p>
          )}
        </section>
      </div>
    </main>
  );
}
