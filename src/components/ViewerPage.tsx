import React, { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

// Create a socket with automatic reconnection and logging
function createSocket(url: string): Socket {
  const socket = io(url, {
    transports: ["websocket"],
    secure: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on("connect", () => {
    console.log("[Socket] connected", socket.id);
  });
  socket.on("connect_error", (err) => console.error("[Socket] connect_error", err));
  socket.on("error", (err) => console.error("[Socket] error", err));
  socket.on("disconnect", (reason) => {
    console.warn("[Socket] disconnected", reason);
    if (reason === "io server disconnect") {
      console.log("[Socket] attempting manual reconnect");
      socket.connect();
    }
  });
  socket.on("reconnect", (attempt) => console.log(`[Socket] reconnected after ${attempt} attempts`));
  socket.on("reconnect_error", (err) => console.error("[Socket] reconnect_error", err));

  return socket;
}

// Determine the server URL
const getSocketUrl = () => {
  if (typeof window !== "undefined") {
    return import.meta.env.VITE_SOCKET_SERVER_URL || window.location.origin;
  }
  return "https://stream-test-backend.onrender.com";
};

// Fallback to public STUN
const ICE_SERVERS: RTCIceServer[] = (() => {
  try {
    return JSON.parse(import.meta.env.VITE_ICE_SERVERS || "[]");
  } catch {
    return [{ urls: "stun:stun.l.google.com:19302" }];
  }
})();

const ViewerPage: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null); // Fixed with null initialization
  const pcRef = useRef<RTCPeerConnection | null>(null); // Fixed with null initialization

  useEffect(() => {
    const socket = createSocket(getSocketUrl());
    socketRef.current = socket;

    // When a broadcaster is present, let them know we're a watcher
    socket.on("broadcaster", () => {
      console.log("[Signal] broadcaster detected, sending watcher");
      socket.emit("watcher");
    });

    // Handle incoming offer from broadcaster
    socket.on(
      "offer",
      async (id: string, description: RTCSessionDescriptionInit) => {
        console.log("[Signal] offer received from", id, description);
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pcRef.current = pc;

        // Send any ICE candidates back to broadcaster
        pc.onicecandidate = (evt) => {
          if (evt.candidate) {
            console.log("[PC] onicecandidate", evt.candidate);
            socket.emit("candidate", id, evt.candidate);
          }
        };

        // When remote track arrives, attach it to the video element
        pc.ontrack = (evt) => {
          console.log("[PC] ontrack", evt.streams);
          if (videoRef.current && evt.streams[0]) {
            videoRef.current.srcObject = evt.streams[0];
          }
        };

        // Log ICE connection state changes
        pc.oniceconnectionstatechange = () => {
          console.log("[PC] ICE state change", pc.iceConnectionState);
        };

        try {
          await pc.setRemoteDescription(description);
          console.log("[PC] remote description set");

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          console.log("[PC] local description set, sending answer");

          socket.emit("answer", id, pc.localDescription);
        } catch (err) {
          console.error("[PC] offer handling failed", err);
        }
      }
    );

    // Add incoming ICE candidates
    socket.on("candidate", (_id: string, candidate: RTCIceCandidateInit) => {
      console.log("[Signal] candidate received", candidate);
      pcRef.current
        ?.addIceCandidate(new RTCIceCandidate(candidate))
        .then(() => console.log("[PC] candidate added"))
        .catch((err) => console.error("[PC] addIceCandidate error", err));
    });

    return () => {
      console.log("[Cleanup] disconnecting socket and closing peer connection");
      socket.disconnect();
      pcRef.current?.close();
    };
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold mb-4">Viewer</h1>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={false}
        width={640}
        height={480}
        className="bg-black rounded shadow"
        onCanPlay={() => videoRef.current?.play().catch(console.error)}
      />
    </div>
  );
};

export default ViewerPage;