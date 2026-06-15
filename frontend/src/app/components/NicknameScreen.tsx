"use client";

import { FormEvent, useState } from "react";

type NicknameScreenProps = {
  onSave: (nickname: string) => void;
};

export function NicknameScreen({ onSave }: NicknameScreenProps) {
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedNickname = nickname.trim();

    if (!trimmedNickname) {
      setError("Enter a nickname.");
      return;
    }

    localStorage.setItem("backbench:nickname", trimmedNickname);
    onSave(trimmedNickname);
  }

  return (
    <main className="page">
      <form className="panel stack" onSubmit={handleSubmit}>
        <h1 className="title">Backbench Games</h1>
        <label className="label">
          Nickname
          <input
            className="input"
            maxLength={32}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="Nayeem"
            value={nickname}
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button className="button" type="submit">
          Continue
        </button>
      </form>
    </main>
  );
}
