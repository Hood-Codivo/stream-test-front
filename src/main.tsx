import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { Toaster } from "sonner";
import { WalletConnectProvider } from "./components/WalletProvider.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
     <WalletConnectProvider>
    <BrowserRouter>
      <Toaster position="top-right" /> {/* you can change position */}
      <App />
    </BrowserRouter>
    </WalletConnectProvider>
  </StrictMode>
);
