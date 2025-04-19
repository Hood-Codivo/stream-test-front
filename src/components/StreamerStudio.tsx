import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { FiCameraOff, FiCamera, FiMic, FiMicOff, FiMessageSquare, FiDollarSign, FiSettings, FiUsers, FiClock } from "react-icons/fi";

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

const StreamerStudio = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnections = useRef<Record<string, RTCPeerConnection>>({});
  const localStream = useRef<MediaStream | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

   const [isStreaming, setIsStreaming] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [activeFilter, setActiveFilter] = useState("none");
  const [platforms, setPlatforms] = useState({ youtube: true, twitch: true, tiktok: true });


  // Chat State
  const [chatMessages, setChatMessages] = useState<Array<{
    user: string;
    message: string;
    timestamp: number;
    isMod: boolean;
  }>>([]);
  const [newMessage, setNewMessage] = useState("");

  // Analytics
  const [viewerCount, setViewerCount] = useState(0);
  const [streamDuration, setStreamDuration] = useState(0);
  const [donations, setDonations] = useState<Array<{ user: string; amount: number }>>([]);

  useEffect(() => {
    const socket = io(getSocketUrl(), {
      transports: ["websocket"],
      secure: true,
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    const startStreaming = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        localStream.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        socket.emit("broadcaster");

        socket.on("watcher", handleWatcher);
        socket.on("candidate", handleCandidate);
        socket.on("disconnectPeer", handleDisconnectPeer);
      } catch (err) {
        console.error("Media error:", err);
      }
    };

    const handleWatcher = async (id: string) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peerConnections.current[id] = pc;

      localStream.current?.getTracks().forEach((track) => {
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

    startStreaming();

    return () => {
      Object.values(peerConnections.current).forEach((pc) => pc.close());
      socket.off("watcher", handleWatcher);
      socket.off("candidate", handleCandidate);
      socket.off("disconnectPeer", handleDisconnectPeer);
      socket.disconnect();
      localStream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // WebSocket and Chat Setup
  useEffect(() => {
    const socket = io("your-socket-server-url");
    socketRef.current = socket;

    socket.on("chatMessage", (message) => {
      setChatMessages(prev => [...prev, message]);
    });

    socket.on("viewerUpdate", (count) => {
      setViewerCount(count);
    });

    socket.on("donation", (donation) => {
      setDonations(prev => [...prev.slice(-4), donation]);
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  // Chat Functions
  const sendMessage = () => {
    if (!newMessage.trim()) return;
    
    const message = {
      user: "Streamer",
      message: newMessage.trim(),
      timestamp: Date.now(),
      isMod: true
    };

    socketRef.current?.emit("chatMessage", message);
    setChatMessages(prev => [...prev, message]);
    setNewMessage("");
  };

  // Streaming Controls
  const toggleStream = () => {
    if (!isStreaming) {
      socketRef.current?.emit("startStream");
      const timer = setInterval(() => {
        setStreamDuration(prev => prev + 1);
      }, 1000);
      return () => clearInterval(timer);
    } else {
      socketRef.current?.emit("endStream");
    }
    setIsStreaming(!isStreaming);
  };

 return (
    <div className={`h-screen flex ${theme === "dark" ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-900"}`}>
      {/* Left Panel */}
      <div className="flex-1 flex flex-col p-6 space-y-6">
        {/* Stream Title & Analytics */}
        <div className="flex justify-between items-center">
          <input
            type="text"
            placeholder="Stream Title"
            className={`text-3xl font-bold bg-transparent border-b-2 ${
              theme === "dark" ? "border-gray-700 focus:border-purple-500" : "border-gray-300 focus:border-blue-500"
            } outline-none`}
          />
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <FiUsers className="text-xl" />
              <span>{viewerCount}</span>
            </div>
            <div className="flex items-center space-x-2">
              <FiClock className="text-xl" />
              <span>{new Date(streamDuration * 1000).toISOString().substr(11, 8)}</span>
            </div>
          </div>
        </div>

        {/* Video Preview with Filters */}
        <div className="relative flex-1 bg-black rounded-xl overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={`h-full w-full object-cover ${activeFilter}`}
          />
          
          {/* Overlay Elements */}
          <div className="absolute bottom-4 left-4 space-y-2">
            {chatMessages.slice(-3).map((msg, i) => (
              <div
                key={i}
                className={`p-2 rounded-lg max-w-xs backdrop-blur-sm ${
                  theme === "dark" ? "bg-gray-900/50" : "bg-white/80"
                }`}
              >
                <span className={`font-semibold ${msg.isMod ? "text-red-500" : "text-purple-400"}`}>
                  @{msg.user}
                </span>
                <span className={theme === "dark" ? "text-white" : "text-gray-900"}>: {msg.message}</span>
              </div>
            ))}
          </div>

          {/* Donation Alerts */}
          <div className="absolute top-4 right-4 space-y-2">
            {donations.map((donation, i) => (
              <div
                key={i}
                className="animate-fadeInRight bg-gradient-to-r from-purple-500 to-blue-500 p-3 rounded-lg"
              >
                <span className="font-bold">🎉 ${donation.amount} from @{donation.user}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Control Bar */}
        <div className="flex justify-between items-center">
          <div className="flex space-x-4">
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
                "Go Live"
              )}
            </button>
            
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`p-3 rounded-full ${isMuted ? "bg-red-500" : "bg-gray-700"}`}
            >
              {isMuted ? <FiMicOff size={20} /> : <FiMic size={20} />}
            </button>
            
            <button
              onClick={() => setIsCameraOn(!isCameraOn)}
              className={`p-3 rounded-full ${!isCameraOn ? "bg-red-500" : "bg-gray-700"}`}
            >
              {isCameraOn ? <FiCamera size={20} /> : <FiCameraOff size={20} />}
            </button>
          </div>

          {/* Platform Selector */}
          <div className="flex space-x-2">
            {Object.entries(platforms).map(([platform, active]) => (
              <button
                key={platform}
                onClick={() => setPlatforms(prev => ({ ...prev, [platform]: !active }))}
                className={`px-4 py-2 rounded-full flex items-center space-x-2 ${
                  active ? "bg-blue-500" : "bg-gray-700"
                }`}
              >
                <img 
                  src={`/${platform}-icon.png`} 
                  alt={platform} 
                  className="w-5 h-5"
                />
                <span className="capitalize">{platform}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div className={`w-96 flex flex-col p-6 space-y-6 ${theme === "dark" ? "bg-gray-800" : "bg-white"}`}>
        {/* Chat Section */}
        <div className="flex-1 flex flex-col">
          <h2 className="text-xl font-bold mb-4">Live Chat</h2>
          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg ${
                  theme === "dark" ? "bg-gray-700" : "bg-gray-100"
                }`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center space-x-2">
                    <span className={`font-semibold ${msg.isMod ? "text-red-500" : "text-purple-400"}`}>
                      @{msg.user}
                    </span>
                    {msg.isMod && <span className="text-xs bg-red-500 text-white px-1 rounded">MOD</span>}
                  </div>
                  <span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className={`mt-1 ${theme === "dark" ? "text-gray-200" : "text-gray-800"}`}>
                  {msg.message}
                </p>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
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
              <FiMessageSquare size={20} />
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="border-t pt-4 space-y-4">
          <div className="flex justify-between">
            <button
              className="flex items-center space-x-2 p-2 hover:bg-gray-700 rounded-lg"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              <FiSettings size={20} />
              <span>Theme: {theme.charAt(0).toUpperCase() + theme.slice(1)}</span>
            </button>
            
            <button className="flex items-center space-x-2 p-2 hover:bg-gray-700 rounded-lg">
              <FiDollarSign size={20} />
              <span>Donations: ${donations.reduce((sum, d) => sum + d.amount, 0)}</span>
            </button>
          </div>

          {/* Video Filters */}
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
  );
};

export default StreamerStudio;