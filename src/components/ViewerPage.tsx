import React, { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import {
  FiHeart,
  FiShare2,
  FiMessageSquare,
  FiMaximize,

  FiX,
} from "react-icons/fi";
import { restartRenderService } from "../utils/renderApi";
import { useParams } from "react-router-dom";

import { QRCodeCanvas } from "qrcode.react";

// --- Helpers -------------------------

function createSocket(url: string): Socket {
  const socket = io(url, {
    transports: ["websocket"],
    secure: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
  socket.on("connect", () => console.log("[Socket] connected", socket.id));
  socket.on("disconnect", (r) => console.warn("[Socket] disconnected", r));
  return socket;
}

const getSocketUrl = () =>
  typeof window !== "undefined"
    ? import.meta.env.VITE_SOCKET_SERVER_URL || window.location.origin
    : "https://stream-test-backend.onrender.com";

const ICE_SERVERS: RTCIceServer[] = (() => {
  try {
    return JSON.parse(import.meta.env.VITE_ICE_SERVERS || "[]");
  } catch {
    return [{ urls: "stun:stun.l.google.com:19302" }];
  }
})();

// --- Component -----------------------

const ViewerPage: React.FC = () => {
  const { streamId } = useParams<{ streamId: string }>();
  const [accessGranted, setAccessGranted] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("Connecting...");
  const [likes, setLikes] = useState(0);
  const [viewerCount, setViewerCount] = useState(0);
  const [donations, setDonations] = useState<{ user: string; amount: number }[]>([]);
  const [chatMessages, setChatMessages] = useState<{ user: string; message: string }[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isChatVisible, setIsChatVisible] = useState(true);
  const [isTheaterMode, setIsTheaterMode] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  // ——— One socket + access check ———
  useEffect(() => {
    if (!streamId) return;
    const socket = createSocket(getSocketUrl());
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("joinStream", streamId, (res: { success: boolean }) => {
        setAccessGranted(res.success);
      });
    });

    socket.on("viewerUpdate", (c: number) => setViewerCount(c));
    socket.on("donation", (d) => setDonations((p) => [...p, d]));

    const handleOffer = async (id: string, desc: RTCSessionDescriptionInit) => {
      pcRef.current?.close();
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;
      pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit("candidate", id, e.candidate);
      };
      pc.ontrack = (e) => {
        if (videoRef.current) {
          videoRef.current.srcObject = e.streams[0];
          videoRef.current.play().catch(() => setConnectionStatus("Click to play"));
        }
      };
      pc.oniceconnectionstatechange = () => {
        setConnectionStatus(pc.iceConnectionState);
        if (pc.iceConnectionState === "failed") pc.restartIce();
      };
      try {
        await pc.setRemoteDescription(desc);
        const ans = await pc.createAnswer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await pc.setLocalDescription(ans);
        socket.emit("answer", id, pc.localDescription);
      } catch {
        setConnectionStatus("Connection failed");
      }
    };

    socket.on("broadcaster", () => {
      socket.emit("watcher");
    });
    socket.on("offer", handleOffer);
    socket.on("candidate", (_id, cand) =>
      pcRef.current?.addIceCandidate(new RTCIceCandidate(cand)).catch(console.error)
    );

    return () => {
      socket.disconnect();
      pcRef.current?.close();
      setAccessGranted(false);
    };
  }, [streamId]);

  // auto-remove donations
  useEffect(() => {
    const t = setInterval(() => setDonations((d) => d.slice(1)), 5000);
    return () => clearInterval(t);
  }, []);

  const toggleChat = () => setIsChatVisible((v) => !v);
  const shareUrl = `${window.location.origin}/view/${streamId}`;

  const handleRejoin = async () => {
    setIsJoining(true);
    try {
      await restartRenderService(import.meta.env.RENDER_VIEWER_SERVICE_ID);
      socketRef.current?.emit("joinStream", streamId, (res: { success: boolean }) => {
        setAccessGranted(res.success);
      });
    } finally {
      setIsJoining(false);
    }
  };

  if (!accessGranted) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl mb-4">Stream Access Required</h1>
          <button onClick={handleRejoin} className="px-4 py-2 bg-blue-600 text-white rounded">
            {isJoining ? "Rejoining…" : "Join Stream"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white relative">
      {/* Video + Controls */}
      <div className={`flex ${isTheaterMode ? "h-screen" : "min-h-screen"}`}>
        <div className={`relative ${isChatVisible ? "flex-1" : "w-full"} bg-black`}>
          <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/60 to-transparent flex justify-between">
            <div className="flex items-center space-x-4">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span>LIVE • {viewerCount} watching</span>
            </div>
            <button onClick={() => setIsTheaterMode((t) => !t)}>
              <FiMaximize />
            </button>
          </div>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-full object-contain"
            onClick={() => videoRef.current?.play().catch(console.error)}
          />
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <button onClick={handleRejoin} disabled={isJoining} className="px-4 py-2 bg-gray-700 rounded">
                {isJoining ? "Rejoining…" : "Rejoin"}
              </button>
              <button onClick={() => setLikes((l) => l + 1)} className="flex items-center space-x-2 px-4 py-2 rounded-full hover:bg-white/10">
                <FiHeart /> {likes}
              </button>
              <button onClick={() => setShowQRCode(true)} className="p-2 hover:bg-white/10 rounded-full">
                <FiShare2 />
              </button>
            </div>
            <span className="text-sm">{connectionStatus}</span>
          </div>
        </div>

        {/* Chat Sidebar */}
        {isChatVisible && (
          <div className="w-96 bg-gray-800/90 backdrop-blur-lg flex flex-col">
            <div className="p-4 flex justify-between items-center border-b border-gray-700">
              <h2>Live Chat</h2>
              <button onClick={toggleChat}>
                <FiX />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatMessages.map((m, i) => (
                <div key={i} className="flex items-start space-x-3">
                  <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                    {m.user[0]}
                  </div>
                  <div>
                    <div className="font-semibold text-purple-400">{m.user}</div>
                    <p className="text-gray-100">{m.message}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-gray-700 flex space-x-2">
              <input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message…"
                className="flex-1 bg-gray-900 rounded-lg px-4 py-2"
              />
              <button
                onClick={() => {
                  if (!newMessage.trim()) return;
                  setChatMessages((p) => [...p, { user: "Guest", message: newMessage }]);
                  setNewMessage("");
                }}
                className="bg-purple-500 p-2 rounded-lg"
              >
                <FiMessageSquare />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Donation Alerts */}
      <div className="fixed bottom-4 right-4 space-y-2">
        {donations.map((d, i) => (
          <div key={i} className="bg-gradient-to-r from-purple-500 to-blue-500 p-4 rounded-lg flex items-center space-x-3">
            <FiHeart />
            <div>
              <div>🎉 ${d.amount}</div>
              <div className="text-sm">from @{d.user}</div>
            </div>
          </div>
        ))}
      </div>

      {/* QR Code Modal */}
      {showQRCode && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg text-center">
            <h3 className="text-xl mb-4">Scan to Join</h3>
            <QRCodeCanvas value={shareUrl} />
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
