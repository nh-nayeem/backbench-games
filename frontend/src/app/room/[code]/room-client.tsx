"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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

type RoomClientProps = {
  code: string;
};

export function RoomClient({ code }: RoomClientProps) {
  const router = useRouter();
  const isNavigatingToPlay = useRef(false);
  const [nickname, setNickname] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [status, setStatus] = useState<"joining" | "joined" | "not-found">(
    "joining"
  );
  const [error, setError] = useState("");

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

        if (nextRoomState.status === "in-game") {
          isNavigatingToPlay.current = true;
          router.push(`/play/${nextRoomState.code}`);
        }
      }
    }

    socket.on("room-state", handleRoomState);

    async function joinCurrentRoom() {
      try {
        const connectedSocket = await ensureSocketConnected();

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

            if (response.room.status === "in-game") {
              isNavigatingToPlay.current = true;
              router.push(`/play/${response.room.code}`);
            }
          }
        );
      } catch (caughtError) {
        if (!didCancel) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Could not join room."
          );
        }
      }
    }

    joinCurrentRoom();

    return () => {
      didCancel = true;
      socket.off("room-state", handleRoomState);

      if (!isNavigatingToPlay.current) {
        socket.emit("leave-room", { code });
      }
    };
  }, [code, nickname]);

  function resetMemory() {
    isNavigatingToPlay.current = false;
    clearBackbenchStorage();
    setNickname(null);
    setRoomState(null);
    setStatus("joining");
    setError("");
    router.push("/");
  }

  if (!isReady) {
    return null;
  }

  if (!nickname) {
    return <NicknameScreen onSave={setNickname} />;
  }

  if (status === "not-found") {
    return (
      <main className="page app-page">
        <ResetButton nickname={nickname} onReset={resetMemory} />
        <section className="panel stack">
          <h1 className="title">Room not found</h1>
          <p className="muted">No room exists for {code}.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page app-page">
      <ResetButton nickname={nickname} onReset={resetMemory} />
      <section className="room-board">
        <header className="desk-title">
          <h1>Backbench Games</h1>
          <p>Just share and play!</p>
        </header>

        <aside className="paper-note room-info-note">
          <h2>Room Info</h2>
          <ul>
            <li>No inactive room</li>
            <li>No passwords</li>
            <li>Just share and play</li>
          </ul>
        </aside>

        <section className="paper-note room-code-note stack">
          <p className="note-heading">Room Code</p>
          <div className="room-code-box">{code}</div>
          {roomState ? <p className="muted">{roomState.gameName}</p> : null}
          <p className="muted">Share this link with your friends</p>
        </section>

        {error ? <p className="error">{error}</p> : null}
        {!roomState ? <p className="paper-note muted">Joining...</p> : null}
        {roomState ? (
          <section className="paper-note members-note stack">
            <div className="members-heading">
              <h2>Members ({roomState.members.length})</h2>
              <span>
                {roomState.members.length}/{roomState.capacity}
              </span>
            </div>
            <ul className="members">
              {roomState.members.map((member) => (
                <li className="member" key={member.socketId}>
                  <span>{member.nickname}</span>
                  <strong>Online</strong>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </section>
    </main>
  );
}
