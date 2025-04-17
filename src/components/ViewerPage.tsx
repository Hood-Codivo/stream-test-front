import React, { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

const getSocketUrl = () => {
  if (typeof window !== "undefined") {
    return import.meta.env.VITE_SOCKET_SERVER_URL || window.location.origin;
  }
  return "http://localhost:3000";
};

const ICE_SERVERS: RTCIceServer[] = (() => {
  try {
    return JSON.parse(import.meta.env.VITE_ICE_SERVERS || "[]");
  } catch {
    return [{ urls: "stun:stun.l.google.com:19302" }];
  }
})();

const ViewerPage: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    const socket = io(getSocketUrl(), {
      transports: ["websocket"],
      secure: true,
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.on("broadcaster", () => {
      socket.emit("watcher");
    });

    socket.on(
      "offer",
      async (id: string, description: RTCSessionDescriptionInit) => {
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peerConnectionRef.current = pc;

        pc.ontrack = (evt) => {
          if (videoRef.current && evt.streams[0]) {
            videoRef.current.srcObject = evt.streams[0];
          }
        };

        pc.onicecandidate = (evt) => {
          if (evt.candidate && socketRef.current) {
            socketRef.current.emit("candidate", id, evt.candidate);
          }
        };

        try {
          await pc.setRemoteDescription(description);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("answer", id, pc.localDescription);
        } catch (e) {
          console.error("Offer handling failed:", e);
        }
      }
    );

    socket.on(
      "candidate",
      (_id: string, candidate: RTCIceCandidateInit) => {
        peerConnectionRef.current
          ?.addIceCandidate(new RTCIceCandidate(candidate))
          .catch((e) => console.error("addIceCandidate error:", e));
      }
    );

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