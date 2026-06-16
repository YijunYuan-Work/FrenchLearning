import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

function localApiPlugin() {
  return {
    name: "local-api-plugin",
    configureServer(server) {
      server.middlewares.use(
        "/api/autofill-vocabulary",
        async (request, response) => {
          const { default: handler } = await import(
            "./api/autofill-vocabulary.js"
          );
          await handler(request, response);
        }
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  Object.assign(process.env, env);

  return {
    plugins: [react(), localApiPlugin()],
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
    },
  };
});
