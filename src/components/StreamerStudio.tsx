// src/components/StreamerStudio.tsx
import { useEffect, useRef } from "react";
import io, { Socket } from "socket.io-client";

const StreamerStudio = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});

  useEffect(() => {
    socketRef.current = io(window.location.origin);

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((mediaStream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }

        // Tell the server we’re a broadcaster
        socketRef.current!.emit("broadcaster");

        socketRef.current!.on("watcher", async (id: string) => {
          const pc = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
          });
          peerConnectionsRef.current[id] = pc;

          // Add our local tracks
          mediaStream.getTracks().forEach((track) => {
            pc.addTrack(track, mediaStream);
          });

          // Relay ICE candidates
          pc.onicecandidate = (evt) => {
            if (evt.candidate) {
              socketRef.current!.emit("candidate", id, evt.candidate);
            }
          };

          // 1) **Register answer handler before creating offer**
          socketRef.current!.on("answer", (answerId, description) => {
            if (answerId !== id) return;
            console.log(`Applying remote answer for ${id}`);
            pc.setRemoteDescription(
              new RTCSessionDescription(description)
            ).catch((err) =>
              console.error("setRemoteDescription failed:", err)
            );
          });

          // 2) Create & send our offer
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            console.log(`Emitting offer to ${id}`);
            socketRef.current!.emit("offer", id, pc.localDescription);
          } catch (e) {
            console.error("Offer creation failed:", e);
          }
        });

        // Handle incoming ICE candidates from viewers
        socketRef.current!.on(
          "candidate",
          (id: string, candidate: RTCIceCandidateInit) => {
            const pc = peerConnectionsRef.current[id];
            if (pc) {
              pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((e) =>
                console.error("addIceCandidate error:", e)
              );
            }
          }
        );

        // Clean up when a viewer disconnects
        socketRef.current!.on("disconnectPeer", (id: string) => {
          peerConnectionsRef.current[id]?.close();
          delete peerConnectionsRef.current[id];
        });
      })
      .catch((e) => console.error("Media error:", e));

    return () => {
      Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
      socketRef.current?.disconnect();
    };
  }, []);

  return (
    <div>
      <h1>Streamer Studio</h1>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ width: "640px", height: "480px" }}
      />
    </div>
  );
};

export default StreamerStudio;
