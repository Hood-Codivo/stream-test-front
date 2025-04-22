import Button from "../components/ui/button";
import { Search, Menu, Bell, Wallet } from "lucide-react";
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

const Navbar = () => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { publicKey, disconnect } = useWallet();
  const [walletAddress, setWalletAddress] = useState("");

   // Update wallet address when public key changes
  useEffect(() => {
    if (publicKey) {
      setWalletAddress(publicKey.toBase58());
    } else {
      setWalletAddress("");
    }
  }, [publicKey]);
  
  const handleDisconnect = async () => {
    try {
      await disconnect();
      navigate("/"); // Optional: Redirect after disconnect
    } catch (error) {
      console.error("Error disconnecting wallet:", error);
    }
  };

  const goToStudio = () => {
    if (publicKey) {
      navigate("/studio");
    }
  };




 

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-md bg-background/90 border-b border-border">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-10">
            <Link to="/" className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent"></div>
              <span className="text-xl font-display gradient-text">
                SolStream
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-6">
              <Link
                to="/"
                className="text-sm font-medium hover:text-primary transition-colors"
              >
                Home
              </Link>
              <Link
                to="/explore"
                className="text-sm font-medium hover:text-primary transition-colors"
              >
                Explore
              </Link>
              <Link
                to="/following"
                className="text-sm font-medium hover:text-primary transition-colors"
              >
                Following
              </Link>
              {/* {walletConnected && (
                <Link
                  to="/studio"
                  className="text-sm font-medium hover:text-primary transition-colors"
                >
                  Studio
                </Link>
              )} */}
            </div>
          </div>

          <div className="hidden md:flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <input
                type="text"
                placeholder="Search streams..."
                className="bg-muted rounded-full pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary w-64"
              />
            </div>

            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary"></span>
            </Button>

            <div className="flex items-center gap-2">
              {publicKey && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToStudio}
                    className="text-primary border-primary"
                  >
                    Go Live
                  </Button>
                  <Button
                    onClick={handleDisconnect}
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <Wallet className="h-4 w-4" />
                    {`${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`}
                  </Button>
                </>
              )}
              <WalletMultiButton 
                className="!bg-gradient-to-r !from-primary !to-accent hover:!opacity-90 !rounded-full !px-4 !py-2 !text-sm"
                startIcon={<Wallet className="h-4 w-4 mr-2" />}
              >
                {publicKey ? (
                  `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
                ) : (
                  "Connect Wallet"
                )}
              </WalletMultiButton>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden px-4 py-3 border-t border-border bg-background">
          <div className="flex flex-col space-y-4">
            <Link
              to="/"
              className="text-sm font-medium hover:text-primary transition-colors"
            >
              Home
            </Link>
            <Link
              to="/explore"
              className="text-sm font-medium hover:text-primary transition-colors"
            >
              Explore
            </Link>
            <Link
              to="/following"
              className="text-sm font-medium hover:text-primary transition-colors"
            >
              Following
            </Link>
            {/* {walletConnected && (
              <Link
                to="/studio"
                className="text-sm font-medium hover:text-primary transition-colors"
              >
                Studio
              </Link>
            )} */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <input
                type="text"
                placeholder="Search streams..."
                className="bg-muted rounded-full pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary w-full"
              />
            </div>
           <div className="flex flex-col gap-2">
              {publicKey && (
                <>
                      <Button
                        onClick={goToStudio}
                        className="text-primary border-primary"
                      >
                        Go Live
                      </Button>
                      <Button
                        onClick={handleDisconnect}
                        variant="outline"
                        className="flex items-center justify-center gap-2"
                      >
                        <Wallet className="h-4 w-4" />
                        {`${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`}
                      </Button>
                    </>
              )}
              <WalletMultiButton 
                className="w-full !bg-gradient-to-r !from-primary !to-accent hover:!opacity-90 !rounded-full !px-4 !py-2 !text-sm"
                startIcon={<Wallet className="h-4 w-4 mr-2" />}
              >
                {publicKey ? (
                  `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
                ) : (
                  "Connect Wallet"
                )}
              </WalletMultiButton>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
