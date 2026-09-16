// Mesma API tRPC, em função separada só para /api/trpc/duimp.consultarAPI,
// que consulta o Portal Único (duas chamadas externas de até 15 s cada).
// Existe para receber maxDuration de 60 s no vercel.json sem estender as demais rotas.
export { default } from "../../dist/server/app.js";
