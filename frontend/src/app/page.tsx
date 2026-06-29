"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NicknameScreen } from "./components/NicknameScreen";
import { clearBackbenchStorage, ResetButton } from "./components/ResetButton";
import { backendUrl } from "../lib/config";
import { ensureSocketConnected, getSocket } from "../lib/socket";
import type { GameDefinition, GameId, RoomState } from "../lib/types";

type RoomResponse = {
  code: string;
};

type MatchmakingResponse =
  | {
      ok: true;
      room: RoomState;
    }
  | {
      ok: false;
      reason: string;
    };

const fallbackGames: GameDefinition[] = [
  {
    id: "hand-cricket",
    name: "Hand Cricket",
    minPlayers: 2,
    maxPlayers: 2
  },
  {
    id: "dots-and-boxes",
    name: "Dots and Boxes",
    minPlayers: 2,
    maxPlayers: 2
  },
  {
    id: "number-hunt",
    name: "Number Hunt",
    minPlayers: 2,
    maxPlayers: 2
  }
];

export default function HomePage() {
  const router = useRouter();
  const [nickname, setNickname] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [games, setGames] = useState<GameDefinition[]>(fallbackGames);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setNickname(localStorage.getItem("backbench:nickname"));
    setIsReady(true);
  }, []);

  useEffect(() => {
    async function loadGames() {
      try {
        const response = await fetch(`${backendUrl}/games`);

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { games: GameDefinition[] };
        setGames(data.games);
      } catch {
        setGames(fallbackGames);
      }
    }

    loadGames();
  }, []);

  async function createRoom(gameId: GameId) {
    if (!nickname) {
      return;
    }

    setPendingAction(`${gameId}:create`);
    setError("");

    try {
      const socket = await ensureSocketConnected();
      const response = await fetch(`${backendUrl}/games/${gameId}/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          nickname,
          socketId: socket.id
        })
      });

      if (!response.ok) {
        throw new Error("Could not create room.");
      }

      const room = (await response.json()) as RoomResponse;
      router.push(`/room/${room.code}`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not create room."
      );
      setPendingAction(null);
    }
  }

  async function playOnline(gameId: GameId) {
    if (!nickname) {
      return;
    }

    setPendingAction(`${gameId}:online`);
    setError("");

    try {
      const socket = await ensureSocketConnected();

      socket.once("match-ready", (payload: { code: string }) => {
        router.push(`/play/${payload.code}`);
      });

      socket.emit(
        "join-matchmaking",
        { gameId, nickname },
        (response: MatchmakingResponse) => {
          if (!response.ok) {
            setError("Could not join matchmaking.");
            setPendingAction(null);
            return;
          }

          if (response.room.status === "in-game") {
            router.push(`/play/${response.room.code}`);
          }
        }
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not join matchmaking."
      );
      setPendingAction(null);
    }
  }

  async function playComputer(gameId: GameId) {
    if (!nickname) {
      return;
    }

    setPendingAction(`${gameId}:computer`);
    setError("");

    try {
      const socket = await ensureSocketConnected();
      const response = await fetch(`${backendUrl}/games/${gameId}/computer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          nickname,
          socketId: socket.id
        })
      });

      if (!response.ok) {
        throw new Error("Could not start computer match.");
      }

      const room = (await response.json()) as RoomResponse;
      router.push(`/play/${room.code}`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not start computer match."
      );
      setPendingAction(null);
    }
  }

  function resetMemory() {
    clearBackbenchStorage();
    setNickname(null);
    setPendingAction(null);
    setError("");
    getSocket().disconnect();
    router.push("/");
  }

  if (!isReady) {
    return null;
  }

  if (!nickname) {
    return <NicknameScreen onSave={setNickname} />;
  }

  return (
    <main className="page app-page">
      <ResetButton nickname={nickname} onReset={resetMemory} />
      <section className="panel stack wide-panel lobby-panel">
        <header className="lobby-header">
          <p className="eyebrow">Backbench Games</p>
          <h1 className="hero-title">Backbench Games</h1>
          <p className="muted">Pick a desk, start a match.</p>
        </header>
        <div className="game-grid">
          {games.map((game) => {
            const isCreating = pendingAction === `${game.id}:create`;
            const isMatchmaking = pendingAction === `${game.id}:online`;
            const isComputer = pendingAction === `${game.id}:computer`;

            return (
              <article className="game-card" key={game.id}>
                <div className="stack">
                  <div className="game-card-header">
                    <span className="game-mark">
                      {game.id === "hand-cricket"
                        ? "🏏"
                        : game.id === "dots-and-boxes"
                          ? "▦"
                          : "64"}
                    </span>
                    <h2 className="card-title">{game.name}</h2>
                    <p className="muted">
                      {game.minPlayers}-{game.maxPlayers} players
                    </p>
                  </div>
                  <div className="button-row">
                    <button
                      className="button"
                      disabled={Boolean(pendingAction)}
                      onClick={() => createRoom(game.id)}
                    >
                      {isCreating ? "Creating..." : "Create Room"}
                    </button>
                    <button
                      className="secondary-button"
                      disabled={Boolean(pendingAction)}
                      onClick={() => playOnline(game.id)}
                    >
                      {isMatchmaking ? "Waiting..." : "Play Online"}
                    </button>
                    <button
                      className="secondary-button play-computer-button"
                      disabled={Boolean(pendingAction)}
                      onClick={() => playComputer(game.id)}
                    >
                      {isComputer ? "Opening..." : "Play Computer"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        {error ? <p className="error">{error}</p> : null}
      </section>
    </main>
  );
}
