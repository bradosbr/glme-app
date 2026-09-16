import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";

/**
 * No Vercel, api/trpc/[trpc] é uma rota dinâmica que o roteador pode entregar na forma
 * reescrita (/api/trpc/[trpc]?trpc=<procedure>) em vez do caminho original.
 * Reconstrói o caminho que o tRPC espera; se a URL já chegar original, devolve igual.
 */
export function restaurarCaminhoTrpc(url: string): string {
  const i = url.indexOf("?");
  const caminho = i === -1 ? url : url.slice(0, i);
  const query = i === -1 ? "" : url.slice(i + 1);

  let decodificado: string;
  try {
    decodificado = decodeURIComponent(caminho);
  } catch {
    return url;
  }
  if (decodificado !== "/api/trpc/[trpc]") return url;

  const params = new URLSearchParams(query);
  const procedure = params.get("trpc");
  if (!procedure) return url;
  params.delete("trpc");
  const resto = params.toString();
  // Mantém a vírgula literal: chamadas em lote usam /api/trpc/proc1,proc2
  const segmento = encodeURIComponent(procedure).replace(/%2C/gi, ",");
  return `/api/trpc/${segmento}${resto ? `?${resto}` : ""}`;
}

/**
 * App Express com a API tRPC — sem listen(), sem Vite e sem arquivos estáticos.
 *
 * É o que roda como função serverless no Vercel (empacotado em dist/server/app.js
 * pelo `pnpm build:vercel`) e também a base do servidor local (server/_core/index.ts).
 * No Vercel, o frontend (dist/public) é servido pelo próprio CDN, não pelo Express.
 */
export function createApp() {
  const app = express();
  app.use((req, _res, next) => {
    req.url = restaurarCaminhoTrpc(req.url);
    next();
  });
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  return app;
}

// Instância reaproveitada entre invocações da mesma função serverless
const app = createApp();
export default app;
