// utils/renderApi.js
/**
 * Helper to call Render's REST API for service restarts
 * Requires RENDER_API_KEY in .env
 */
import axios from 'axios';

const RENDER_API_URL = import.meta.env.RENDER_API_KEY

export const restartRenderService = async (serviceId: any) => {
  try {
    const response = await axios.post(
      `${RENDER_API_URL}/${serviceId}/deploys`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${process.env.RENDER_API_KEY}`,
          'Accept': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error : any) {
    console.error('Render restart failed:', error.response?.data || error.message);
    throw error;
  }
};
