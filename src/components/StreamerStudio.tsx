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
  FiShare2,
} from "react-icons/fi";

// MOD: import wallet hook + UI button
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

// MOD: use named import instead of default (no default export in v4)  
import { QRCodeCanvas } from "qrcode.react";
import { v4 as uuidv4 } from "uuid";
import { restartRenderService } from "../utils/renderApi";


const getSocketUrl = () => {
  if (typeof window !== "undefined") {
    return import.meta.env.VITE_SOCKET_SERVER_URL || window.location.origin;
  }
  return "https://stream-test-backend.onrender.com";
};

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
  const peerConnections = useRef<Record<string, RTCPeerConnection>>({});
  const localStream = useRef<MediaStream | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const streamTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Streaming & UI state
  const [isStreaming, setIsStreaming] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [activeFilter, setActiveFilter] = useState("none");
  const [streamTitle, setStreamTitle] = useState("My Awesome Stream");
  const [streamDescription, setStreamDescription] = useState("");

  // Chat / Analytics state
  const [chatMessages, setChatMessages] = useState<
    Array<{
      user: string;
      message: string;
      timestamp: number;
      isMod: boolean;
    }>
  >([]);
  const [newMessage, setNewMessage] = useState("");
  const [viewerCount, setViewerCount] = useState(0);
  const [streamDuration, setStreamDuration] = useState(0);
  const [donations, setDonations] = useState<
    Array<{ user: string; amount: number }>
  >([]);

    // MOD: wallet connection state
  const { publicKey, connected } = useWallet();
  const [streamId, setStreamId] = useState<string>("");
  const [showQR, setShowQR] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);

  const generateStreamId = () => {
    const id = uuidv4();
    setStreamId(id);
    return id;
  };

  useEffect(() => {
    const socket = io(getSocketUrl(), {
      transports: ["websocket"],
      secure: true,
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    // --- WebRTC Handlers ---
    const handleWatcher = async (id: string) => {
      if (!localStream.current) {
        console.error("No local stream available");
        return;
      }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peerConnections.current[id] = pc;

      localStream.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStream.current!);
      });

      pc.onicecandidate = (e) => {
        if (e.candidate && socketRef.current) {
          socketRef.current.emit("candidate", id, e.candidate);
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
        console.error("Offer creation failed:", e);
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

    // --- Setup Socket Listeners ---
    socket.on("watcher", handleWatcher);
    socket.on("candidate", handleCandidate);
    socket.on("disconnectPeer", handleDisconnectPeer);
    socket.on("chatMessage", (msg) => {
      setChatMessages((prev) => [...prev, msg]);
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
    socket.on("viewerUpdate", setViewerCount);
    socket.on("donation", (don) =>
      setDonations((prev) => [...prev.slice(-4), don])
    );

    return () => {
      socket.disconnect();
    };
  }, []);

  const startStreaming = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStream.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setIsStreaming(true);

      // MOD: start the duration timer
      if (!streamTimerRef.current) {
        streamTimerRef.current = setInterval(
          () => setStreamDuration((t) => t + 1),
          1000
        );
      }

      socketRef.current?.emit("broadcaster");
      socketRef.current?.emit("startStream", {
        title: streamTitle,
        description: streamDescription,
      });
    } catch (err) {
      console.error("Media error:", err);
    }
  };

  const stopStreaming = () => {
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => track.stop());
      localStream.current = null;
    }
    Object.values(peerConnections.current).forEach((pc) => pc.close());
    peerConnections.current = {};
    if (videoRef.current) videoRef.current.srcObject = null;
    socketRef.current?.emit("endStream");
    setIsStreaming(false);

    // MOD: clear the timer
    if (streamTimerRef.current) {
      clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
    setStreamDuration(0);
  };

  // const toggleStream = async () => {
  //   if (!isStreaming) {
  //     await startStreaming();
  //     streamTimerRef.current = setInterval(() => {
  //       setStreamDuration((t) => t + 1);
  //     }, 1000);
  //   } else {
  //     stopStreaming();
  //     if (streamTimerRef.current) clearInterval(streamTimerRef.current);
  //     setStreamDuration(0);
  //   }
  // };

  const toggleStream = async () => {
    if (!isStreaming) {
      const streamId = generateStreamId()
      await startStreaming()
      socketRef.current?.emit('startStream', { 
        streamId,
        publicKey: publicKey?.toString(),
        title: streamTitle,
        description: streamDescription
      })
    } else {
      stopStreaming()
    }
  }

  const sendMessage = () => {
    if (!newMessage.trim()) return;
    const msg = {
      user: "Streamer",
      message: newMessage.trim(),
      timestamp: Date.now(),
      isMod: true,
    };
    socketRef.current?.emit("chatMessage", msg);
    setChatMessages((prev) => [...prev, msg]);
    setNewMessage("");
  };

   /**
   * Handles the "Go Live" action with server restart
   */
  const handleGoLive = async () => {
    if (!publicKey) return;
    
    setIsRestarting(true);
    
    try {
      // 1. First restart the server
      await restartRenderService(process.env.RENDER_STREAM_SERVICE_ID);
      
      // 2. Then start local streaming
      await startStreaming();
      
      // 3. Generate stream ID after restart
      const streamId = generateStreamId();
      socketRef.current?.emit('startStream', { 
        streamId,
        publicKey: publicKey.toString()
      });
      
    } catch (error) {
      console.error('Go Live failed:', error);
    } finally {
      setIsRestarting(false);
    }
  };


  return (
  <div
    className={`h-screen flex ${
      theme === "dark" ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-900"
    }`}
  >

     {/* QR Code Modal & Stream ID Display (unchanged) */}
      {showQR && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg">
            <h3 className="text-xl mb-4">Share Stream Access</h3>
             {/* MOD: render QRCodeCanvas instead of default QRCode */}
            <QRCodeCanvas value={`${window.location.origin}/view/${streamId}`} />
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
      {/*  */}
            {/* Add Access Code Display */}
      {isStreaming && (
        <div className="absolute top-20 right-4 bg-gray-800 p-4 rounded">
          <div className="flex items-center gap-2 mb-2">
            <span>Stream ID: {streamId}</span>
            <button 
              onClick={() => navigator.clipboard.writeText(streamId)}
              className="text-blue-400 hover:text-blue-300"
            >
              Copy
            </button>
          </div>
          <button
            onClick={() => setShowQR(true)}
            className="bg-purple-500 px-4 py-2 rounded flex items-center gap-2"
          >
            <FiShare2 /> Share Stream
          </button>
        </div>
      )}

    {/* Left Panel */}
    <div className="flex-1 flex flex-col p-6 space-y-6">
      
      {/* MOD: Wallet connect button */}
        <div className="mb-4">
          {!connected ? (
            <WalletMultiButton />
          ) : (
            <span className="px-3 py-1 bg-green-600 rounded">
              Connected: {publicKey?.toString().slice(0, 6)}…{" "}
              {publicKey?.toString().slice(-4)}
            </span>
          )}
        </div>


      {/* Title & Stats */}
      <div className="flex justify-between items-center">
        <div className="flex-1 space-y-2">
          <input
            type="text"
            placeholder="Stream Title"
            value={streamTitle}
            onChange={(e) => setStreamTitle(e.target.value)}
            className={`w-full text-3xl font-bold bg-transparent border-b-2 ${
              theme === "dark"
                ? "border-gray-700 focus:border-purple-500"
                : "border-gray-300 focus:border-blue-500"
            } outline-none`}
          />
          <input
            type="text"
            placeholder="Stream Description"
            value={streamDescription}
            onChange={(e) => setStreamDescription(e.target.value)}
            className={`w-full text-sm bg-transparent border-b-2 ${
              theme === "dark"
                ? "border-gray-700 focus:border-purple-500"
                : "border-gray-300 focus:border-blue-500"
            } outline-none`}
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
                {new Date(streamDuration * 1000).toISOString().substr(11, 8)}
              </span>
          </div>
        </div>
      </div>

      {/* Video Preview (unchanged) */}
      <div className="relative flex-1 bg-black rounded-xl overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`h-full w-full object-cover ${activeFilter}`}
        />
        {/* Recent chat overlay */}
        <div className="absolute bottom-4 left-4 space-y-2">
          {chatMessages.slice(-3).map((msg, i) => (
            <div
              key={i}
              className={`p-2 rounded-lg backdrop-blur-sm ${
                theme === "dark" ? "bg-gray-900/50" : "bg-white/80"
              }`}
            >
              <span className={`font-semibold ${
                msg.isMod ? "text-red-500" : "text-purple-400"
              }`}>@{msg.user}</span>
              <span>: {msg.message}</span>
            </div>
          ))}
        </div>
        {/* Donation alerts */}
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

        {/* Controls */}
        <div className="flex justify-between items-center">
          <div className="flex space-x-4">
            {/* MOD: Restart server + Go Live */}
            <button
              onClick={handleGoLive}
              disabled={isRestarting}
              className={`go-live-btn ${
                isRestarting ? "restarting" : ""
              } px-6 py-3 rounded-full font-bold`}
            >
              {isRestarting ? "Restarting Server..." : "Restart + Go Live"}
            </button>

            {/* MOD: separate Start/Stop stream button */}
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

            {/* Mute / Camera toggles (unchanged) */}
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
              !isCameraOn ? "bg-red-500" : "bg-gray-700"
            }`}
          >
            {isCameraOn ? <FiCamera /> : <FiCameraOff />}
          </button>
        </div>
      </div>
    </div>

    {/* Right Panel */}
    <div
      className={`w-96 flex flex-col p-6 space-y-6 ${
        theme === "dark" ? "bg-gray-800" : "bg-white"
      }`}
    >
      {/* Chat */}
      <div className="flex-1 flex flex-col">
        <h2 className="text-xl font-bold mb-4">Live Chat</h2>
        <div className="flex-1 overflow-y-auto pr-2 space-y-3">
          {chatMessages.map((msg, i) => (
            <div
              key={i}
              className={`p-3 rounded-lg ${
                theme === "dark" ? "bg-gray-700" : "bg-gray-100"
              }`}
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <span className={`font-semibold ${
                    msg.isMod ? "text-red-500" : "text-purple-400"
                  }`}>@{msg.user}</span>
                  {msg.isMod && (
                    <span className="text-xs bg-red-500 text-white px-1 rounded">
                      MOD
                    </span>
                  )}
                </div>
                <span className="text-xs">
                  {new Date(msg.timestamp).toLocaleTimeString()}
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
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && sendMessage()}
            className={`flex-1 rounded-lg p-2 ${
              theme === "dark" ? "bg-gray-900" : "bg-gray-100"
            }`}
          />
          <button
            onClick={sendMessage}
            className="bg-purple-500 p-2 rounded-lg hover:bg-purple-600"
          >
            <FiMessageSquare />
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="border-t pt-4 space-y-4">
        <div className="flex justify-between">
          <button
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            className="flex items-center space-x-2 p-2 hover:bg-gray-700 rounded-lg"
          >
            <FiSettings />
            <span>Theme: {theme.charAt(0).toUpperCase() + theme.slice(1)}</span>
          </button>
          <button className="flex items-center space-x-2 p-2 hover:bg-gray-700 rounded-lg">
            <FiDollarSign />
            <span>
              Donations: $
              {donations.reduce((sum, d) => sum + d.amount, 0)}
            </span>
          </button>
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium">Video Filters</label>
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
            className={`w-full p-2 rounded-lg ${
              theme === "dark" ? "bg-gray-900" : "bg-gray-100"
            }`}
          >
            <option value="none">None</option>
            <option value="brightness-150">Bright</option>
            <option value="grayscale">Grayscale</option>
            <option value="sepia">Sepia</option>
            <option value="contrast-200">High Contrast</option>
          </select>
        </div>
      </div>
    </div>
  </div>
)}

export default StreamerStudio;
