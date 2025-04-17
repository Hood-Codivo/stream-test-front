// src/components/StreamerStudio.tsx
import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

const getSocketUrl = () => {
  if (typeof window !== "undefined") {
    return import.meta.env.VITE_SOCKET_SERVER_URL || window.location.origin;
  }
  return "http://localhost:3000"; // fallback during SSR or build
};

const ICE_SERVERS: RTCIceServer[] = (() => {
  try {
    return JSON.parse(import.meta.env.VITE_ICE_SERVERS || "[]");
  } catch {
    return [{ urls: "stun:stun.l.google.com:19302" }];
  }
})();

const StreamerStudio = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket>();
  const peerConnections = useRef<Record<string, RTCPeerConnection>>({});
  let localStream: MediaStream;

  useEffect(() => {
    const socket = io(getSocketUrl(), {
      transports: ["websocket"],
      secure: true,
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    const startStreaming = async () => {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = localStream;
        }

        socket.emit("broadcaster");

        socket.on("watcher", handleWatcher);
        socket.on("candidate", handleCandidate);
        socket.on("disconnectPeer", handleDisconnectPeer);
      } catch (err) {
        console.error("⚠️  Media error:", err);
      }
    };

    const handleWatcher = async (id: string) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peerConnections.current[id] = pc;

      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit("candidate", id, e.candidate);
        }
      };

      socket.on("answer", (answerId, description) => {
        if (answerId === id) {
          pc.setRemoteDescription(description).catch((e) =>
            console.error(`setRemoteDescription for ${id} failed:`, e)
          );
        }
      });

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("offer", id, pc.localDescription);
      } catch (e) {
        console.error("⚠️  Offer failed:", e);
      }
    };

    const handleCandidate = (id: string, candidate: RTCIceCandidateInit) => {
      const pc = peerConnections.current[id];
      if (pc) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((e) =>
          console.error("addIceCandidate error:", e)
        );
      }
    };

    const handleDisconnectPeer = (id: string) => {
      const pc = peerConnections.current[id];
      if (pc) {
        pc.close();
        delete peerConnections.current[id];
      }
    };

    startStreaming();

    return () => {
      Object.values(peerConnections.current).forEach((pc) => pc.close());
      socket.off("watcher", handleWatcher);
      socket.off("candidate", handleCandidate);
      socket.off("disconnectPeer", handleDisconnectPeer);
      socket.disconnect();
      localStream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold mb-4">Streamer Studio</h1>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        width={640}
        height={480}
        className="rounded shadow-lg"
      />
    </div>
  );
};

export default StreamerStudio;
