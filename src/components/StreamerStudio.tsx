import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { io, Socket } from "socket.io-client";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import Button from "../components/ui/button";
import { toast } from "sonner";

const StreamerStudio = () => {
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnections = useRef<Record<string, RTCPeerConnection>>({});
  const localStream = useRef<MediaStream | null>(null);
  const screenStream = useRef<MediaStream | null>(null);

  // State
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
  const [streamKey, setStreamKey] = useState("");

  const getSocketUrl = useCallback(() => {
    if (typeof window !== "undefined") {
      return import.meta.env.VITE_SOCKET_SERVER_URL || window.location.origin;
    }
    return "https://stream-test-backend.onrender.com";
  }, []);

  const ICE_SERVERS = useMemo<RTCIceServer[]>(() => {
    try {
      return JSON.parse(import.meta.env.VITE_ICE_SERVERS || "[]");
    } catch {
      return [{ urls: "stun:stun.l.google.com:19302" }];
    }
  }, []);

  const streamStats = useMemo(
    () => ({
      bitrate: "4500 kbps",
      framerate: "60 FPS",
      latency: "1.2s",
    }),
    []
  );



  // Stream initialization
  const initializeStream = useCallback(async () => {
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

      const socket = io(getSocketUrl(), {
        transports: ["websocket"],
        secure: true,
        reconnectionAttempts: 5,
      });
      socketRef.current = socket;

      socket.on("watcher", handleWatcher);
      socket.on("candidate", handleCandidate);
      socket.on("disconnectPeer", handleDisconnectPeer);
      socket.emit("broadcaster");

      setIsLive(true);
      toast.success("Stream started successfully!");
    } catch (err) {
      console.error("Media error:", err);
      toast.error("Failed to access media devices");
    }
  }, [isCameraOff, isMicMuted, getSocketUrl]);

  // WebRTC Handlers
  const handleWatcher = useCallback(
    async (id: string) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peerConnections.current[id] = pc;
      setViewerCount((prev) => prev + 1);

      const currentStream = isScreenSharing && screenStream.current 
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

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current?.emit("offer", id, pc.localDescription);
      } catch (e) {
        console.error("Offer creation failed:", e);
      }
    },
    [ICE_SERVERS, isScreenSharing]
  );

  const handleCandidate = useCallback((id: string, c: RTCIceCandidateInit) => {
    peerConnections.current[id]?.addIceCandidate(new RTCIceCandidate(c));
  }, []);

  const handleDisconnectPeer = useCallback((id: string) => {
    peerConnections.current[id]?.close();
    delete peerConnections.current[id];
    setViewerCount((prev) => prev - 1);
  }, []);

  // Device Controls
  const toggleMic = useCallback(() => {
    const newMuteState = !isMicMuted;
    setIsMicMuted(newMuteState);
    localStream.current?.getAudioTracks().forEach((track) => {
      track.enabled = !newMuteState;
    });
  }, [isMicMuted]);

  const toggleCamera = useCallback(() => {
    const newCameraState = !isCameraOff;
    setIsCameraOff(newCameraState);
    localStream.current?.getVideoTracks().forEach((track) => {
      track.enabled = !newCameraState;
    });
  }, [isCameraOff]);

  const toggleScreenShare = useCallback(async () => {
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
            const sender = pc.getSenders().find((s) => s.track?.kind === "video");
            if (sender && videoTrack) sender.replaceTrack(videoTrack);
          });
        }
        setIsScreenSharing(false);
      }
    } catch (error) {
      console.error("Screen sharing error:", error);
    }
  }, [isScreenSharing]);

  // Stream Controls
  const handleGoLive = useCallback(async () => {
    if (!streamTitle.trim()) {
      toast.error("Please enter a title for your stream");
      return;
    }
    
    if (!isLive) {
      await initializeStream();
    }
  }, [isLive, streamTitle, initializeStream]);

  const handleChatSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (newChatMessage.trim()) {
        setChatMessages((prev) => [...prev, newChatMessage]);
        setNewChatMessage("");
      }
    },
    [newChatMessage]
  );

  // Effects
  useEffect(() => {
    const generateStreamKey = () => {
      const characters = "abcdefghijklmnopqrstuvwxyz0123456789";
      return "sol_" + Array.from({ length: 16 }, () =>
        characters.charAt(Math.floor(Math.random() * characters.length))
      ).join("");
    };
    setStreamKey(generateStreamKey());
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setNetworkQuality((prev) =>
        Math.max(70, Math.min(100, prev + (Math.random() * 4 - 2))
      ))
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
      Object.values(peerConnections.current).forEach((pc) => pc.close());
      localStream.current?.getTracks().forEach((t) => t.stop());
      screenStream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

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
                <Button
                  onClick={handleGoLive}
                  variant="primary"
                  className="px-8 py-4 text-lg"
                >
                  ▶️ Go Live
                </Button>
              </div>
            )}
          </div>

          {/* Stream Controls */}
          <div className="flex justify-center gap-4">
            <Button
              onClick={toggleMic}
              variant={isMicMuted ? "destructive" : "secondary"}
            >
              {isMicMuted ? "🎤❌ Unmute" : "🎤 Mute"}
            </Button>

            <Button
              onClick={toggleCamera}
              variant={isCameraOff ? "destructive" : "secondary"}
            >
              {isCameraOff ? "📷❌ Show Camera" : "📷 Hide Camera"}
            </Button>

            <Button
              onClick={toggleScreenShare}
              variant={isScreenSharing ? "primary" : "secondary"}
            >
              💻 {isScreenSharing ? "Stop Sharing" : "Share Screen"}
            </Button>
          </div>

          {/* Stream Info */}
          <div className="space-y-4 border-gray-900">
            <Input
              value={streamTitle}
              onChange={(e) => setStreamTitle(e.target.value)}
              className="text-2xl font-bold border-b border-gray-700"
              disabled={isLive}
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
          <Card className="p-4 flex-1 flex flex-col">
            <h2 className="font-semibold mb-4 text-lg">💬 Live Chat</h2>
            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {chatMessages.map((msg, i) => (
                <div key={i} className="p-2 bg-gray-700 rounded-lg text-sm">
                  {msg}
                </div>
              ))}
            </div>
            <form onSubmit={handleChatSubmit} className="flex gap-2">
              <Input
                value={newChatMessage}
                onChange={(e) => setNewChatMessage(e.target.value)}
                placeholder="Type a message..."
              />
              <Button type="submit">Send</Button>
            </form>
          </Card>

          {/* Stream Info Card */}
          <Card className="p-4">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Stream Key
                </label>
                <Input value={streamKey} readOnly />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Stream Description
                </label>
                <textarea
                  value={streamDescription}
                  onChange={(e) => setStreamDescription(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg"
                  disabled={isLive}
                />
              </div>
            </div>
          </Card>

          {/* Stream Stats */}
          <Card className="p-4">
            <h2 className="font-semibold mb-4 text-lg">📊 Stream Stats</h2>
            <div className="space-y-2">
              {Object.entries(streamStats).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span>{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                  <span className={key === 'latency' ? 'text-green-400' : ''}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default StreamerStudio;