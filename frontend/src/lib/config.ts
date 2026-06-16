const isDev = process.env.NEXT_PUBLIC_DEV === "true";
const configuredBackendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

function normalizeBackendUrl(url: string) {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  return `https://${url}`;
}

export const backendUrl = isDev
  ? "http://localhost:4000"
  : normalizeBackendUrl(configuredBackendUrl);
