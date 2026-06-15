"use client";

import { io, type Socket } from "socket.io-client";
import { backendUrl } from "./config";

let socket: Socket | null = null;

export function getSocket() {
  if (!socket) {
    socket = io(backendUrl, {
      autoConnect: false
    });
  }

  return socket;
}

export function ensureSocketConnected() {
  const activeSocket = getSocket();

  if (activeSocket.connected && activeSocket.id) {
    return Promise.resolve(activeSocket);
  }

  return new Promise<Socket>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      activeSocket.off("connect", handleConnect);
      activeSocket.off("connect_error", handleError);
      reject(new Error("Could not connect to the backend."));
    }, 5000);

    function handleConnect() {
      window.clearTimeout(timeout);
      activeSocket.off("connect_error", handleError);
      resolve(activeSocket);
    }

    function handleError(error: Error) {
      window.clearTimeout(timeout);
      activeSocket.off("connect", handleConnect);
      reject(error);
    }

    activeSocket.once("connect", handleConnect);
    activeSocket.once("connect_error", handleError);
    activeSocket.connect();
  });
}
