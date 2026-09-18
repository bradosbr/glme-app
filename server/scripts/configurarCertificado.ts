/**
 * Configura o certificado digital A1 (e-CNPJ, .pfx) usado nas consultas de cadastro à SEFAZ.
 *
 * Uso:  pnpm certificado:configurar "C:\caminho\certificado.pfx"
 *       (ou npm run certificado:configurar -- "C:\caminho\certificado.pfx")
 *
 * - Pede a senha do certificado sem mostrá-la na tela.
 * - Confere se o arquivo abre com essa senha e mostra titular e validade.
 * - Grava CERTIFICADO_A1_BASE64 e CERTIFICADO_A1_SENHA no .env (substitui se já existirem).
 * - Com --copiar-base64, copia o conteúdo em base64 para a área de transferência (para colar
 *   na variável do Vercel), sem exibi-lo.
 *
 * Nada é enviado a lugar nenhum: o arquivo e a senha ficam só no .env desta máquina.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import readline from "node:readline";
import tls from "node:tls";

const args = process.argv.slice(2);
const arquivoEnv = resolve(valorDaOpcao("--env") ?? ".env");
const copiarBase64 = args.includes("--copiar-base64");
const caminhoPfx = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--env");

function valorDaOpcao(nome: string): string | undefined {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
}

function perguntarSenha(pergunta: string): Promise<string> {
  // Senha pela variável de ambiente (uso em testes/automação) ou digitada sem eco
  if (process.env.SENHA_CERTIFICADO !== undefined) return Promise.resolve(process.env.SENHA_CERTIFICADO);
  return new Promise((ok) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let mostrando = true;
    const saida = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    saida._writeToOutput = (s: string) => {
      if (mostrando) saida.output.write(s);
      else if (s.includes("\n") || s.includes("\r")) saida.output.write("\n");
    };
    rl.question(pergunta, (resposta) => {
      rl.close();
      ok(resposta);
    });
    mostrando = false;
  });
}

function dadosDoCertificado(pfx: Buffer, senha: string) {
  const contexto = tls.createSecureContext({ pfx, passphrase: senha });
  const socket = new tls.TLSSocket(null as never, { secureContext: contexto });
  const cert = socket.getCertificate() as tls.PeerCertificate;
  socket.destroy();
  return { titular: cert.subject?.CN ?? "?", emissor: cert.issuer?.CN ?? "?", validoAte: new Date(cert.valid_to) };
}

/** Substitui (ou acrescenta) VARIAVEL=valor no .env, preservando o resto do arquivo. */
function gravarNoEnv(conteudo: string, variavel: string, valor: string): string {
  const linha = `${variavel}=${valor}`;
  const regex = new RegExp(`^${variavel}=.*$`, "m");
  if (regex.test(conteudo)) return conteudo.replace(regex, () => linha);
  const fim = conteudo.length === 0 || conteudo.endsWith("\n") ? "" : "\n";
  return `${conteudo}${fim}${linha}\n`;
}

/** Senha entre aspas simples no .env: o dotenv não interpreta $, # nem espaços dentro delas. */
function aspas(valor: string): string {
  if (valor.includes("'")) {
    if (valor.includes('"')) throw new Error("A senha tem aspas simples e duplas; o .env não consegue guardá-la. Cadastre-a direto no Vercel.");
    return `"${valor}"`;
  }
  return `'${valor}'`;
}

async function main() {
  if (!caminhoPfx) {
    console.error('Informe o arquivo do certificado: pnpm certificado:configurar "C:\\caminho\\certificado.pfx"');
    process.exit(1);
  }
  const caminho = resolve(caminhoPfx);
  if (!existsSync(caminho)) {
    console.error(`Arquivo não encontrado: ${caminho}`);
    process.exit(1);
  }
  const pfx = readFileSync(caminho);
  const senha = await perguntarSenha("Senha do certificado (não aparece ao digitar): ");

  let dados;
  try {
    dados = dadosDoCertificado(pfx, senha);
  } catch {
    console.error("\nNão foi possível abrir o certificado: confira a senha e se o arquivo é um .pfx/.p12 válido.");
    process.exit(1);
  }

  const vencido = dados.validoAte.getTime() < Date.now();
  console.log("\nCertificado aberto com sucesso:");
  console.log(`  Titular:    ${dados.titular}`);
  console.log(`  Emissor:    ${dados.emissor}`);
  console.log(`  Válido até: ${dados.validoAte.toLocaleDateString("pt-BR")}${vencido ? "  ← VENCIDO" : ""}`);
  if (vencido) {
    console.error("\nO certificado está vencido; a SEFAZ vai recusá-lo. Nada foi gravado.");
    process.exit(1);
  }

  const base64 = pfx.toString("base64");
  let env = existsSync(arquivoEnv) ? readFileSync(arquivoEnv, "utf8") : "";
  env = gravarNoEnv(env, "CERTIFICADO_A1_BASE64", base64);
  env = gravarNoEnv(env, "CERTIFICADO_A1_SENHA", aspas(senha));
  writeFileSync(arquivoEnv, env);
  console.log(`\nGravado em ${arquivoEnv} (CERTIFICADO_A1_BASE64 e CERTIFICADO_A1_SENHA).`);

  if (copiarBase64) {
    execSync("clip", { input: base64 });
    console.log("O conteúdo em base64 foi copiado para a área de transferência (para colar no Vercel).");
  }
  console.log("Reinicie o servidor local para ele passar a usar o certificado.");
}

main();
