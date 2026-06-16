"use client";

type ResetButtonProps = {
  onReset: () => void;
};

export function clearBackbenchStorage() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("backbench:")) {
      localStorage.removeItem(key);
    }
  }
}

export function ResetButton({ onReset }: ResetButtonProps) {
  return (
    <button className="reset-button" onClick={onReset} type="button">
      Reset
    </button>
  );
}
