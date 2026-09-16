import "dotenv/config";
import { createServer } from "http";
import app from "./app";
import { serveStatic, setupVite } from "./vite";

/**
 * Servidor para rodar fora do Vercel: `pnpm dev` (com Vite) e `pnpm start` (build da VM).
 * No Vercel este arquivo não é usado — a API roda como função em api/ e o frontend
 * é servido como estático. O admin inicial é criado manualmente com `pnpm db:seed`.
 */
async function startServer() {
  const server = createServer(app);

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "3000");
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
