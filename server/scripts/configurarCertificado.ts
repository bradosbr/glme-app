/**
 * Configura o certificado digital A1 (e-CNPJ, .pfx) usado nas consultas de cadastro à SEFAZ.
 *
 * Uso:  pnpm certificado:configurar "C:\caminho\certificado.pfx"
 *       (ou npm run certificado:configurar -- "C:\caminho\certificado.pfx")
 *
 * - Pede a senha do certificado sem mostrá-la na tela.
 * - Confere se o arquivo abre com essa senha e mostra titular e validade.
 * - Certificados exportados com criptografia antiga (RC2/3DES, comum em A1 brasileiros) não abrem
 *   no OpenSSL 3 do Node: são convertidos para AES-256, com a mesma senha. O arquivo original não muda.
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
import forge from "node-forge";

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

class SenhaIncorreta extends Error {}

/**
 * Regrava o .pfx com AES-256 (PBES2), mantendo a senha: lê o formato antigo com o node-forge,
 * que não depende do OpenSSL, e exporta a chave com o certificado e a cadeia.
 */
function converterParaAes(pfx: Buffer, senha: string): Buffer {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(pfx.toString("binary")), senha);
  } catch (e) {
    if (/MAC could not be verified|Invalid password/i.test(String(e))) throw new SenhaIncorreta();
    throw e;
  }
  const bagsChave = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ];
  const chave = bagsChave.find((b) => b.key)?.key as forge.pki.rsa.PrivateKey | undefined;
  if (!chave) throw new Error("O arquivo não contém a chave privada.");
  const certificados = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [])
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => Boolean(c));
  // O certificado da própria chave vem primeiro; depois a cadeia
  const doTitular = (c: forge.pki.Certificate) => (c.publicKey as forge.pki.rsa.PublicKey).n.equals(chave.n);
  certificados.sort((a, b) => Number(doTitular(b)) - Number(doTitular(a)));
  const novo = forge.pkcs12.toPkcs12Asn1(chave, certificados, senha, { algorithm: "aes256", count: 10000 });
  return Buffer.from(forge.asn1.toDer(novo).getBytes(), "binary");
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
  let pfx: Buffer = readFileSync(caminho);
  const senha = await perguntarSenha("Senha do certificado (não aparece ao digitar): ");

  let dados;
  try {
    dados = dadosDoCertificado(pfx, senha);
  } catch (erroNativo) {
    // O OpenSSL 3 recusa RC2/3DES ("unsupported") e também senha errada ("mac verify failure");
    // o node-forge distingue os dois casos e converte o arquivo antigo
    try {
      pfx = converterParaAes(pfx, senha);
      dados = dadosDoCertificado(pfx, senha);
      console.log("\nO certificado usava criptografia antiga (RC2/3DES) e foi convertido para AES-256, com a mesma senha.");
    } catch (erro) {
      if (erro instanceof SenhaIncorreta) {
        console.error("\nSenha incorreta para este certificado.");
      } else {
        console.error("\nNão foi possível abrir o certificado.");
        console.error(`  Motivo: ${erro instanceof Error ? erro.message : String(erro)}`);
        console.error(`  (OpenSSL: ${erroNativo instanceof Error ? erroNativo.message : String(erroNativo)})`);
      }
      process.exit(1);
    }
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
