// src/lib/wallet.ts
import { toast } from "sonner";

// Mock wallet connection functions for frontend display
export interface WalletInfo {
  address: string;
  balance: number;
  username?: string;
  avatar?: string;
}

let currentWallet: WalletInfo | null = null;

export const connectWallet = async (): Promise<WalletInfo | null> => {
  // Simulate connection delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  try {
    const mockWallet: WalletInfo = {
      address: "8xyt...F3de",
      balance: 45.27,
      username: "CryptoStreamer",
      avatar: "/avatar.jpg",
    };
    currentWallet = mockWallet;

    // Use a success toast
    toast.success("Wallet Connected", {
      description: `Connected to ${mockWallet.address}`,
    });

    return mockWallet;
  } catch (error) {
    toast.error("Connection Failed", {
      description: "Could not connect to wallet",
    });
    return null;
  }
};

export const disconnectWallet = (): void => {
  currentWallet = null;
  toast("Wallet Disconnected", {
    description: "Your wallet has been disconnected",
  });
};

export const getCurrentWallet = (): WalletInfo | null => {
  return currentWallet;
};
