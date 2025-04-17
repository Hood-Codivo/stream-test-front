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
    return [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" }
    ];
  }
})();

const ViewerPage: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [connectionStatus, setConnectionStatus] = React.useState("Connecting...");

  useEffect(() => {
    const socket = createSocket(getSocketUrl());
    socketRef.current = socket;

    const handleOffer = async (id: string, description: RTCSessionDescriptionInit) => {
      try {
        console.log("[Signal] offer received from", id, description);
        setConnectionStatus("Negotiating connection...");

        // Clean up previous connection if exists
        if (pcRef.current) {
          pcRef.current.close();
        }

        const pc = new RTCPeerConnection({
          iceServers: ICE_SERVERS,
          iceTransportPolicy: "all",
          bundlePolicy: "max-bundle",
          rtcpMuxPolicy: "require"
        });
        pcRef.current = pc;

        // ICE Candidate handling
        pc.onicecandidate = ({ candidate }) => {
          if (candidate) {
            console.log("[PC] Sending ICE candidate:", candidate);
            socket.emit("candidate", id, candidate);
          }
        };

        // Track handling
        pc.ontrack = (event) => {
          console.log("[PC] Received media track:", event.track.kind);
          if (videoRef.current && event.streams[0]) {
            const videoElement = videoRef.current;
            videoElement.srcObject = event.streams[0];
            videoElement.play().catch(err => {
              console.error("Autoplay failed:", err);
              setConnectionStatus("Click to start playback");
            });
          }
        };

        // ICE Connection monitoring
        pc.oniceconnectionstatechange = () => {
          console.log("[PC] ICE state:", pc.iceConnectionState);
          setConnectionStatus(pc.iceConnectionState);
          if (pc.iceConnectionState === "failed") {
            pc.restartIce();
          }
        };

        // Set remote description and create answer
        await pc.setRemoteDescription(description);
        console.log("[PC] Remote description set");

        const answer = await pc.createAnswer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
        
        await pc.setLocalDescription(answer);
        console.log("[PC] Local description set");
        
        socket.emit("answer", id, pc.localDescription);
        setConnectionStatus("Connected - negotiating media");

      } catch (err) {
        console.error("[PC] Offer handling failed:", err);
        setConnectionStatus("Connection failed");
      }
    };

    const handleCandidate = (_id: string, candidate: RTCIceCandidateInit) => {
      console.log("[Signal] Received ICE candidate:", candidate);
      pcRef.current?.addIceCandidate(new RTCIceCandidate(candidate))
        .catch(err => console.error("[PC] addIceCandidate error:", err));
    };

    // Setup listeners
    socket.on("broadcaster", () => {
      console.log("[Signal] Broadcaster detected");
      socket.emit("watcher");
      setConnectionStatus("Broadcaster found");
    });

    socket.on("offer", handleOffer);
    socket.on("candidate", handleCandidate);

    return () => {
      console.log("[Cleanup] Disconnecting...");
      socket.off("broadcaster");
      socket.off("offer", handleOffer);
      socket.off("candidate", handleCandidate);
      socket.disconnect();
      pcRef.current?.close();
      setConnectionStatus("Disconnected");
    };
  }, []);

  return (
    <div className="p-4" onClick={() => videoRef.current?.play().catch(console.error)}>
      <h1 className="text-2xl font-semibold mb-4">Viewer</h1>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={false}
        width={640}
        height={480}
        className="bg-black rounded shadow"
        onCanPlay={() => {
          console.log("Video ready to play");
          videoRef.current?.play().catch(console.error);
        }}
        onError={(e) => {
          console.error("Video error:", e.nativeEvent);
          setConnectionStatus("Video playback error");
        }}
      />
      <div className="mt-4 text-center text-gray-400">
        {connectionStatus}
      </div>
    </div>
  );
};

export default ViewerPage;