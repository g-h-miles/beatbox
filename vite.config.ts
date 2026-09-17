import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const api = process.env.BEATBOX_API_URL || "http://127.0.0.1:8787";
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: api,
        changeOrigin: true,
        configure(proxy) {
          proxy.on("proxyReq", (proxyRequest, request) => {
            // Preserve same-origin checking through the development-only proxy.
            if (request.headers.origin === `http://${request.headers.host}`)
              proxyRequest.setHeader("Origin", new URL(api).origin);
          });
        },
      },
    },
  },
});
