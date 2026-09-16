// Função serverless do Vercel para a API tRPC: atende /api/trpc/<procedure>.
// O app Express é empacotado em dist/server/app.js pelo `pnpm build:vercel`
// (esbuild resolve os aliases @shared/* e os imports sem extensão).
export { default } from "../../dist/server/app.js";
