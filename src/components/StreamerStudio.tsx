// StreamerStudio.tsx
import { useState, useEffect, useRef, FC } from 'react';
import { io, Socket } from 'socket.io-client';
import './StreamerStudio.css';

const StreamerStudio: FC = () => {
  const [walletConnected, setWalletConnected] = useState<boolean>(false);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [streamKey, setStreamKey] = useState<string>('');
  const [isPrivate, setIsPrivate] = useState<boolean>(false);
  const [pendingViewers, setPendingViewers] = useState<string[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
  const localStreamRef = useRef<MediaStream | null>(null);

  const stunServers: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  useEffect(() => {
    socketRef.current = io();

    socketRef.current.on('streamKey', (key: string) => {
      setStreamKey(key);
      console.log('Stream key received:', key);
    });

    socketRef.current.on('viewerRequest', (viewerId: string) => {
      if (isPrivate) {
        setPendingViewers(prev => [...prev, viewerId]);
      }
    });

    socketRef.current.on('viewer-connected', async (viewerId: string) => {
      console.log('New viewer connected:', viewerId);

      const peerConnection = new RTCPeerConnection(stunServers);
      peerConnectionsRef.current[viewerId] = peerConnection;

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          peerConnection.addTrack(track, localStreamRef.current as MediaStream);
        });
      }

      peerConnection.onicecandidate = event => {
        if (event.candidate) {
          socketRef.current?.emit('streamerICECandidate', {
            viewerId,
            candidate: event.candidate
          });
        }
      };

      try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socketRef.current?.emit('streamerOffer', {
          viewerId,
          offer
        });
      } catch (error) {
        console.error('Error creating offer:', error);
      }
    });

    socketRef.current.on('viewerAnswer', async ({ viewerId, answer }: { viewerId: string; answer: RTCSessionDescriptionInit }) => {
      try {
        const pc = peerConnectionsRef.current[viewerId];
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          console.log('Set viewer answer as remote description');
        }
      } catch (error) {
        console.error('Error setting remote description:', error);
      }
    });

    socketRef.current.on('viewerICECandidate', async ({ viewerId, candidate }: { viewerId: string; candidate: RTCIceCandidateInit }) => {
      try {
        const pc = peerConnectionsRef.current[viewerId];
        if (pc) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
          console.log('Added ICE candidate from viewer');
        }
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    });

    socketRef.current.on('viewerDisconnected', (viewerId: string) => {
      const pc = peerConnectionsRef.current[viewerId];
      if (pc) {
        pc.close();
        delete peerConnectionsRef.current[viewerId];
      }
    });

    return () => {
      socketRef.current?.disconnect();
      Object.values(peerConnectionsRef.current).forEach(connection => connection.close());
      localStreamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, [isPrivate]);

  const connectWallet = async () => {
    try {
      const ethProvider = (window as any).ethereum;
      if (ethProvider) {
        const accounts: string[] = await ethProvider.request({ method: 'eth_requestAccounts' });
        setWalletAddress(accounts[0]);
        setWalletConnected(true);
      } else {
        alert('Please install a wallet like MetaMask to continue');
      }
    } catch (error) {
      console.error('Error connecting wallet:', error);
    }
  };

  const startStream = async () => {
    try {
      localStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
      });
      if (videoRef.current) {
        videoRef.current.srcObject = localStreamRef.current;
      }
      socketRef.current?.emit('startStream', { isPrivate });
      setIsStreaming(true);
    } catch (error) {
      console.error('Error starting stream:', error);
      alert('Could not access camera or microphone');
    }
  };

  const stopStream = () => {
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    Object.values(peerConnectionsRef.current).forEach(connection => connection.close());
    peerConnectionsRef.current = {};
    socketRef.current?.emit('endStream');
    setIsStreaming(false);
    setStreamKey('');
    setPendingViewers([]);
  };

  const approveViewer = (viewerId: string) => {
    socketRef.current?.emit('approveViewer', viewerId);
    setPendingViewers(prev => prev.filter(id => id !== viewerId));
  };

  const rejectViewer = (viewerId: string) => {
    socketRef.current?.emit('rejectViewer', viewerId);
    setPendingViewers(prev => prev.filter(id => id !== viewerId));
  };

  const copyStreamLink = () => {
    const url = `${window.location.origin}/view?key=${streamKey}`;
    navigator.clipboard.writeText(url);
    alert('Stream link copied to clipboard!');
  };

  return (
    <div className="streamer-studio">
      <h1>Streaming Studio</h1>

      {!walletConnected ? (
        <div className="wallet-connect">
          <p>Connect your wallet to start streaming</p>
          <button onClick={connectWallet}>Connect Wallet</button>
        </div>
      ) : (
        <div className="studio-content">
          <div className="wallet-info">
            <p>
              Connected Wallet: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
            </p>
          </div>

          {!isStreaming ? (
            <div className="stream-setup">
              <h2>Stream Setup</h2>
              <div className="stream-options">
                <label>
                  <input
                    type="checkbox"
                    checked={isPrivate}
                    onChange={e => setIsPrivate(e.target.checked)}
                  />
                  Private Stream (Approve viewers manually)
                </label>
              </div>
              <button className="start-button" onClick={startStream}>
                Start Streaming
              </button>
            </div>
          ) : (
            <div className="active-stream">
              <div className="stream-info">
                <h2>You're Live!</h2>
                <p>Stream Key: {streamKey}</p>
                <button onClick={copyStreamLink}>Copy Stream Link</button>
                <button className="stop-button" onClick={stopStream}>
                  End Stream
                </button>
              </div>

              {isPrivate && pendingViewers.length > 0 && (
                <div className="viewer-requests">
                  <h3>Pending Viewer Requests</h3>
                  <ul>
                    {pendingViewers.map(viewerId => (
                      <li key={viewerId}>
                        <span>Viewer: {viewerId.slice(0, 8)}</span>
                        <div className="request-actions">
                          <button onClick={() => approveViewer(viewerId)}>
                            Approve
                          </button>
                          <button onClick={() => rejectViewer(viewerId)}>
                            Reject
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="video-preview">
            <video ref={videoRef} autoPlay muted playsInline></video>
          </div>
        </div>
      )}
    </div>
  );
};

export default StreamerStudio;
