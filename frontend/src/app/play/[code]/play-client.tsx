"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { NicknameScreen } from "../../components/NicknameScreen";
import {
  clearBackbenchStorage,
  ResetButton
} from "../../components/ResetButton";
import { ensureSocketConnected, getSocket } from "../../../lib/socket";
import type { RoomState } from "../../../lib/types";

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
  const revealedBallKey = useRef("");
  const [showReveal, setShowReveal] = useState(false);
  const [error, setError] = useState("");

  const handCricket = roomState?.handCricket ?? null;
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
      <section className="panel stack wide-panel play-panel">
        <div>
          <h1 className="title">Hand Cricket</h1>
          <p className="muted">Room {code}</p>
        </div>

        {error ? <p className="error">{error}</p> : null}
        {!roomState || !handCricket ? <p className="muted">Loading game...</p> : null}

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
            )}
          </>
        ) : null}
      </section>
    </main>
  );
}
