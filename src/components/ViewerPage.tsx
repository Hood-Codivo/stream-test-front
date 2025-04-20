import React, { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { FiHeart, FiShare2, FiMessageSquare, FiMaximize, FiUser, FiX } from "react-icons/fi";

// Add type definitions
type Donation = {
  user: string;
  amount: number;
};

type ChatMessage = {
  user: string;
  message: string;
};

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

    // Add donation listener
  socket.on("donation", (donation: Donation) => {
    setDonations(prev => [...prev, donation]);
  });

    socket.on("viewerUpdate", (count: number) => {
      setViewerCount(count);
    });

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
      socket.off("donation");
      socket.off("viewerUpdate");
      socket.off("broadcaster");
      socket.off("offer", handleOffer);
      socket.off("candidate", handleCandidate);
      socket.disconnect();
      pcRef.current?.close();
      setConnectionStatus("Disconnected");
    };
  }, []);


   const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [likes, setLikes] = useState(0);
  const [viewerCount, setViewerCount] = useState(0);
   const [donations, setDonations] = useState<Donation[]>([]); // Add donations state

  // Add these new state variables
  const [isChatVisible, setIsChatVisible] = useState(true);
  const [isTheaterMode, setIsTheaterMode] = useState(false);

   // Add chat toggle handler
  const toggleChat = () => {
    setIsChatVisible(!isChatVisible);
  };
  // Add auto-remove donations after 5 seconds
useEffect(() => {
  const timer = setInterval(() => {
    setDonations(prev => prev.slice(1)); // Remove oldest donation
  }, 5000);

  return () => clearInterval(timer);
}, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white relative">
      {/* Main Content Area */}
      <div className={`flex ${isTheaterMode ? 'h-screen' : 'min-h-screen'}`}>
        {/* Video Container */}
        <div className={`relative ${isChatVisible ? 'flex-1' : 'w-full'} bg-black`}>
          <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/60 to-transparent">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                  <span className="font-semibold">LIVE</span>
                </div>
                <div className="flex items-center space-x-2 text-sm">
                  <FiUser className="text-gray-300" />
                  <span>{viewerCount} watching</span>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <button 
                  onClick={() => setIsTheaterMode(!isTheaterMode)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <FiMaximize className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-full object-contain"
            onClick={() => videoRef.current?.play().catch(console.error)}
          />

          {/* Bottom Controls */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <button 
                  onClick={() => setLikes(prev => prev + 1)}
                  className="flex items-center space-x-2 hover:bg-white/10 px-4 py-2 rounded-full transition-colors"
                >
                  <FiHeart className="w-6 h-6" />
                  <span>{likes}</span>
                </button>
                <button className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <FiShare2 className="w-6 h-6" />
                </button>
              </div>
              <div className="text-sm text-gray-300">
                {connectionStatus}
              </div>
            </div>
          </div>
        </div>

        {/* Chat Sidebar */}
        {isChatVisible && (
          <div className="w-96 bg-gray-800/90 backdrop-blur-lg flex flex-col">
            <div className="p-4 border-b border-gray-700">
              <h2 className="text-xl font-semibold">Live Chat</h2>
              <button
                onClick={toggleChat}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatMessages.map((msg, i) => (
                <div key={i} className="flex items-start space-x-3">
                  <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                    <span className="text-sm">{msg.user[0]}</span>
                  </div>
                  <div>
                    <div className="font-medium text-purple-400">{msg.user}</div>
                    <p className="text-gray-100">{msg.message}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-gray-700">
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="Send a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="flex-1 bg-gray-900 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button 
                  onClick={() => {
                    if (newMessage.trim()) {
                      setChatMessages(prev => [...prev, {
                        user: "Viewer",
                        message: newMessage.trim()
                      }]);
                      setNewMessage("");
                    }
                  }}
                  className="bg-purple-500 p-2 rounded-lg hover:bg-purple-600 transition-colors"
                >
                  <FiMessageSquare className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Donation Alert */}
      <div className="fixed bottom-4 right-4 space-y-2">
       {donations.map((d: Donation, i: number) => (
          <div
            key={i}
            className="animate-fadeInRight bg-gradient-to-r from-purple-500 to-blue-500 p-4 rounded-lg shadow-lg flex items-center space-x-3"
          >
            <div className="bg-white/10 p-2 rounded-full">
              <FiHeart className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold">🎉 ${d.amount}</div>
              <div className="text-sm">from @{d.user}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ViewerPage;