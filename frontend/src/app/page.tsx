"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NicknameScreen } from "./components/NicknameScreen";
import { clearBackbenchStorage, ResetButton } from "./components/ResetButton";
import { backendUrl } from "../lib/config";
import { ensureSocketConnected } from "../lib/socket";

type RoomResponse = {
  code: string;
};

export default function HomePage() {
  const router = useRouter();
  const [nickname, setNickname] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setNickname(localStorage.getItem("backbench:nickname"));
    setIsReady(true);
  }, []);

  async function createRoom() {
    if (!nickname) {
      return;
    }

    setIsCreating(true);
    setError("");

    try {
      const socket = await ensureSocketConnected();
      const response = await fetch(`${backendUrl}/rooms`, {
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
      setIsCreating(false);
    }
  }

  function resetMemory() {
    clearBackbenchStorage();
    setNickname(null);
    setIsCreating(false);
    setError("");
    router.push("/");
  }

  if (!isReady) {
    return null;
  }

  if (!nickname) {
    return <NicknameScreen onSave={setNickname} />;
  }

  return (
    <main className="page">
      <ResetButton onReset={resetMemory} />
      <section className="panel stack">
        <button className="button" disabled={isCreating} onClick={createRoom}>
          {isCreating ? "Creating..." : "Create Room"}
        </button>
        {error ? <p className="error">{error}</p> : null}
      </section>
    </main>
  );
}
