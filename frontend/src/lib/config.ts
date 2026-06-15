const isDev = process.env.NEXT_PUBLIC_DEV === "true";

export const backendUrl = isDev
  ? "http://localhost:4000"
  : (process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000");
