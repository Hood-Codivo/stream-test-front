import Button from "../components/ui/button";
import { Search, Menu, Bell, Wallet } from "lucide-react";
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  connectWallet,
  disconnectWallet,
  getCurrentWallet,
} from "../utils/walletConnection";

const Navbar = () => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");

  useEffect(() => {
    const wallet = getCurrentWallet();
    if (wallet) {
      setWalletConnected(true);
      setWalletAddress(wallet.address);
    }
  }, []);

  const handleConnectWallet = async () => {
    const wallet = await connectWallet();
    if (wallet) {
      setWalletConnected(true);
      setWalletAddress(wallet.address);
    }
    return wallet; // Return the wallet so we can check if it exists
  };

  const handleDisconnectWallet = () => {
    disconnectWallet();
    setWalletConnected(false);
    setWalletAddress("");
  };

  const goToStudio = async () => {
    if (walletConnected) {
      navigate("/studio");
    } else {
      // If wallet not connected, connect first then navigate
      const wallet = await handleConnectWallet();
      if (wallet) {
        navigate("/studio");
      }
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
              {walletConnected && (
                <Link
                  to="/studio"
                  className="text-sm font-medium hover:text-primary transition-colors"
                >
                  Studio
                </Link>
              )}
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

            {walletConnected ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToStudio}
                  className="text-primary border-primary"
                >
                  Go Live
                </Button>
                <Button
                  onClick={handleDisconnectWallet}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <Wallet className="h-4 w-4" />
                  {walletAddress}
                </Button>
              </div>
            ) : (
              <Button
                onClick={handleConnectWallet}
                className="bg-gradient-to-r from-primary to-accent hover:opacity-90"
              >
                <Wallet className="h-4 w-4 mr-2" />
                Connect Wallet
              </Button>
            )}
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
            {walletConnected && (
              <Link
                to="/studio"
                className="text-sm font-medium hover:text-primary transition-colors"
              >
                Studio
              </Link>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <input
                type="text"
                placeholder="Search streams..."
                className="bg-muted rounded-full pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary w-full"
              />
            </div>
            {walletConnected ? (
              <div className="flex flex-col gap-2">
                <Button
                  onClick={goToStudio}
                  className="text-primary border-primary"
                >
                  Go Live
                </Button>
                <Button
                  onClick={handleDisconnectWallet}
                  variant="outline"
                  className="flex items-center justify-center gap-2"
                >
                  <Wallet className="h-4 w-4" />
                  {walletAddress}
                </Button>
              </div>
            ) : (
              <Button
                onClick={handleConnectWallet}
                className="bg-gradient-to-r from-primary to-accent hover:opacity-90 w-full"
              >
                <Wallet className="h-4 w-4 mr-2" />
                Connect Wallet
              </Button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
