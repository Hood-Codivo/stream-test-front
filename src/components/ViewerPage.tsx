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

function createSocket(url: string): Socket {
  const socket = io(url, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
  socket.on("connect", () => console.log("Socket connected:", socket.id));
  socket.on("connect_error", (err) => console.error("Socket connect_error:", err));
  socket.on("error", (err) => console.error("Socket error:", err));
  socket.on("disconnect", (reason) => console.warn("Socket disconnected:", reason));
  socket.on("reconnect_attempt", (attempt) => console.log("Socket reconnect_attempt:", attempt));
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


// const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

const ViewerPage: React.FC = () => {
  const { streamId } = useParams<{ streamId: string }>();
  const [hasStreamAccess, setHasStreamAccess] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("Connecting…");
  const [likes, setLikes] = useState(0);
  const [viewerCount, setViewerCount] = useState(0);
  const [donations, setDonations] = useState<{user:string;amount:number}[]>([]);
  const [chat, setChat] = useState<{user:string;message:string}[]>([]);
  const [msg, setMsg] = useState("");
  const [chatVisible, setChatVisible] = useState(true);
  const [theater, setTheater] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket|null>(null);
  const pcRef = useRef<RTCPeerConnection|null>(null);

  useEffect(() => {
    if (!streamId) return;
    const socket = createSocket(getSocketUrl());
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Socket connected (useEffect):", socket.id);
      socket.emit("joinStream", streamId, (res: { success: boolean }) => {
        console.log("joinStream ack on connect:", res);
        setHasStreamAccess(res.success);
        if (res.success) {
          console.log("Access granted, emitting watcher");
          socket.emit("watcher");
        } else {
          console.error("Access denied on initial join");
        }
      });
    });

    // 2️⃣ If the streamer goes live after you joined, start handshake
    socket.on("broadcaster", (sid: string) => {
      if (sid === streamId) socket.emit("watcher");
    });

    // 3️⃣ If you get approved in a closed stream
    socket.on("accessApproved", ({ streamId: sid }) => {
      if (sid === streamId) {
        setHasStreamAccess(true);
        socket.emit("watcher");
      }
    });

    socket.on("accessDenied", () => {
      alert("Streamer denied your request.");
    });



    socket.on("viewerUpdate", setViewerCount);
    socket.on("donation", (d) => setDonations((ds) => [...ds, d]));

    const handleOffer = async (id: string, desc: RTCSessionDescriptionInit) => {
      console.log("handleOffer received for id:", id);
      try {
        if (!streamId) {
      throw new Error('Missing stream ID');
      }
        pcRef.current?.close();


        const pc = new RTCPeerConnection({
          iceServers: ICE_SERVERS,
          iceTransportPolicy: "all",
          bundlePolicy: "max-bundle",
          rtcpMuxPolicy: "require"
        });
        // const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pcRef.current = pc;

        // Add data channel for metadata
        const dc = pc.createDataChannel('metadata');
        dc.onmessage = (e) => console.log('Metadata:', e.data);

        // ICE Candidate handling
        pc.onicecandidate = ({ candidate }) => {
          if (candidate) {
            console.log("[PC] Sending ICE candidate:", candidate);
            socket.emit("candidate", id, candidate);
          }
        };

        // pc.onicecandidate = (e) => e.candidate && socket.emit("candidate", id, e.candidate);

        // pc.ontrack = (e) => {
        //   console.log("pc.ontrack event:", e);
        //   if (videoRef.current) {
        //     videoRef.current.srcObject = e.streams[0];
        //     videoRef.current
        //       .play()
        //       .catch(() => setConnectionStatus("Click to play"));
        //   }
        // };

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
        await pc.setRemoteDescription(desc);
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


    socket.on("broadcaster", () => socket.emit("watcher"));
    socket.on("offer", handleOffer);
    socket.on("candidate", (_id, c) => pcRef.current?.addIceCandidate(new RTCIceCandidate(c)));

    return () => {
      console.log("[Cleanup] Disconnecting...");
      socket.off("broadcaster");
      socket.off("offer", handleOffer);
      socket.off("candidate", handleCandidate);
      socket.disconnect();
      pcRef.current?.close();
      setConnectionStatus("Disconnected");
    };

  }, [streamId]);

  useEffect(() => {
    const t = setInterval(() => setDonations((d) => d.slice(1)), 5000);
    return () => clearInterval(t);
  }, []);

  const rejoin = () => {
    console.log("Rejoin clicked for stream:", streamId);
    setIsJoining(true);
    socketRef.current?.emit("joinStream", streamId, (res: { success: boolean }) => {
      console.log("joinStream ack on rejoin:", res);
      setHasStreamAccess(res.success);
      if (res.success) {
        console.log("Rejoin successful, emitting watcher");
        socketRef.current?.emit("watcher");
      } else {
        console.error("Rejoin failed: access denied");
      }
      setIsJoining(false);
    });
  };

  const shareUrl = `${window.location.origin}/viewers/${streamId}`;  // fixed template literal for URL
  console.log("Share URL:", shareUrl);  // added debug log

  // Update conditional rendering:
  if (!hasStreamAccess) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <button
          onClick={() => socketRef.current?.emit("joinStream", streamId, (res: any) => {
            if (res.success) {
              setHasStreamAccess(true);
              socketRef.current?.emit("watcher");
            }
          })}
          className="px-6 py-3 bg-blue-600 rounded"
        >
          Request Access / Join
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-gray-900 text-white">
      {/* VIDEO + CONTROLS */}
      <div className={`flex ${theater ? "h-screen" : "min-h-screen"}`}>  {/* fixed template literal */}
        <div className={`${chatVisible ? "flex-1" : "w-full"} bg-black relative`}>  {/* fixed template literal */}
          <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/60 to-transparent flex justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span>LIVE • {viewerCount}</span>
            </div>
            <button onClick={() => setTheater((t) => !t)}>
              <FiMaximize />
            </button>
          </div>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted  // added muted for autoplay policy
            className="w-full h-full object-contain"
            onClick={() => videoRef.current?.play()}
            onCanPlay={() => {
          console.log("Video ready to play");
          videoRef.current?.play().catch(console.error);
        }}
        onError={(e) => {
          console.error("Video error:", e.nativeEvent);
          setConnectionStatus("Video playback error");
        }}
          />
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent flex justify-between items-center">
            <button onClick={rejoin} disabled={isJoining} className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-300 cursor-pointer">
              {isJoining ? "Rejoining…" : "Rejoin"}
            </button>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setLikes((l) => l + 1)}
                className="flex items-center space-x-1 px-3 py-1 rounded-full hover:bg-white/10"
              >
                <FiHeart /> {likes}
              </button>
              <button onClick={() => setShowQRCode(true)} className="p-2 hover:bg-white/10 rounded-full cursor-pointer">
                <FiShare2 />
              </button>
            </div>
            <span className="text-sm">{connectionStatus}</span>
          </div>
        </div>

        {/* CHAT */}
        {chatVisible && (
          <div className="w-96 bg-gray-800/90 backdrop-blur-lg flex flex-col">
            <div className="p-4 flex justify-between items-center border-b border-gray-700">
              <h2>Chat</h2>
              <button onClick={() => setChatVisible(false)}><FiX/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chat.map((m, i) => (
                <div key={i} className="flex items-start space-x-2">
                  <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                    {m.user[0]}
                  </div>
                  <div>
                    <strong className="text-purple-400">{m.user}</strong>
                    <p className="text-gray-200">{m.message}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-gray-700 flex space-x-2">
              <input
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                placeholder="Type…"
                className="flex-1 bg-gray-900 rounded px-3 py-2"
              />
              <button
                onClick={() => {
                  if (!msg.trim()) return;
                  setChat([...chat, { user: "Guest", message: msg }]);
                  setMsg("");
                }}
                className="bg-purple-600 px-3 py-2 rounded cursor-pointer"
              >
                <FiMessageSquare />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* DONATIONS */}
      <div className="fixed bottom-4 right-4 space-y-2">
        {donations.map((d, i) => (
          <div key={i} className="bg-gradient-to-r from-purple-500 to-blue-500 p-3 rounded flex items-center space-x-2">
            <FiHeart />
            <div>
              <div>🎉 ${d.amount}</div>
              <small>from @{d.user}</small>
            </div>
          </div>
        ))}
      </div>

      {/* QR MODAL */}
      {showQRCode && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg text-center">
            <h3 className="mb-4">Scan to Join</h3>
            <QRCodeCanvas value={shareUrl} />
            <p className="mt-4 break-all">
              <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                {shareUrl}
              </a>
            </p>
            <button
              onClick={() => setShowQRCode(false)}
              className="mt-4 bg-red-500 text-white px-4 py-2 rounded cursor-pointer"
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