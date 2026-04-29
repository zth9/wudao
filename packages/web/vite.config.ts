import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3000",
      "/ws": {
        target: "ws://127.0.0.1:3000",
        ws: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("/node_modules/@heroui/") ||
            id.includes("/node_modules/react-aria-components/") ||
            id.includes("/node_modules/@react-aria/") ||
            id.includes("/node_modules/@react-stately/") ||
            id.includes("/node_modules/@react-types/") ||
            id.includes("/node_modules/@radix-ui/")
          ) {
            return "heroui";
          }
          if (
            id.includes("/node_modules/react/") ||
            id.includes("/node_modules/react-dom/") ||
            id.includes("/node_modules/scheduler/")
          ) {
            return "react-vendor";
          }
        },
      },
    },
  },
});
