


// utils/renderApi.ts
import axios from 'axios';

const SERVICE_ID = import.meta.env.RENDER_API_KEY;              // e.g. “srv‑abc123”
const RENDER_API_BASE = import.meta.env.VITE_RENDERER_API_BASE_URL       // e.g. “https://api.render.com”

export async function restartRenderService(_RENDER_API_KEY: any) {
  if (!SERVICE_ID || !RENDER_API_BASE) {
    throw new Error("Missing RENDERER_SERVICE_ID or RENDERER_API_BASE_URL");
  }
  // Render’s REST API to restart a service:
  return axios.post(
    `${RENDER_API_BASE}/v1/services/${SERVICE_ID}/deploys`
  );
}