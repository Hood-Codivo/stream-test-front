import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    global: "globalThis",
  },
  server: {
    proxy: {
      // Proxy WebSocket (and HTTP) for Socket.IO
      "/socket.io": {
        target: "http://127.0.0.1:3000",
        ws: true, // enable WebSocket proxying :contentReference[oaicite:1]{index=1}
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
