import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/tools":          "http://localhost:3001",
      "/health":         "http://localhost:3001",
      "/chat":           "http://localhost:3001",
      "/stream-chat":    { target: "http://localhost:3001", changeOrigin: true },
      "/stream-summary":       { target: "http://localhost:3001", changeOrigin: true },
      "/stream-all-sentiments": { target: "http://localhost:3001", changeOrigin: true },
      "/build-tx":       "http://localhost:3001",
      "/submit-tx":      "http://localhost:3001",
      "/decode-address": "http://localhost:3001",
    },
  },
});
