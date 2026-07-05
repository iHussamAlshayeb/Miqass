import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react-datepicker") || id.includes("date-fns")) return "vendor-calendar";
          if (id.includes("framer-motion")) return "vendor-motion";
          if (id.includes("lucide-react") || id.includes("react-icons")) return "vendor-icons";
          if (id.includes("qrcode.react")) return "vendor-qrcode";
          if (id.includes("xlsx")) return "vendor-xlsx";
          return "vendor";
        },
      },
    },
  },
  server: {
    allowedHosts: ["miqass.app", "localhost", "127.0.0.1"],
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
