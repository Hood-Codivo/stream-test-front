// src/pages/ViewerPage.tsx
import React, { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import {
  FiHeart,
  FiShare2,
  FiMessageSquare,
  FiMaximize,
  FiX,
} from "react-icons/fi";
import { useParams } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";

// create and configure socket
function createSocket(url: string): Socket {
  const socket = io(url, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
  socket.on("connect_error", (err) =>
    console.error("Socket connect_error:", err)
  );
  socket.on("error", (err) => console.error("Socket error:", err));
  socket.on("disconnect", (reason) =>
    console.warn("Socket disconnected:", reason)
  );
  socket.on("reconnect_attempt", (attempt) =>
    console.log("Socket reconnect_attempt:", attempt)
  );
  return socket;
}

// server URL
const getSocketUrl = () =>
  typeof window !== "undefined"
    ? import.meta.env.VITE_SOCKET_SERVER_URL || window.location.origin
    : "https://stream-test-backend.onrender.com";

// ICE servers for WebRTC
const ICE_SERVERS: RTCIceServer[] = (() => {
  try {
    return JSON.parse(import.meta.env.VITE_ICE_SERVERS || "[]");
  } catch {
    return [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
    ];
  }
})();

const ViewerPage: React.FC = () => {
  const { streamId } = useParams<{ streamId: string }>();
  const [hasStreamAccess, setHasStreamAccess] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState("Connecting…");
  const [likes, setLikes] = useState(0);
  const [viewerCount, setViewerCount] = useState(0);
  const [donations, setDonations] = useState<
    { user: string; amount: number }[]
  >([]);
  const [chat, setChat] = useState<
    { user: string; message: string }[]
  >([]);
  const [msg, setMsg] = useState("");
  const [chatVisible, setChatVisible] = useState(true);
  const [theater, setTheater] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  // (re)join stream
  const rejoin = () => {
    setIsJoining(true);
    socketRef.current?.emit(
      "joinStream",
      streamId,
      (res: { success: boolean }) => {
        setHasStreamAccess(res.success);
        setIsJoining(false);
        if (res.success) {
          socketRef.current?.emit("watcher");
        }
      }
    );
  };

  useEffect(() => {
    if (!streamId) return;

    const socket = createSocket(getSocketUrl());
    socketRef.current = socket;

    // handle connect & initial join
    const onConnect = () => {
      setConnectionStatus("Connected to signaling server");
      socket.emit(
        "joinStream",
        streamId,
        (res: { success: boolean }) => {
          setHasStreamAccess(res.success);
          if (res.success) {
            socket.emit("watcher");
          } else {
            console.error("Access denied on join");
          }
        }
      );
    };

    // when broadcaster appears, start watching
    const handleBroadcaster = () => {
      setConnectionStatus("Broadcaster found");
      socket.emit("watcher");
    };

    // handle incoming offer
    const handleOffer = async (
      id: string,
      desc: RTCSessionDescriptionInit
    ) => {
      setConnectionStatus("Negotiating media…");
      pcRef.current?.close();

      const pc = new RTCPeerConnection({
        iceServers: ICE_SERVERS,
      });
      pcRef.current = pc;

      // data channel (optional)
      const dc = pc.createDataChannel("metadata");
      dc.onmessage = (e) => console.log("Metadata:", e.data);

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) socket.emit("candidate", id, candidate);
      };

      pc.oniceconnectionstatechange = () => {
        setConnectionStatus(pc.iceConnectionState);
        if (pc.iceConnectionState === "failed") {
          pc.restartIce();
        }
      };

      pc.ontrack = (event) => {
        if (
          videoRef.current &&
          event.streams.length > 0
        ) {
          videoRef.current.srcObject = event.streams[0];
          videoRef.current
            .play()
            .then(() =>
              setConnectionStatus("Playing")
            )
            .catch((err) => {
              console.error("Autoplay failed:", err);
              setConnectionStatus("Click to play");
            });
        }
      };

      try {
        await pc.setRemoteDescription(desc);
        const answer = await pc.createAnswer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(answer);
        socket.emit("answer", id, pc.localDescription);
      } catch (err) {
        console.error("Offer handling failed:", err);
        setConnectionStatus("Connection failed");
      }
    };

    // handle ICE candidates from server
    const handleCandidate = (
      _id: string,
      c: RTCIceCandidateInit
    ) => {
      pcRef.current
        ?.addIceCandidate(new RTCIceCandidate(c))
        .catch((err) =>
          console.error("addIceCandidate error:", err)
        );
    };

    // viewer count & donations
    socket.on("viewerUpdate", (count: number) => {
      setViewerCount(count);
    });
    socket.on("donation", (d) =>
      setDonations((ds) => [...ds, d])
    );

    // attach
    socket.on("connect", onConnect);
    socket.on("broadcaster", handleBroadcaster);
    socket.on("offer", handleOffer);
    socket.on("candidate", handleCandidate);

    return () => {
      socket.off("connect", onConnect);
      socket.off("broadcaster", handleBroadcaster);
      socket.off("offer", handleOffer);
      socket.off("candidate", handleCandidate);
      socket.off("viewerUpdate");
      socket.off("donation");
      socket.disconnect();
      pcRef.current?.close();
      setConnectionStatus("Disconnected");
    };
  }, [streamId]);

  // rotate donations
  useEffect(() => {
    const t = setInterval(
      () => setDonations((d) => d.slice(1)),
      5000
    );
    return () => clearInterval(t);
  }, []);

  const shareUrl = `${window.location.origin}/viewers/${streamId}`;

  if (!hasStreamAccess) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <button
          onClick={rejoin}
          disabled={isJoining}
          className="px-6 py-3 bg-blue-600 rounded"
        >
          {isJoining ? "Joining…" : "Join Stream"}
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-gray-900 text-white">
      <div className={`flex ${theater ? "h-screen" : ""}`}>
        <div
          className={`${
            chatVisible ? "flex-1" : "w-full"
          } bg-black relative`}
        >
          {/* top bar */}
          <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/60 to-transparent flex justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span>LIVE • {viewerCount}</span>
            </div>
            <button
              onClick={() => setTheater((t) => !t)}
            >
              <FiMaximize />
            </button>
          </div>

          {/* video */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-contain bg-black"
            onClick={() =>
              videoRef.current?.play().catch(console.error)
            }
            onCanPlay={() => {
              videoRef.current
                ?.play()
                .catch(console.error);
            }}
            onError={(e) => {
              console.error("Video error:", e);
              setConnectionStatus("Video playback error");
            }}
          />

          {/* bottom controls */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent flex justify-between items-center">
            <button
              onClick={rejoin}
              disabled={isJoining}
              className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-300"
            >
              {isJoining ? "Rejoining…" : "Rejoin"}
            </button>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setLikes((l) => l + 1)}
                className="flex items-center space-x-1 px-3 py-1 rounded-full hover:bg-white/10"
              >
                <FiHeart /> {likes}
              </button>
              <button
                onClick={() => setShowQRCode(true)}
                className="p-2 hover:bg-white/10 rounded-full"
              >
                <FiShare2 />
              </button>
            </div>
            <span className="text-sm">
              {connectionStatus}
            </span>
          </div>
        </div>

        {/* chat pane */}
        {chatVisible && (
          <div className="w-96 bg-gray-800/90 backdrop-blur-lg flex flex-col">
            <div className="p-4 flex justify-between items-center border-b border-gray-700">
              <h2>Chat</h2>
              <button
                onClick={() => setChatVisible(false)}
              >
                <FiX />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chat.map((m, i) => (
                <div
                  key={i}
                  className="flex items-start space-x-2"
                >
                  <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                    {m.user[0]}
                  </div>
                  <div>
                    <strong className="text-purple-400">
                      {m.user}
                    </strong>
                    <p className="text-gray-200">
                      {m.message}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-gray-700 flex space-x-2">
              <input
                value={msg}
                onChange={(e) =>
                  setMsg(e.target.value)
                }
                placeholder="Type…"
                className="flex-1 bg-gray-900 rounded px-3 py-2"
              />
              <button
                onClick={() => {
                  if (!msg.trim()) return;
                  setChat((c) => [
                    ...c,
                    { user: "Guest", message: msg },
                  ]);
                  setMsg("");
                }}
                className="bg-purple-600 px-3 py-2 rounded"
              >
                <FiMessageSquare />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* donation alerts */}
      <div className="fixed bottom-4 right-4 space-y-2">
        {donations.map((d, i) => (
          <div
            key={i}
            className="bg-gradient-to-r from-purple-500 to-blue-500 p-3 rounded flex items-center space-x-2"
          >
            <FiHeart />
            <div>
              <div>🎉 ${d.amount}</div>
              <small>from @{d.user}</small>
            </div>
          </div>
        ))}
      </div>

      {/* QR modal */}
      {showQRCode && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg text-center">
            <h3 className="mb-4">Scan to Join</h3>
            <QRCodeCanvas value={shareUrl} />
            <p className="mt-4 break-all">
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                {shareUrl}
              </a>
            </p>
            <button
              onClick={() => setShowQRCode(false)}
              className="mt-4 bg-red-500 text-white px-4 py-2 rounded"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ViewerPage;
