// Mesma API tRPC, em função separada só para /api/trpc/sefaz.consultarCadastro,
// que consulta o webservice da SEFAZ com o certificado A1 (até 20 s de espera).
// Existe para receber maxDuration de 30 s no vercel.json sem estender as demais rotas.
export { default } from "../../dist/server/app.js";
