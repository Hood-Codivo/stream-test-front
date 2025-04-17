// src/components/ViewerPage.tsx
import React, { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_SERVER_URL || window.location.origin;

const ICE_SERVERS: RTCIceServer[] = (() => {
  try {
    return JSON.parse(import.meta.env.VITE_ICE_SERVERS || "[]");
  } catch {
    // Fallback to Google STUN if your env var is malformed or missing
    return [{ urls: "stun:stun.l.google.com:19302" }];
  }
})();

const ViewerPage: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket>();
  const peerConnectionRef = useRef<RTCPeerConnection>();

  useEffect(() => {
    // 1) Connect to your production socket URL, websocket‑only
    const socket = io(SOCKET_URL, {
      transports: ["websocket"],
      secure: true,
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    // 2) When broadcaster announces, tell them we’re watching
    socket.on("broadcaster", () => {
      socket.emit("watcher");
    });

    // 3) Handle the incoming offer from the broadcaster
    socket.on(
      "offer",
      async (id: string, description: RTCSessionDescriptionInit) => {
        // Create peer connection with your ICE servers list
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peerConnectionRef.current = pc;

        // When we get tracks, attach to our <video>
        pc.ontrack = (evt) => {
          if (videoRef.current && evt.streams[0]) {
            videoRef.current.srcObject = evt.streams[0];
          }
        };

        // Relay our ICE candidates back to the broadcaster
        pc.onicecandidate = (evt) => {
          if (evt.candidate) {
            socket.emit("candidate", id, evt.candidate);
          }
        };

        try {
          // Apply remote description, then create + send answer
          await pc.setRemoteDescription(description);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("answer", id, pc.localDescription);
        } catch (e) {
          console.error("❌ Offer handling failed:", e);
        }
      }
    );

    // 4) Add any ICE candidates we receive
    socket.on(
      "candidate",
      (_id: string, candidate: RTCIceCandidateInit) => {
        peerConnectionRef.current
          ?.addIceCandidate(new RTCIceCandidate(candidate))
          .catch((e) => console.error("addIceCandidate error:", e));
      }
    );

    // 5) Clean up on unmount
    return () => {
      socket.off("broadcaster");
      socket.off("offer");
      socket.off("candidate");
      socket.disconnect();
      peerConnectionRef.current?.close();
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
      />
    </div>
  );
};

export default ViewerPage;
