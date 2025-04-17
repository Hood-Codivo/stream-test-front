// src/components/ViewerPage.tsx
import React, { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

const ViewerPage: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    const socket = io(window.location.origin, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("broadcaster", () => {
      socket.emit("watcher");
    });

    socket.on("offer", (id: string, description: RTCSessionDescriptionInit) => {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      peerConnectionRef.current = pc;

      pc.ontrack = (event) => {
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("candidate", id, event.candidate);
        }
      };

      pc.setRemoteDescription(new RTCSessionDescription(description))
        .then(() => pc.createAnswer())
        .then((answer) => pc.setLocalDescription(answer))
        .then(() => {
          socket.emit("answer", id, pc.localDescription);
        })
        .catch((e) => console.error("Offer handling error:", e));
    });

    socket.on("candidate", (_id: string, candidate: RTCIceCandidateInit) => {
      const pc = peerConnectionRef.current;
      if (pc) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((e) =>
          console.error("addIceCandidate error:", e)
        );
      }
    });

    return () => {
      socket.disconnect();
      peerConnectionRef.current?.close();
    };
  }, []);

  return (
    <div>
      <h1>Viewer</h1>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={false}
        style={{ width: "640px", height: "480px", background: "black" }}
      />
    </div>
  );
};

export default ViewerPage;
