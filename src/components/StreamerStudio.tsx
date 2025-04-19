import {useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import Button  from "../components/ui/button";
import { toast } from "sonner"

const StreamerStudio = () => {
  // WebRTC Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnections = useRef<Record<string, RTCPeerConnection>>({});
  const localStream = useRef<MediaStream | null>(null);
  const screenStream = useRef<MediaStream | null>(null);

  // UI State
  const [isLive, setIsLive] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [streamTitle, setStreamTitle] = useState("My Live Stream");
  const [chatMessages, setChatMessages] = useState<string[]>([]);
  const [newChatMessage, setNewChatMessage] = useState("");
  const [networkQuality, setNetworkQuality] = useState(95);
  const [streamDescription, setStreamDescription] = useState("");
  const [, setStreamKey] = useState("");



  const [streamStats] = useState({
    bitrate: "4500 kbps",
    framerate: "60 FPS",
    latency: "1.2s",
  });

  useEffect(() => {
    const generateStreamKey = () => {
      const characters = "abcdefghijklmnopqrstuvwxyz0123456789";
      let key = "sol_";

      for (let i = 0; i < 16; i++) {
        key += characters.charAt(Math.floor(Math.random() * characters.length));
      }

      return key;
    };

    setStreamKey(generateStreamKey());
  }, []);



  // WebRTC Configuration
  const getSocketUrl = () => {
    if (typeof window !== "undefined") {
      return import.meta.env.VITE_SOCKET_SERVER_URL || window.location.origin;
    }
    return "https://stream-test-backend.onrender.com";
  };

  const ICE_SERVERS: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
  ];

    const handleGoLive = () => {
  if (!streamTitle.trim()) {
    toast.error("Please enter a title for your stream");
    return;
  }
  setIsLive(true);
};


  // Add network quality simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setNetworkQuality((prev) =>
        Math.max(70, Math.min(100, prev + (Math.random() * 4 - 2)))
      );
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // WebRTC Logic
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
          video: !isCameraOff,
          audio: !isMicMuted,
        });
        localStream.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(console.error);
        }

        socket.emit("broadcaster");
        setIsLive(true);

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
      setViewerCount((prev) => prev + 1);

      const currentStream =
        isScreenSharing && screenStream.current
          ? screenStream.current
          : localStream.current;

      currentStream?.getTracks().forEach((track) => {
        pc.addTrack(track, currentStream);
      });

      pc.onicecandidate = (e) => {
        if (e.candidate && socketRef.current) {
          socketRef.current.emit("candidate", id, e.candidate);
        }
      };

      socketRef.current?.on("answer", (answerId, description) => {
        if (answerId === id) {
          pc.setRemoteDescription(description).catch(console.error);
        }
      });

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current?.emit("offer", id, pc.localDescription);
      } catch (e) {
        console.error("Offer creation failed:", e);
      }
    };

    const handleCandidate = (id: string, candidate: RTCIceCandidateInit) => {
      const pc = peerConnections.current[id];
      pc?.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
    };

    const handleDisconnectPeer = (id: string) => {
      const pc = peerConnections.current[id];
      if (pc) {
        pc.close();
        delete peerConnections.current[id];
        setViewerCount((prev) => prev - 1);
      }
    };

    if (!isLive) startStreaming();

    return () => {
      Object.values(peerConnections.current).forEach((pc) => pc.close());
      socket.off("watcher", handleWatcher);
      socket.off("candidate", handleCandidate);
      socket.off("disconnectPeer", handleDisconnectPeer);
      socket.disconnect();
      localStream.current?.getTracks().forEach((t) => t.stop());
      screenStream.current?.getTracks().forEach((t) => t.stop());
    };
  }, [isLive, isCameraOff, isMicMuted, isScreenSharing]);

  // UI Handlers
  const toggleMic = () => {
    setIsMicMuted(!isMicMuted);
    localStream.current?.getAudioTracks().forEach((track) => {
      track.enabled = isMicMuted;
    });
  };

  const toggleCamera = () => {
    setIsCameraOff(!isCameraOff);
    localStream.current?.getVideoTracks().forEach((track) => {
      track.enabled = isCameraOff;
    });
  };

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        screenStream.current = stream;

        Object.values(peerConnections.current).forEach((pc) => {
          const videoTrack = stream.getVideoTracks()[0];
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender) sender.replaceTrack(videoTrack);
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setIsScreenSharing(true);
      } else {
        screenStream.current?.getTracks().forEach((track) => track.stop());
        screenStream.current = null;

        if (localStream.current && videoRef.current) {
          videoRef.current.srcObject = localStream.current;
          Object.values(peerConnections.current).forEach((pc) => {
            const videoTrack = localStream.current?.getVideoTracks()[0];
            const sender = pc
              .getSenders()
              .find((s) => s.track?.kind === "video");
            if (sender && videoTrack) sender.replaceTrack(videoTrack);
          });
        }
        setIsScreenSharing(false);
      }
    } catch (error) {
      console.error("Screen sharing error:", error);
    }
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newChatMessage.trim()) {
      setChatMessages([...chatMessages, newChatMessage]);
      setNewChatMessage("");
    }
  };

  return (
    <div className="h-screen bg-gray-900 text-white flex flex-col">
      {/* Top Control Bar */}
      <div className="bg-gray-800 p-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold">Stream Studio</h1>
          <div className="flex items-center gap-2 text-sm">
            <div className="flex items-center gap-1">
              <div
                className={`w-3 h-3 rounded-full ${
                  isLive ? "bg-red-500 animate-pulse" : "bg-gray-500"
                }`}
              />
              <span>{isLive ? "LIVE" : "OFFLINE"}</span>
            </div>
            <div className="flex items-center gap-1">
              <span>👥</span>
              <span>{viewerCount} viewers</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              /* Implement settings */
            }}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-full flex items-center gap-2 transition-colors"
          >
            ⚙️ Settings
          </button>
          <button className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-full flex items-center gap-2 transition-colors">
            ↗️ Share Stream
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 p-6 bg-gray-900">
        {/* Video Section */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="h-full w-full object-cover"
            />
            {!isLive && (
              <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                <button
                  onClick={() => setIsLive(true)}
                  className="px-8 py-4 bg-red-600 hover:bg-red-700 rounded-full text-lg flex items-center gap-2"
                >
                  ▶️ Go Live
                </button>
              </div>
            )}
          </div>

          {/* Stream Controls */}
          <div className="flex justify-center gap-4">
            <button
              onClick={toggleMic}
              className={`px-6 py-3 rounded-full flex items-center gap-2 ${
                isMicMuted
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-gray-700 hover:bg-gray-600"
              }`}
            >
              {isMicMuted ? "🎤❌" : "🎤"}
              {isMicMuted ? "Unmute" : "Mute"}
            </button>

            <button
              onClick={toggleCamera}
              className={`px-6 py-3 rounded-full flex items-center gap-2 ${
                isCameraOff
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-gray-700 hover:bg-gray-600"
              }`}
            >
              {isCameraOff ? "📷❌" : "📷"}
              {isCameraOff ? "Show Camera" : "Hide Camera"}
            </button>

            <button
              onClick={toggleScreenShare}
              className={`px-6 py-3 rounded-full flex items-center gap-2 ${
                isScreenSharing
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-gray-700 hover:bg-gray-600"
              }`}
            >
              💻
              {isScreenSharing ? "Stop Sharing" : "Share Screen"}
            </button>
          </div>

          {/* Stream Info */}
          <div className="space-y-4 border-gray-900">
            <input
              value={streamTitle}
              onChange={(e) => setStreamTitle(e.target.value)}
              className="w-full text-2xl font-bold bg-transparent border-b border-gray-700 focus:outline-none focus:border-blue-500"
            />
            <div className="flex gap-4 items-center">
              <div className="flex-1">
                <div className="text-sm text-gray-400 mb-1">
                  Connection Quality
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: `${networkQuality}%` }}
                  />
                </div>
              </div>
              <span className="text-sm text-green-500">{networkQuality}%</span>
            </div>
          </div>
        </div>
        

        {/* Right Sidebar */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          {/* Chat Section */}
          <div className="bg-gray-800 p-4 rounded-xl flex-1 flex flex-col">
            <h2 className="font-semibold mb-4 text-lg">💬 Live Chat</h2>
            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {chatMessages.map((msg, i) => (
                <div key={i} className="p-2 bg-gray-700 rounded-lg text-sm">
                  {msg}
                </div>
              ))}
            </div>
            <form onSubmit={handleChatSubmit} className="flex gap-2">
              <input
                value={newChatMessage}
                onChange={(e) => setNewChatMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-lg focus:outline-none"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Send
              </button>
            </form>
          </div>

          {/* Stream Stats */}
          <div className="bg-gray-800 p-4 rounded-xl">
            <h2 className="font-semibold mb-4 text-lg">📊 Stream Stats</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Bitrate</span>
                <span>{streamStats.bitrate}</span>
              </div>
              <div className="flex justify-between">
                <span>Framerate</span>
                <span>{streamStats.framerate}</span>
              </div>
              <div className="flex justify-between">
                <span>Latency</span>
                <span className="text-green-400">{streamStats.latency}</span>
              </div>
            </div>
          </div>
        </div>
      
       <div className="w-full">
              <Card className="p-4 w-full">
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="title"
                      className="block text-sm font-medium mb-1"
                    >
                      Stream Title
                    </label>
                    <Input
                      id="title"
                      value={streamTitle}
                      onChange={(e : any) => setStreamTitle(e.target.value)}
                      placeholder="Enter a catchy title for your stream"
                      disabled={isLive}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="description"
                      className="block text-sm font-medium mb-1"
                    >
                      Stream Description
                    </label> 
                   <textarea
                        id="description"
                        value={streamDescription}
                        onChange={(e) => setStreamDescription(e.target.value)}
                        placeholder="Describe what you'll be streaming…"
                        disabled={isLive}
                        className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg"
                        />
                  </div>
                  {!isLive && (
                    <div className="pt-2">
                      <Button
                        onClick={handleGoLive}
                        className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90"
                      >
                        Start Streaming
                      </Button>
                    </div>
                  )}
                </div>
                </Card>
              </div>
             
      </div>
    </div>
  );
}


export default StreamerStudio
