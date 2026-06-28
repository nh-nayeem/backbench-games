"use client";

import Link from "next/link";

export function HomeButton() {
  return (
    <Link aria-label="Go home" className="home-button" href="/" title="Home">
      <svg
        aria-hidden="true"
        className="home-button-icon"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5.5 10.5V20h5v-5.5h3V20h5v-9.5" />
      </svg>
    </Link>
  );
}
