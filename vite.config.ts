import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // ← Vite‑native Tailwind integration
  ],
  define: {
    global: "globalThis",
  },
  base: "/",
  server: {
    proxy: {
      // Proxy WebSocket (and HTTP) for Socket.IO
      "/socket.io": {
        target: "https://stream-test-backend.onrender.com",
        ws: true, // enable WebSocket proxying :contentReference[oaicite:1]{index=1}
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
