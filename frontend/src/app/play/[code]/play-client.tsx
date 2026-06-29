"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { NicknameScreen } from "../../components/NicknameScreen";
import {
  clearBackbenchStorage,
  ResetButton
} from "../../components/ResetButton";
import { ensureSocketConnected, getSocket } from "../../../lib/socket";
import type {
  DotsAndBoxesEdge,
  HandCricketState,
  RoomState
} from "../../../lib/types";

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
type NumberHuntResponse = ChoiceResponse;

type PlayClientProps = {
  code: string;
};

type HandCricketMeta = Pick<
  HandCricketState,
  "currentScore" | "innings" | "target"
>;

const handChoices = [
  { value: 1 },
  { value: 2 },
  { value: 3 },
  { value: 4 },
  { value: 5 },
  { value: 6 }
];

const cricketHandImages = [
  "/hand-cricket/hand-1-right.svg",
  "/hand-cricket/hand-2-right.svg",
  "/hand-cricket/hand-3-right.svg",
  "/hand-cricket/hand-4-right.svg",
  "/hand-cricket/hand-5-right.svg",
  "/hand-cricket/hand-6-right.svg"
];

function getCricketRevealHandSrc(choice: number) {
  return cricketHandImages[choice - 1] ?? cricketHandImages[0];
}

function getHandCricketLastBallKey(handCricket: HandCricketState | null) {
  return handCricket?.lastBall
    ? [
        handCricket.innings,
        handCricket.currentScore,
        handCricket.lastBall.batterChoice,
        handCricket.lastBall.bowlerChoice,
        handCricket.lastBall.isOut
      ].join(":")
    : "";
}

function edgeKey(edge: DotsAndBoxesEdge) {
  return `${edge.orientation}:${edge.row}:${edge.col}`;
}

function getDotsPlayerInitial(nickname: string) {
  if (nickname === "Notebook Bot") {
    return "C";
  }

  return nickname.trim().charAt(0).toUpperCase() || "P";
}

function getPlayerInitial(nickname: string) {
  if (nickname === "Notebook Bot") {
    return "C";
  }

  return nickname.trim().charAt(0).toUpperCase() || "P";
}

function getSeededNumberOrder(seedText: string, maxNumber: number) {
  const numbers = Array.from({ length: maxNumber }, (_item, index) => index + 1);
  let seed = 2166136261;

  for (const character of seedText) {
    seed ^= character.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }

  for (let index = numbers.length - 1; index > 0; index -= 1) {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507);
    seed = Math.imul(seed ^ (seed >>> 13), 3266489909);
    const swapIndex = Math.abs(seed ^ (seed >>> 16)) % (index + 1);
    const currentNumber = numbers[index];
    numbers[index] = numbers[swapIndex];
    numbers[swapIndex] = currentNumber;
  }

  return numbers;
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
  const [pendingNumber, setPendingNumber] = useState<number | null>(null);
  const [numberFeedback, setNumberFeedback] = useState<{
    number: number;
    type: "accepted" | "opponent" | "wrong";
  } | null>(null);
  const revealedBallKey = useRef("");
  const drawWheelDelay = useRef<number | null>(null);
  const roleAnnouncementTimeout = useRef<number | null>(null);
  const lastRoleAnnouncementKey = useRef("");
  const roomStateRef = useRef<RoomState | null>(null);
  const lastVisibleHandCricketMeta = useRef<HandCricketMeta | null>(null);
  const numberFeedbackTimeout = useRef<number | null>(null);
  const numberPendingFinishTimeout = useRef<number | null>(null);
  const lastNumberHuntLockKey = useRef("__initial");
  const [heldHandCricketMeta, setHeldHandCricketMeta] =
    useState<HandCricketMeta | null>(null);
  const [visibleHandCricketMeta, setVisibleHandCricketMeta] =
    useState<HandCricketMeta | null>(null);
  const [showReveal, setShowReveal] = useState(false);
  const [showRevealChoices, setShowRevealChoices] = useState(false);
  const [showRevealScore, setShowRevealScore] = useState(false);
  const [showDrawWheel, setShowDrawWheel] = useState(false);
  const [roleAnnouncement, setRoleAnnouncement] = useState<
    "batting" | "bowling" | null
  >(null);
  const [error, setError] = useState("");

  const handCricket = roomState?.handCricket ?? null;
  const dotsAndBoxes = roomState?.dotsAndBoxes ?? null;
  const numberHunt = roomState?.numberHunt ?? null;
  const numberHuntNumbers = useMemo(
    () => getSeededNumberOrder(code, numberHunt?.maxNumber ?? 64),
    [code, numberHunt?.maxNumber]
  );
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
  const lastBallKey = getHandCricketLastBallKey(handCricket);
  const batterRevealHandSrc = handCricket?.lastBall
    ? getCricketRevealHandSrc(handCricket.lastBall.batterChoice)
    : null;
  const bowlerRevealHandSrc = handCricket?.lastBall
    ? getCricketRevealHandSrc(handCricket.lastBall.bowlerChoice)
    : null;
  const displayedHandCricketMeta =
    showReveal && !showRevealScore
      ? visibleHandCricketMeta ??
        heldHandCricketMeta ??
        lastVisibleHandCricketMeta.current ??
        handCricket
      : visibleHandCricketMeta ?? handCricket;
  const shouldShowFinalOutcome = Boolean(finalOutcome && handCricket && !showReveal);
  const shouldShowCricketStage =
    roomState?.status !== "finished" || Boolean(showReveal && handCricket?.lastBall);

  const roleAnnouncementText =
    roleAnnouncement === "batting"
      ? "You are batting"
      : roleAnnouncement === "bowling"
        ? "You are bowling"
        : "";
  const roleAnnouncementInningsText =
    handCricket?.innings === 2 ? "2nd innings" : "1st innings";

  useEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  useEffect(() => {
    if (handCricket && (!showReveal || showRevealScore)) {
      const nextVisibleMeta = {
        currentScore: handCricket.currentScore,
        innings: handCricket.innings,
        target: handCricket.target
      };

      lastVisibleHandCricketMeta.current = nextVisibleMeta;
      setVisibleHandCricketMeta(nextVisibleMeta);
    }
  }, [handCricket, showReveal, showRevealScore]);

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
        const previousHandCricket = roomStateRef.current?.handCricket;
        const nextHandCricket = nextRoomState.handCricket;
        const nextHandCricketBallKey =
          getHandCricketLastBallKey(nextHandCricket);

        if (
          previousHandCricket &&
          nextHandCricket?.lastBall &&
          nextHandCricketBallKey !== revealedBallKey.current
        ) {
          const previousMeta = {
            currentScore: previousHandCricket.currentScore,
            innings: previousHandCricket.innings,
            target: previousHandCricket.target
          };

          lastVisibleHandCricketMeta.current = previousMeta;
          setHeldHandCricketMeta(previousMeta);
          setVisibleHandCricketMeta(previousMeta);
          setShowDrawWheel(false);
          setShowReveal(true);
          setShowRevealChoices(false);
          setShowRevealScore(false);
        } else if (nextHandCricket) {
          const nextVisibleMeta = {
            currentScore: nextHandCricket.currentScore,
            innings: nextHandCricket.innings,
            target: nextHandCricket.target
          };

          lastVisibleHandCricketMeta.current = nextVisibleMeta;
          setVisibleHandCricketMeta(nextVisibleMeta);
        }

        roomStateRef.current = nextRoomState;
        setRoomState(nextRoomState);
        setStatus("joined");
        setPendingChoice(null);
        setPendingDotsEdge(null);

        const nextLastLock = nextRoomState.numberHunt?.lastLock;

        if (nextLastLock) {
          const nextLastLockKey = `${nextLastLock.number}:${nextLastLock.socketId}`;

          if (
            lastNumberHuntLockKey.current !== "__initial" &&
            lastNumberHuntLockKey.current !== nextLastLockKey &&
            nextLastLock.socketId !== socket.id
          ) {
            flashNumberFeedback(nextLastLock.number, "opponent");
          }

          lastNumberHuntLockKey.current = nextLastLockKey;
        } else if (
          nextRoomState.gameId === "number-hunt" &&
          lastNumberHuntLockKey.current === "__initial"
        ) {
          lastNumberHuntLockKey.current = "";
        }
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

            const responseHandCricket = response.room.handCricket;

            if (responseHandCricket) {
              const responseVisibleMeta = {
                currentScore: responseHandCricket.currentScore,
                innings: responseHandCricket.innings,
                target: responseHandCricket.target
              };

              lastVisibleHandCricketMeta.current = responseVisibleMeta;
              setVisibleHandCricketMeta(responseVisibleMeta);
            }

            roomStateRef.current = response.room;
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
    setShowDrawWheel(false);
    setShowReveal(true);
    setShowRevealChoices(false);
    setShowRevealScore(false);

    const revealChoicesTimeout = window.setTimeout(() => {
      setShowRevealChoices(true);
      setHeldHandCricketMeta(null);
    }, 850);

    const revealScoreTimeout = window.setTimeout(() => {
      const currentHandCricket = roomStateRef.current?.handCricket;

      setShowRevealScore(true);

      if (currentHandCricket) {
        const nextVisibleMeta = {
          currentScore: currentHandCricket.currentScore,
          innings: currentHandCricket.innings,
          target: currentHandCricket.target
        };

        lastVisibleHandCricketMeta.current = nextVisibleMeta;
        setVisibleHandCricketMeta(nextVisibleMeta);
      }
    }, 1850);

    const hideRevealTimeout = window.setTimeout(() => {
      setShowReveal(false);
      setShowRevealChoices(false);
      setShowRevealScore(false);
      setHeldHandCricketMeta(null);
      const currentHandCricket = roomStateRef.current?.handCricket;

      if (currentHandCricket) {
        const nextVisibleMeta = {
          currentScore: currentHandCricket.currentScore,
          innings: currentHandCricket.innings,
          target: currentHandCricket.target
        };

        lastVisibleHandCricketMeta.current = nextVisibleMeta;
        setVisibleHandCricketMeta(nextVisibleMeta);
      }
    }, 2900);

    return () => {
      window.clearTimeout(revealChoicesTimeout);
      window.clearTimeout(revealScoreTimeout);
      window.clearTimeout(hideRevealTimeout);
    };
  }, [lastBallKey]);

  useEffect(() => {
    if (!handCricket || roomState?.status === "finished" || !role) {
      if (roleAnnouncementTimeout.current) {
        window.clearTimeout(roleAnnouncementTimeout.current);
        roleAnnouncementTimeout.current = null;
      }

      setRoleAnnouncement(null);

      if (roomState?.status === "finished") {
        lastRoleAnnouncementKey.current = "";
      }

      return;
    }

    if (hasSubmitted || pendingChoice || showReveal) {
      if (roleAnnouncementTimeout.current) {
        window.clearTimeout(roleAnnouncementTimeout.current);
        roleAnnouncementTimeout.current = null;
      }

      setRoleAnnouncement(null);
      return;
    }

    const nextAnnouncementKey = [
      roomState?.code ?? code,
      handCricket.firstInningsBatterSocketId,
      handCricket.innings,
      role
    ].join(":");

    if (lastRoleAnnouncementKey.current === nextAnnouncementKey) {
      return;
    }

    if (roleAnnouncementTimeout.current) {
      window.clearTimeout(roleAnnouncementTimeout.current);
      roleAnnouncementTimeout.current = null;
    }

    lastRoleAnnouncementKey.current = nextAnnouncementKey;
    setRoleAnnouncement(role);

    roleAnnouncementTimeout.current = window.setTimeout(() => {
      setRoleAnnouncement(null);
      roleAnnouncementTimeout.current = null;
    }, 1300);
  }, [
    code,
    handCricket,
    hasSubmitted,
    pendingChoice,
    role,
    roomState?.code,
    roomState?.status,
    showReveal
  ]);

  useEffect(() => {
    if (drawWheelDelay.current) {
      window.clearTimeout(drawWheelDelay.current);
      drawWheelDelay.current = null;
    }

    setShowDrawWheel(false);

    if (
      !handCricket ||
      roomState?.status === "finished" ||
      hasSubmitted ||
      pendingChoice ||
      roleAnnouncement ||
      showReveal
    ) {
      return;
    }

    drawWheelDelay.current = window.setTimeout(() => {
      setShowDrawWheel(true);
      drawWheelDelay.current = null;
    }, 1500);

    return () => {
      if (drawWheelDelay.current) {
        window.clearTimeout(drawWheelDelay.current);
        drawWheelDelay.current = null;
      }
    };
  }, [
    handCricket,
    roomState?.status,
    hasSubmitted,
    pendingChoice,
    roleAnnouncement,
    showReveal
  ]);

  useEffect(() => {
    return () => {
      if (numberFeedbackTimeout.current) {
        window.clearTimeout(numberFeedbackTimeout.current);
      }

      if (numberPendingFinishTimeout.current) {
        window.clearTimeout(numberPendingFinishTimeout.current);
      }

      if (drawWheelDelay.current) {
        window.clearTimeout(drawWheelDelay.current);
      }

      if (roleAnnouncementTimeout.current) {
        window.clearTimeout(roleAnnouncementTimeout.current);
      }
    };
  }, []);

  function flashNumberFeedback(
    number: number,
    type: "accepted" | "opponent" | "wrong"
  ) {
    if (numberFeedbackTimeout.current) {
      window.clearTimeout(numberFeedbackTimeout.current);
    }

    setNumberFeedback(null);

    window.requestAnimationFrame(() => {
      setNumberFeedback({ number, type });
      numberFeedbackTimeout.current = window.setTimeout(
        () => {
          setNumberFeedback(null);
          numberFeedbackTimeout.current = null;
        },
        type === "wrong" ? 1500 : 1500
      );
    });
  }

  function showImmediateNumberFeedback(
    number: number,
    type: "accepted" | "opponent" | "wrong",
    durationMs = 1500
  ) {
    if (numberFeedbackTimeout.current) {
      window.clearTimeout(numberFeedbackTimeout.current);
    }

    setNumberFeedback({ number, type });
    numberFeedbackTimeout.current = window.setTimeout(() => {
      setNumberFeedback(null);
      numberFeedbackTimeout.current = null;
    }, durationMs);
  }

  function finishNumberHuntPick(
    selectedNumber: number,
    feedbackType: "accepted" | "wrong"
  ) {
    if (numberPendingFinishTimeout.current) {
      window.clearTimeout(numberPendingFinishTimeout.current);
    }

    numberPendingFinishTimeout.current = window.setTimeout(() => {
      setPendingNumber(null);
      flashNumberFeedback(selectedNumber, feedbackType);
      numberPendingFinishTimeout.current = null;
    }, 1000);
  }

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
    setShowDrawWheel(false);
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

  function playAgainHandCricket() {
    setError("");
    setPendingChoice(null);
    setShowReveal(false);
    setShowRevealChoices(false);
    setShowRevealScore(false);
    setShowDrawWheel(false);
    setHeldHandCricketMeta(null);
    setVisibleHandCricketMeta(null);

    getSocket().emit(
      "hand-cricket-play-again",
      { code },
      (response: ChoiceResponse) => {
        if (!response.ok) {
          setError("Could not start a new match.");
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

  function submitNumberHuntPick(selectedNumber: number) {
    if (!numberHunt || selectedNumber !== numberHunt.currentTarget) {
      if (numberPendingFinishTimeout.current) {
        window.clearTimeout(numberPendingFinishTimeout.current);
        numberPendingFinishTimeout.current = null;
      }

      setPendingNumber(null);
      flashNumberFeedback(selectedNumber, "wrong");
      return;
    }

    setPendingNumber(selectedNumber);
    setNumberFeedback(null);
    setError("");

    getSocket().emit(
      "number-hunt-pick",
      { code, number: selectedNumber },
      (response: NumberHuntResponse) => {
        if (!response.ok) {
          setPendingNumber(null);
          showImmediateNumberFeedback(selectedNumber, "opponent");
          return;
        }

        setPendingNumber(null);
        showImmediateNumberFeedback(selectedNumber, "accepted");
      }
    );
  }

  function playAgainNumberHunt() {
    setError("");

    getSocket().emit(
      "number-hunt-play-again",
      { code },
      (response: NumberHuntResponse) => {
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

  if (roomState?.gameId === "number-hunt") {
    const disconnectedPlayer =
      numberHunt?.disconnectedPlayerIndex === 0 ||
      numberHunt?.disconnectedPlayerIndex === 1
        ? numberHunt.players[numberHunt.disconnectedPlayerIndex]
        : null;
    const finalMessage =
      numberHunt?.status === "finished"
        ? numberHunt.resultText ??
          (numberHunt.winnerIndex === null
            ? "Game drawn."
            : `${numberHunt.players[numberHunt.winnerIndex].nickname} wins.`)
        : null;
    const numberHuntFinalOutcome =
      numberHunt?.status === "finished"
        ? numberHunt.winnerIndex === null
          ? "tie"
          : numberHunt.players[numberHunt.winnerIndex].socketId === socketId
            ? "win"
            : "lose"
        : null;

    return (
      <main className="page app-page">
        <ResetButton nickname={nickname} onReset={resetMemory} />
        {numberHuntFinalOutcome && finalMessage ? (
          <div className="draw-overlay" role="status">
            <div className={`result-pop result-pop-${numberHuntFinalOutcome}`}>
              <p className="eyebrow">Game finished</p>
              <div className="result-icon">
                {numberHuntFinalOutcome === "win"
                  ? "🏆"
                  : numberHuntFinalOutcome === "lose"
                    ? "😮"
                    : "🤝"}
              </div>
              <h2 className="result-title">
                {numberHuntFinalOutcome === "win"
                  ? "You won!"
                  : numberHuntFinalOutcome === "lose"
                    ? "You lost"
                    : "Game drawn"}
              </h2>
              <p className="muted">{finalMessage}</p>
              <button
                className="button"
                onClick={playAgainNumberHunt}
                type="button"
              >
                Play Again
              </button>
            </div>
          </div>
        ) : null}
        <div className="play-shell number-hunt-shell">
          <aside className="paper-note play-meta-note">
            <div>
              <h1 className="title">Number Hunt</h1>
              <p className="muted">Room {code}</p>
            </div>

            {error ? <p className="error">{error}</p> : null}
            {!roomState || !numberHunt ? (
              <p className="muted">Loading game...</p>
            ) : null}

            {numberHunt ? (
              <>
                <div className="dots-scoreboard">
                  {numberHunt.players.map((player, index) => (
                    <div
                      className="dots-player"
                      key={player.socketId}
                    >
                      <span className="score-label">
                        {player.socketId === socketId ? "You" : "Opponent"}
                      </span>
                      <strong>
                        {player.nickname} ({getPlayerInitial(player.nickname)})
                        {!player.connected ? " (disconnected)" : ""}
                      </strong>
                      <span>{numberHunt.scores[index]} point(s)</span>
                    </div>
                  ))}
                </div>

                <div className="number-hunt-target">
                  <span className="score-label">Current target</span>
                  <strong>{numberHunt.currentTarget}</strong>
                </div>

                <p className="result">
                  {numberHunt.status === "paused" && disconnectedPlayer
                    ? `${disconnectedPlayer.nickname} disconnected. Waiting for them to reconnect.`
                    : numberHunt.status === "finished"
                      ? finalMessage
                      : numberHunt.lastLock
                        ? `${numberHunt.lastLock.nickname} locked ${numberHunt.lastLock.number}.`
                        : "Find the target first."}
                </p>
              </>
            ) : null}
          </aside>

          <section className="panel stack wide-panel play-panel number-hunt-panel">
            {numberHunt ? (
              <>
                <div className="number-grid" aria-label="Number Hunt board">
                  {numberHuntNumbers.slice(0, numberHunt.maxNumber).map((number) => {
                    const isPastNumber = number < numberHunt.currentTarget;
                    const isPending = pendingNumber === number;
                    const feedbackClass =
                      numberFeedback?.number === number
                        ? ` number-cell-${numberFeedback.type}`
                        : "";
                    const pendingClass = isPending
                      ? " number-cell-pending"
                      : "";

                    return (
                      <button
                        className={`${
                          isPastNumber
                            ? "number-cell number-cell-locked"
                            : "number-cell"
                        }${pendingClass}${feedbackClass}`}
                        disabled={
                          numberHunt.status !== "playing" ||
                          (Boolean(pendingNumber) && !isPending)
                        }
                        key={number}
                        onClick={() => submitNumberHuntPick(number)}
                        type="button"
                      >
                        <span>{number}</span>
                      </button>
                    );
                  })}
                </div>

              </>
            ) : (
              <p className="muted">Loading game...</p>
            )}
          </section>
        </div>
      </main>
    );
  }

  if (roomState?.gameId === "dots-and-boxes") {
    const boardSize = dotsAndBoxes?.boardSize ?? 8;
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
    const dotsFinalOutcome =
      dotsAndBoxes?.status === "finished"
        ? dotsAndBoxes.winnerIndex === null
          ? "tie"
          : dotsAndBoxes.players[dotsAndBoxes.winnerIndex].socketId === socketId
            ? "win"
            : "lose"
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
        {dotsFinalOutcome && finalMessage ? (
          <div className="draw-overlay" role="status">
            <div className={`result-pop result-pop-${dotsFinalOutcome}`}>
              <p className="eyebrow">Game finished</p>
              <div className="result-icon">
                {dotsFinalOutcome === "win"
                  ? "🏆"
                  : dotsFinalOutcome === "lose"
                    ? "😮"
                    : "🤝"}
              </div>
              <h2 className="result-title">
                {dotsFinalOutcome === "win"
                  ? "You won!"
                  : dotsFinalOutcome === "lose"
                    ? "You lost"
                    : "Game drawn"}
              </h2>
              <p className="muted">{finalMessage}</p>
              <button
                className="button"
                onClick={playAgainDotsAndBoxes}
                type="button"
              >
                Play Again
              </button>
            </div>
          </div>
        ) : null}
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
      {shouldShowFinalOutcome && handCricket ? (
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
            <button
              className="button"
              onClick={playAgainHandCricket}
              type="button"
            >
              Play Again
            </button>
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
                <strong>{displayedHandCricketMeta?.innings ?? handCricket.innings}</strong>
              </div>
              <div className="score-box">
                <span className="score-label">Score</span>
                <strong>
                  {displayedHandCricketMeta?.currentScore ??
                    handCricket.currentScore}
                </strong>
              </div>
              <div className="score-box">
                <span className="score-label">Target</span>
                <strong>
                  {displayedHandCricketMeta?.target === null ||
                  displayedHandCricketMeta?.target === undefined
                    ? "-"
                    : displayedHandCricketMeta.target}
                </strong>
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

            {handCricket.lastBall && (!showReveal || showRevealScore) ? (
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
            !shouldShowCricketStage ? (
              <p className="result">{handCricket.resultText}</p>
            ) : (
              <div className="cricket-stage">
                <div
                  className={
                    showReveal && handCricket.lastBall
                      ? showRevealChoices
                        ? "cricket-hands cricket-hands-reveal cricket-hands-open"
                        : "cricket-hands cricket-hands-reveal"
                      : "cricket-hands"
                  }
                >
                  <div className="cricket-player-hand cricket-player-hand-left">
                    <span className="cricket-hand-label">Batter</span>
                    <span className="cricket-hand">
                      <img
                        alt={
                          showRevealChoices && handCricket.lastBall
                            ? `Batter chose ${handCricket.lastBall.batterChoice}`
                            : "Batter closed hand"
                        }
                        className="cricket-hand-image cricket-hand-image-left"
                        draggable={false}
                        src={
                          showRevealChoices && batterRevealHandSrc
                            ? batterRevealHandSrc
                            : "/hand-cricket/hand-0-right.svg"
                        }
                      />
                    </span>
                    <strong>{batter?.nickname ?? "Player"}</strong>
                  </div>
                  <span className="cricket-vs">vs</span>
                  <div className="cricket-player-hand cricket-player-hand-right">
                    <span className="cricket-hand-label">Bowler</span>
                    <span className="cricket-hand">
                      <img
                        alt={
                          showRevealChoices && handCricket.lastBall
                            ? `Bowler chose ${handCricket.lastBall.bowlerChoice}`
                            : "Bowler closed hand"
                        }
                        className="cricket-hand-image"
                        draggable={false}
                        src={
                          showRevealChoices && bowlerRevealHandSrc
                            ? bowlerRevealHandSrc
                            : "/hand-cricket/hand-0-right.svg"
                        }
                      />
                    </span>
                    <strong>{bowler?.nickname ?? "Player"}</strong>
                  </div>
                </div>

                {roleAnnouncement ? (
                  <div
                    className="cricket-popup cricket-start-popup"
                    role="status"
                  >
                    <p className="eyebrow">{roleAnnouncementInningsText}</p>
                    <p className="draw-result">{roleAnnouncementText}</p>
                  </div>
                ) : null}

                {hasSubmitted || pendingChoice ? (
                  <div className="cricket-popup cricket-wait-popup" role="status">
                    <p className="eyebrow">Choice locked</p>
                    <p className="draw-result">Waiting for opponent to draw...</p>
                  </div>
                ) : null}

                {showDrawWheel ? (
                  <div className="cricket-popup cricket-draw-popup" role="dialog">
                    <p className="eyebrow">Pick a number</p>
                    <div className="hand-wheel hand-wheel-active">
                      <div className="wheel-center" aria-hidden="true">
                        <span>{role === "batting" ? "BAT" : "BOWL"}</span>
                      </div>
                      {handChoices.map((choice) => (
                        <button
                          className="hand-button"
                          key={choice.value}
                          onClick={() => submitChoice(choice.value)}
                        >
                          <span className="hand-number">{choice.value}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {showReveal && handCricket.lastBall ? (
                  <div className="cricket-popup cricket-result-popup" role="status">
                    <p className="eyebrow">Draw result</p>
                    <p className="draw-result">
                      {handCricket.lastBall.isOut
                        ? "Out!"
                        : `${handCricket.lastBall.runs} run(s)`}
                    </p>
                  </div>
                ) : null}
              </div>
            )
          ) : (
            <p className="muted">Loading game...</p>
          )}
        </section>
      </div>
    </main>
  );
}
