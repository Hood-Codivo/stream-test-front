// ViewerPage.tsx
import { useState, useEffect, useRef, FC } from 'react';
import { io, Socket } from 'socket.io-client';
import { useLocation } from 'react-router-dom';


const ViewerPage: FC = () => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isPending, setIsPending] = useState<boolean>(false);
  const [streamKey, setStreamKey] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [walletConnected, setWalletConnected] = useState<boolean>(false);
  const [walletAddress, setWalletAddress] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const location = useLocation();

  const stunServers: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const keyFromUrl = query.get('key');
    if (keyFromUrl) {
      setStreamKey(keyFromUrl);
    }

    socketRef.current = io();

    socketRef.current.on('connect', () => {
      console.log('Connected to server');
    });

    socketRef.current.on('streamNotFound', () => {
      setError('Stream not found. Please check the stream key.');
      setIsPending(false);
    });

    socketRef.current.on('pendingApproval', () => {
      setIsPending(true);
      console.log('Waiting for streamer approval...');
    });

    socketRef.current.on('approvalRejected', () => {
      setError('Your request to join the stream was rejected.');
      setIsPending(false);
    });

    socketRef.current.on('streamerOffer', async ({ offer }: { offer: RTCSessionDescriptionInit }) => {
      console.log('Received offer from streamer');
      setIsPending(false);
      setIsConnected(true);

      try {
        const pc = new RTCPeerConnection(stunServers);
        peerConnectionRef.current = pc;

        pc.ontrack = event => {
          console.log('Received remote track');
          if (videoRef.current && event.streams[0]) {
            videoRef.current.srcObject = event.streams[0];
          }
        };

        pc.onicecandidate = event => {
          if (event.candidate) {
            socketRef.current?.emit('viewerICECandidate', {
              candidate: event.candidate
            });
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socketRef.current?.emit('viewerAnswer', { answer });
      } catch (err) {
        console.error('Error handling streamer offer:', err);
        setError('Failed to establish connection to the stream.');
      }
    });

    socketRef.current.on('streamerICECandidate', async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      try {
        await peerConnectionRef.current?.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('Added ICE candidate from streamer');
      } catch (err) {
        console.error('Error adding ICE candidate:', err);
      }
    });

    socketRef.current.on('streamEnded', () => {
      setIsConnected(false);
      setError('The stream has ended.');
      peerConnectionRef.current?.close();
      peerConnectionRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    });

    return () => {
      socketRef.current?.disconnect();
      peerConnectionRef.current?.close();
    };
  }, [location.search]);

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
    } catch (err) {
      console.error('Error connecting wallet:', err);
    }
  };

  const joinStream = () => {
    if (!streamKey) {
      setError('Please enter a stream key');
      return;
    }
    setError('');
    socketRef.current?.emit('joinStream', { streamKey, wallet: walletAddress });
  };

  return (
    <div className="viewer-page">
      <h1>Stream Viewer</h1>

      {!walletConnected ? (
        <div className="wallet-connect">
          <p>Connect your wallet to join the stream</p>
          <button onClick={connectWallet}>Connect Wallet</button>
        </div>
      ) : (
        <div className="viewer-content">
          <div className="wallet-info">
            <p>
              Connected Wallet: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
            </p>
          </div>

          {!isConnected && !isPending ? (
            <div className="join-stream">
              <h2>Join a Stream</h2>
              <div className="stream-key-input">
                <input
                  type="text"
                  placeholder="Enter stream key"
                  value={streamKey}
                  onChange={e => setStreamKey(e.target.value)}
                />
                <button onClick={joinStream}>Join</button>
              </div>
              {error && <p className="error-message">{error}</p>}
            </div>
          ) : isPending ? (
            <div className="pending-approval">
              <h2>Waiting for approval</h2>
              <p>The streamer needs to approve your request to join this private stream.</p>
              <div className="loading-spinner"></div>
            </div>
          ) : (
            <div className="active-view">
              <h2>Watching Stream</h2>
              <div className="video-container">
                <video ref={videoRef} autoPlay playsInline></video>
              </div>
              {error && <p className="error-message">{error}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ViewerPage;
