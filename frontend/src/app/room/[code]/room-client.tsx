"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NicknameScreen } from "../../components/NicknameScreen";
import {
  clearBackbenchStorage,
  ResetButton
} from "../../components/ResetButton";
import { ensureSocketConnected, getSocket } from "../../../lib/socket";

type Member = {
  socketId: string;
  nickname: string;
};

type RoomState = {
  code: string;
  members: Member[];
};

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
      socket.emit("leave-room", { code });
    };
  }, [code, nickname]);

  function resetMemory() {
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
      <main className="page">
        <ResetButton onReset={resetMemory} />
        <section className="panel stack">
          <h1 className="title">Room not found</h1>
          <p className="muted">No room exists for {code}.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <ResetButton onReset={resetMemory} />
      <section className="panel stack">
        <h1 className="title">Room {code}</h1>
        {error ? <p className="error">{error}</p> : null}
        {!roomState ? <p className="muted">Joining...</p> : null}
        {roomState ? (
          <ul className="members">
            {roomState.members.map((member) => (
              <li className="member" key={member.socketId}>
                {member.nickname}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
}
