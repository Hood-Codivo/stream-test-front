// src/pages/StreamerStudio.tsx
import React, { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import {
  FiCameraOff,
  FiCamera,
  FiMic,
  FiMicOff,
  FiMessageSquare,
  FiDollarSign,
  FiSettings,
  FiUsers,
  FiClock,
} from "react-icons/fi";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { QRCodeCanvas } from "qrcode.react";
import { v4 as uuidv4 } from "uuid";
import { restartRenderService } from "../utils/renderApi";

// server URL
const getSocketUrl = () =>
  typeof window !== "undefined"
    ? import.meta.env.VITE_SOCKET_SERVER_URL || window.location.origin
    : "https://stream-test-backend.onrender.com";

// ICE servers
const ICE_SERVERS: RTCIceServer[] = (() => {
  try {
    return JSON.parse(import.meta.env.VITE_ICE_SERVERS || "[]");
  } catch {
    return [{ urls: "stun:stun.l.google.com:19302" }];
  }
})();

const StreamerStudio: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnections = useRef<Record<string, RTCPeerConnection>>(
    {}
  );
  const localStream = useRef<MediaStream | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const streamTimerRef = useRef<NodeJS.Timeout | null>(null);

  // UI & media state
  const [isStreaming, setIsStreaming] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [activeFilter, setActiveFilter] = useState("none");
  const [streamTitle, setStreamTitle] = useState(
    "My Awesome Stream"
  );
  const [streamDescription, setStreamDescription] = useState("");

  // chat & analytics
  const [chatMessages, setChatMessages] = useState<
    Array<{ user: string; message: string; timestamp: number; isMod: boolean }>
  >([]);
  const [newMessage, setNewMessage] = useState("");
  const [viewerCount, setViewerCount] = useState(0);
  const [streamDuration, setStreamDuration] = useState(0);
  const [donations, setDonations] = useState<
    Array<{ user: string; amount: number }>
  >([]);

  // wallet & sharing
  const { publicKey, connected } = useWallet();
  const [streamId, setStreamId] = useState("");
  const [showQR, setShowQR] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);

  // setup socket.io + WebRTC handlers
  useEffect(() => {
    const socket = io(getSocketUrl(), {
      transports: ["websocket"],
      secure: true,
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    const handleWatcher = async (id: string) => {
      if (!localStream.current) return;
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peerConnections.current[id] = pc;
      localStream.current.getTracks().forEach((t) =>
        pc.addTrack(t, localStream.current!)
      );
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit("candidate", id, e.candidate);
        }
      };
      pc.ontrack = () => {}; // no-op on streamer side
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer", id, pc.localDescription);
    };

    const handleCandidate = (
      id: string,
      c: RTCIceCandidateInit
    ) => {
      const pc = peerConnections.current[id];
      if (pc) {
        pc
          .addIceCandidate(new RTCIceCandidate(c))
          .catch((e) =>
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

    socket.on("watcher", handleWatcher);
    socket.on("candidate", handleCandidate);
    socket.on("disconnectPeer", handleDisconnectPeer);
    socket.on("chatMessage", (msg) => {
      setChatMessages((prev) => [...prev, msg]);
      chatEndRef.current?.scrollIntoView({
        behavior: "smooth",
      });
    });
    socket.on("viewerUpdate", setViewerCount);
    socket.on("donation", (don) =>
      setDonations((prev) => [...prev.slice(-4), don])
    );

    return () => {
      socket.off("watcher", handleWatcher);
      socket.off("candidate", handleCandidate);
      socket.off("disconnectPeer", handleDisconnectPeer);
      socket.off("chatMessage");
      socket.off("viewerUpdate");
      socket.off("donation");
      socket.disconnect();
      // cleanup local
      localStream.current?.getTracks().forEach((t) =>
        t.stop()
      );
      Object.values(peerConnections.current).forEach((pc) =>
        pc.close()
      );
    };
  }, []);

  // apply mute/unmute to outgoing track
  useEffect(() => {
    if (localStream.current) {
      localStream.current
        .getAudioTracks()
        .forEach((t) => (t.enabled = !isMuted));
    }
  }, [isMuted]);

  // apply camera on/off to outgoing track
  useEffect(() => {
    if (localStream.current) {
      localStream.current
        .getVideoTracks()
        .forEach((t) => (t.enabled = isCameraOn));
    }
  }, [isCameraOn]);

  // start capturing local media
  const startStreaming = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localStream.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
    setIsStreaming(true);
    if (!streamTimerRef.current) {
      streamTimerRef.current = setInterval(
        () => setStreamDuration((t) => t + 1),
        1000
      );
    }
  };

  // stop streaming
  const stopStreaming = () => {
    if (localStream.current) {
      localStream.current.getTracks().forEach((t) => t.stop());
      localStream.current = null;
    }
    Object.values(peerConnections.current).forEach((pc) =>
      pc.close()
    );
    peerConnections.current = {};
    if (videoRef.current) videoRef.current.srcObject = null;
    socketRef.current?.emit("endStream");
    setIsStreaming(false);
    if (streamTimerRef.current) {
      clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
    setStreamDuration(0);
  };

  // toggle stream on/off
  const toggleStream = async () => {
    if (!isStreaming) {
      const id = uuidv4();
      setStreamId(id);
      socketRef.current?.emit("broadcaster");
      socketRef.current?.emit("startStream", {
        streamId: id,
        publicKey: publicKey?.toString(),
        title: streamTitle,
        description: streamDescription,
      });
      await startStreaming();
    } else {
      stopStreaming();
    }
  };

  // restart backend + go live
  const handleGoLive = async () => {
    if (!publicKey) return;
    setIsRestarting(true);
    try {
      await restartRenderService(
        import.meta.env.RENDER_STREAM_SERVICE_ID
      );
      if (isStreaming) stopStreaming();
      const id = uuidv4();
      setStreamId(id);
      socketRef.current?.emit("broadcaster");
      socketRef.current?.emit("startStream", {
        streamId: id,
        publicKey: publicKey.toString(),
        title: streamTitle,
        description: streamDescription,
      });
      await startStreaming();
    } catch (err) {
      console.error("Go Live failed:", err);
    } finally {
      setIsRestarting(false);
    }
  };

  // send chat
  const sendMessage = () => {
    if (!newMessage.trim()) return;
    const msgObj = {
      user: "Streamer",
      message: newMessage.trim(),
      timestamp: Date.now(),
      isMod: true,
    };
    socketRef.current?.emit("chatMessage", msgObj);
    setChatMessages((prev) => [...prev, msgObj]);
    setNewMessage("");
  };

  return (
    <div
      className={`h-screen flex ${
        theme === "dark"
          ? "bg-gray-900 text-white"
          : "bg-gray-50 text-gray-900"
      }`}
    >
      {/* QR Modal */}
      {showQR && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg">
            <h3 className="text-xl mb-4">Scan to Join</h3>
            <QRCodeCanvas
              value={`${window.location.origin}/viewers/${streamId}`}
            />
            <div className="mt-4">
              <button
                onClick={() => setShowQR(false)}
                className="bg-red-500 text-white px-4 py-2 rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Left panel */}
      <div className="flex-1 flex flex-col p-6 space-y-6">
        {/* wallet connect */}
        <div>
          {!connected ? (
            <WalletMultiButton />
          ) : (
            <span className="px-3 py-1 bg-green-600 rounded">
              Connected:{" "}
              {publicKey?.toString().slice(0, 6)}…
              {publicKey?.toString().slice(-4)}
            </span>
          )}
        </div>

        {/* title & stats */}
        <div className="flex justify-between items-center">
          <div className="flex-1 space-y-2">
            <input
              type="text"
              placeholder="Stream Title"
              value={streamTitle}
              onChange={(e) =>
                setStreamTitle(e.target.value)
              }
              className="w-full text-3xl font-bold bg-transparent border-b-2 border-gray-700 focus:border-purple-500 outline-none"
            />
            <input
              type="text"
              placeholder="Stream Description"
              value={streamDescription}
              onChange={(e) =>
                setStreamDescription(e.target.value)
              }
              className="w-full text-sm bg-transparent border-b-2 border-gray-700 focus:border-purple-500 outline-none"
            />
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <FiUsers />
              <span>{viewerCount}</span>
            </div>
            <div className="flex items-center space-x-2">
              <FiClock />
              <span>
                {new Date(streamDuration * 1000)
                  .toISOString()
                  .substr(11, 8)}
              </span>
            </div>
          </div>
        </div>

        {/* video preview */}
        <div className="relative flex-1 bg-black rounded-xl overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={`h-full w-full object-cover ${activeFilter}`}
          />
          {/* chat overlay */}
          <div className="absolute bottom-4 left-4 space-y-2">
            {chatMessages.slice(-3).map((msg, i) => (
              <div
                key={i}
                className="p-2 rounded-lg backdrop-blur-sm bg-gray-900/50"
              >
                <span className="font-semibold text-red-500">
                  @{msg.user}
                </span>
                <span>: {msg.message}</span>
              </div>
            ))}
          </div>
          {/* donation alerts */}
          <div className="absolute top-4 right-4 space-y-2">
            {donations.map((d, i) => (
              <div
                key={i}
                className="animate-fadeInRight bg-gradient-to-r from-purple-500 to-blue-500 p-3 rounded-lg"
              >
                🎉 ${d.amount} from @{d.user}
              </div>
            ))}
          </div>
        </div>

        {/* controls */}
        <div className="flex justify-between items-center">
          <div className="flex space-x-4">
            <button
              onClick={handleGoLive}
              disabled={isRestarting}
              className="px-6 py-3 rounded-full font-bold bg-blue-600"
            >
              {isRestarting
                ? "Restarting Server..."
                : "Restart + Go Live"}
            </button>
            <button
              onClick={toggleStream}
              className={`flex items-center space-x-2 px-6 py-3 rounded-full font-bold ${
                isStreaming ? "bg-red-500" : "bg-green-500"
              }`}
            >
              {isStreaming ? (
                <>
                  <span>End Stream</span>
                  <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
                </>
              ) : (
                "Start Stream"
              )}
            </button>
            <button
              onClick={() => setIsMuted((m) => !m)}
              className={`p-3 rounded-full ${
                isMuted ? "bg-red-500" : "bg-gray-700"
              }`}
            >
              {isMuted ? <FiMicOff /> : <FiMic />}
            </button>
            <button
              onClick={() => setIsCameraOn((c) => !c)}
              className={`p-3 rounded-full ${
                !isCameraOn
                  ? "bg-red-500"
                  : "bg-gray-700"
              }`}
            >
              {isCameraOn ? <FiCamera /> : <FiCameraOff />}
            </button>
          </div>
        </div>
      </div>

      {/* right panel */}
      <div
        className={`w-96 flex flex-col p-6 space-y-6 ${
          theme === "dark" ? "bg-gray-800" : "bg-white"
        }`}
      >
        <h2 className="text-xl font-bold mb-4">
          Live Chat
        </h2>
        <div className="flex-1 overflow-y-auto pr-2 space-y-3">
          {chatMessages.map((msg, i) => (
            <div
              key={i}
              className={`p-3 rounded-lg ${
                theme === "dark"
                  ? "bg-gray-700"
                  : "bg-gray-100"
              }`}
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <span
                    className={`font-semibold ${
                      msg.isMod
                        ? "text-red-500"
                        : "text-purple-400"
                    }`}
                  >
                    @{msg.user}
                  </span>
                  {msg.isMod && (
                    <span className="text-xs bg-red-500 text-white px-1 rounded">
                      MOD
                    </span>
                  )}
                </div>
                <span className="text-xs">
                  {new Date(
                    msg.timestamp
                  ).toLocaleTimeString()}
                </span>
              </div>
              <p className="mt-1">{msg.message}</p>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <div className="mt-4 flex space-x-2">
          <input
            type="text"
            placeholder="Send a message..."
            value={newMessage}
            onChange={(e) =>
              setNewMessage(e.target.value)
            }
            onKeyPress={(e) =>
              e.key === "Enter" && sendMessage()
            }
            className="flex-1 rounded-lg p-2 bg-gray-900 text-white"
          />
          <button
            onClick={sendMessage}
            className="bg-purple-500 p-2 rounded-lg"
          >
            <FiMessageSquare />
          </button>
        </div>

        {/* quick actions */}
        <div className="border-t pt-4 space-y-4">
          <button
            onClick={() =>
              setTheme((t) =>
                t === "dark" ? "light" : "dark"
              )
            }
            className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-700"
          >
            <FiSettings />
            <span>
              Theme:{" "}
              {theme.charAt(0).toUpperCase() + theme.slice(1)}
            </span>
          </button>
          <button className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-700">
            <FiDollarSign />
            <span>
              Donations: $
              {donations.reduce(
                (sum, d) => sum + d.amount,
                0
              )}
            </span>
          </button>
          <div className="space-y-2">
            <label className="block text-sm font-medium">
              Video Filters
            </label>
            <select
              value={activeFilter}
              onChange={(e) =>
                setActiveFilter(e.target.value)
              }
              className="w-full p-2 rounded-lg bg-gray-900 text-white"
            >
              <option value="none">None</option>
              <option value="brightness-150">
                Bright
              </option>
              <option value="grayscale">Grayscale</option>
              <option value="sepia">Sepia</option>
              <option value="contrast-200">
                High Contrast
              </option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StreamerStudio;