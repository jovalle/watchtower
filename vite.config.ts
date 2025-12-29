import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

declare module "@remix-run/node" {
  interface Future {
    v3_singleFetch: true;
  }
}

export default defineConfig({
  server: {
    port: 9001,
  },
  plugins: [
    remix({
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_singleFetch: true,
        v3_lazyRouteDiscovery: true,
      },
    }),
    tsconfigPaths({
      // Ignore tmp directory which may contain reference projects
      ignoreConfigErrors: true,
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Code-splitting: Put hls.js in its own chunk for lazy loading
        // This only applies to client build (SSR marks it as external anyway)
        manualChunks(id) {
          if (id.includes("node_modules/hls.js")) {
            return "hls";
          }
        },
      },
    },
  },
});
