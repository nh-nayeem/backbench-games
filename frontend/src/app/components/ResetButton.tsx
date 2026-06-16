"use client";

type ResetButtonProps = {
  nickname?: string | null;
  onReset: () => void;
};

export function clearBackbenchStorage() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("backbench:")) {
      localStorage.removeItem(key);
    }
  }
}

export function ResetButton({ nickname, onReset }: ResetButtonProps) {
  return (
    <div className="user-controls">
      {nickname ? <span className="top-nickname">{nickname}</span> : null}
      <button className="reset-button" onClick={onReset} type="button">
        Reset
      </button>
    </div>
  );
}
