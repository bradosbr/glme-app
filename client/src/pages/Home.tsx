import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { gerarGLMEPDF } from "@/lib/glmePDF";
import { extrairTextoPDF } from "@/lib/extrairTextoPDF";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useGLMEForm, type AdicaoTributada, type ProdutoAdicao, type ValoresAdicaoForm } from "@/hooks/useGLMEForm";
import { ESTADOS_BRASIL, TIPOS_DOCUMENTO, TRATAMENTOS_TRIBUTARIOS } from "@/lib/formData";
import {
  AlertTriangle,
  Boxes,
  Building2,
  Calculator,
  CheckCircle2,
  Eraser,
  FileDown,
  FileText,
  Loader2,
  LogOut,
  MapPin,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
  UserRound,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { ncmNaListaNegativa } from "@/lib/listaNegativa";
import { formatarMoeda } from "@/lib/aliquotasICMS";
import { calcularFormulario, paraNumero, valoresDaDeclaracao } from "@/lib/calculoFormulario";
import { formatarAliquota, formatarDivisor } from "@/lib/calculoICMS";
import { cn } from "@/lib/utils";
import { Secao } from "@/components/glme/Secao";
import { BlocoAcao } from "@/components/glme/BlocoAcao";
import { AdicaoFiscal } from "@/components/glme/AdicaoFiscal";
import { ImportarDeclaracaoDialog } from "@/components/glme/ImportarDeclaracaoDialog";
import { ValoresAdicao } from "@/components/glme/ValoresAdicao";
import { SituacaoCadastral, type EstadoConsultaSefaz } from "@/components/glme/SituacaoCadastral";

const SECOES = [
  { id: "uf", rotulo: "UF" },
  { id: "importador", rotulo: "Importador" },
  { id: "adquirente", rotulo: "Adquirente" },
  { id: "declaracao", rotulo: "Declaração" },
  { id: "adicoes", rotulo: "Adições" },
  { id: "icms", rotulo: "ICMS" },
] as const;
const IDS_SECOES = SECOES.map((s) => s.id);

const formatarCNPJ = (digitos: string) => digitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
const reais = (v: string | undefined) =>
  parseFloat(v || "0").toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Destaca na navegação a seção visível na tela. */
function useSecaoAtiva(ids: readonly string[], alturaFixa: number) {
  const [ativa, setAtiva] = useState<string>(ids[0]);
  useEffect(() => {
    const observador = new IntersectionObserver(
      (entradas) => {
        const visivel = entradas.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visivel) setAtiva(visivel.target.id);
      },
      { rootMargin: `-${alturaFixa + 8}px 0px -55% 0px` },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observador.observe(el);
    });
    return () => observador.disconnect();
  }, [ids, alturaFixa]);
  return ativa;
}

function Campo({ rotulo, htmlFor, className, children }: { rotulo: string; htmlFor?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-[13px] font-medium text-muted-foreground">{rotulo}</Label>
      {children}
    </div>
  );
}

function CampoValor({ id, rotulo, valor, onChange }: { id: string; rotulo: string; valor?: string; onChange: (v: string) => void }) {
  return (
    <Campo rotulo={rotulo} htmlFor={id}>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        value={valor ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0,00"
        className="tabular-nums"
      />
    </Campo>
  );
}

function LinhaCalculo({ rotulo, detalhe, valor, destaque }: { rotulo: string; detalhe?: string; valor: number; destaque?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-4 px-4 py-2.5", destaque && "bg-brand-navy py-3.5 text-white")}>
      <dt className={cn("min-w-0", destaque ? "font-medium" : "text-muted-foreground")}>
        {rotulo}
        {detalhe && <span className="block text-xs tabular-nums opacity-80">{detalhe}</span>}
      </dt>
      <dd className={cn("shrink-0 whitespace-nowrap font-medium tabular-nums", destaque && "text-lg font-semibold")}>R$ {formatarMoeda(valor)}</dd>
    </div>
  );
}

function SelectUF({ id, value, onChange, placeholder = "Selecione" }: { id?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {ESTADOS_BRASIL.map((e) => (
          <SelectItem key={e.value} value={e.value}>{e.value} — {e.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function Home() {
  const { user, isAdmin, logout } = useAuth();
  const [, navigate] = useLocation();
  const {
    formData,
    updateField,
    updateImportador,
    updateAdquirente,
    updateDocumento,
    updateProduto,
    updateTributada,
    updateICMSCalculo,
    addProduto,
    removeProduto,
    substituirAdicoes,
    resetForm,
  } = useGLMEForm();

  // Cabeçalho e barra de ações ficam fixos: a altura real vira variável CSS,
  // usada no deslocamento das âncoras e no observador de seção ativa.
  const cabecalhoRef = useRef<HTMLElement>(null);
  const acoesRef = useRef<HTMLDivElement>(null);
  const [alturaFixa, setAlturaFixa] = useState(160);
  useEffect(() => {
    const medir = () => {
      // O cabeçalho já inclui a navegação e a barra de ações fixas.
      const cabecalho = cabecalhoRef.current?.offsetHeight ?? 0;
      const raiz = document.documentElement.style;
      raiz.setProperty("--altura-cabecalho", `${cabecalho}px`);
      raiz.setProperty("--deslocamento-ancora", `${cabecalho + 16}px`);
      setAlturaFixa(cabecalho);
    };
    medir();
    const observador = new ResizeObserver(medir);
    if (cabecalhoRef.current) observador.observe(cabecalhoRef.current);
    if (acoesRef.current) observador.observe(acoesRef.current);
    return () => observador.disconnect();
  }, []);
  const secaoAtiva = useSecaoAtiva(IDS_SECOES, alturaFixa);
  // No celular a barra de seções rola na horizontal: mantém a seção ativa visível
  useEffect(() => {
    const link = document.querySelector<HTMLElement>(`[data-secao-nav="${secaoAtiva}"]`);
    const barra = link?.closest("nav");
    // Rola só a barra (nunca a página), centralizando o link ativo
    if (link && barra) {
      const deslocamento = link.getBoundingClientRect().left - barra.getBoundingClientRect().left;
      barra.scrollTo({ left: barra.scrollLeft + deslocamento - barra.clientWidth / 2 + link.clientWidth / 2, behavior: "smooth" });
    }
  }, [secaoAtiva]);
  const [gerandoPDF, setGerandoPDF] = useState(false);
  const [confirmarLimpeza, setConfirmarLimpeza] = useState(false);

  // ===== Adquirente igual ao Importador =====
  const [adquirenteIgualImportador, setAdquirenteIgualImportador] = useState(true);

  // ===== CNPJ =====
  const [cnpjBusca, setCnpjBusca] = useState("");
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjStatus, setCnpjStatus] = useState<"idle" | "ok" | "error">("idle");

  // ===== CADASTRO DE IMPORTADORES =====
  const [showCadastro, setShowCadastro] = useState(false);
  const [editalDBFCadastro, setEditalDBFCadastro] = useState("");

  // ===== RECINTOS =====
  const { data: recintos = [] } = trpc.recintos.listar.useQuery();

  // ===== IMPORTADORES DO BD =====
  const { data: importadoresBD = [], refetch: refetchImportadores } = trpc.importadores.listar.useQuery();
  const salvarImportadorMutation = trpc.importadores.salvar.useMutation({
    onSuccess: () => {
      toast.success("Importador salvo no cadastro.");
      refetchImportadores();
      setShowCadastro(false);
    },
    onError: (e) => toast.error(`Erro ao salvar: ${e.message}`),
  });
  const excluirImportadorMutation = trpc.importadores.excluir.useMutation({
    onSuccess: () => {
      toast.success("Importador excluído.");
      refetchImportadores();
    },
    onError: (e) => toast.error(`Erro ao excluir: ${e.message}`),
  });

  // ===== IMPORTAÇÃO DE DI / DUIMP =====
  const [showImportar, setShowImportar] = useState(false);
  const [extraindoTextoPDF, setExtraindoTextoPDF] = useState(false);

  /**
   * Separa as adições da declaração: diferimento (entram na GLME) e tributação
   * normal (NCM na lista negativa, recolhimento integral, fora da GLME).
   * Os valores de cada adição seguem junto: o ICMS é calculado por alíquota
   * (lib/calculoFormulario), não mais no momento da importação.
   */
  const separarAdicoes = (adicoes: any[], valoresDe: (ad: any) => ValoresAdicaoForm | undefined) => {
    const produtos: ProdutoAdicao[] = [];
    const tributadas: AdicaoTributada[] = [];
    for (const ad of adicoes) {
      const ncm = String(ad.ncm || "");
      const numero = String(ad.numero || "");
      const itens = Array.isArray(ad.itens) ? ad.itens : undefined;
      const valores = valoresDe(ad);
      if (ncmNaListaNegativa(ncm)) {
        tributadas.push({ adicao: numero, ncm, descricao: ad.descricao, itens, valores });
      } else {
        produtos.push({
          adicao: numero,
          ncm,
          classeTarifaria: ncm,
          tratamento: "3", // 3 - Diferimento
          fundamentoLegal: "",
          valor: "",
          descricao: ad.descricao || undefined,
          valorAduaneiro: valores?.valorAduaneiro,
          itens,
          valores,
        });
      }
    }
    return { produtos, tributadas };
  };

  const aplicarAdicoes = (produtos: ProdutoAdicao[], tributadas: AdicaoTributada[]) => {
    substituirAdicoes(produtos, tributadas);
    if (tributadas.length > 0) {
      toast.info(`${tributadas.length} adição(ões) de tributação normal ficaram fora da guia (lista negativa do PEAP).`);
    }
  };

  /** Nova declaração: despesas da anterior não podem ficar para trás. */
  const reiniciarDespesas = (dados: { taxaSiscomex?: string; outrasReceitas?: { codigo: string; valor: string }[] }) => {
    updateICMSCalculo("taxaSiscomex", paraNumero(dados.taxaSiscomex) > 0 ? String(dados.taxaSiscomex) : "");
    updateICMSCalculo("outrasDespesas", "");
    updateICMSCalculo("iofCambio", "");
    updateICMSCalculo("afrmm", "");
    updateICMSCalculo("incluirAFRMM", false);
    updateICMSCalculo("outrasReceitas", dados.outrasReceitas ?? []);
  };

  const buscarImportadorInterno = async (cnpjRaw: string) => {
    const resp = await fetch(
      `/api/trpc/importadores.buscarPorCNPJ?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: { cnpj: cnpjRaw } } }))}`,
      { credentials: "include" },
    );
    const json = await resp.json();
    return json?.[0]?.result?.data?.json ?? json?.[0]?.result?.data ?? json?.result?.data;
  };

  const aplicarImportadorInterno = (interno: any, cnpjRaw: string) => {
    updateImportador("nome", interno.razaoSocial);
    updateImportador("cnpj", formatarCNPJ(cnpjRaw));
    if (interno.inscricaoEstadual) updateImportador("inscricaoEstadual", interno.inscricaoEstadual);
    if (interno.cnae) updateImportador("cnae", interno.cnae);
    if (interno.endereco) updateImportador("endereco", interno.endereco);
    if (interno.bairro) updateImportador("bairro", interno.bairro);
    if (interno.cep) updateImportador("cep", interno.cep);
    if (interno.municipio) updateImportador("municipio", interno.municipio);
    if (interno.uf) updateImportador("uf", interno.uf);
    if (interno.telefone) updateImportador("telefone", interno.telefone);
    if (interno.editalDBF) updateICMSCalculo("editalDBF", interno.editalDBF);
    toast.success(`Importador encontrado no cadastro: ${interno.razaoSocial}`);
  };

  const preencherFormularioDuimp = async (dados: any) => {
    let preenchidos = 0;

    // === IMPORTADOR: 1º cadastro interno → 2º dados do PDF ===
    const cnpjRaw = dados.importadorCnpj?.replace(/\D/g, "");
    let usouCadastroInterno = false;
    if (cnpjRaw && cnpjRaw.length === 14) {
      setCnpjBusca(cnpjRaw);
      try {
        const interno = await buscarImportadorInterno(cnpjRaw);
        if (interno?.razaoSocial) {
          aplicarImportadorInterno(interno, cnpjRaw);
          preenchidos += 8;
          usouCadastroInterno = true;
        }
      } catch (_e) {
        // Cadastro interno indisponível — usar dados do PDF
      }
    }
    if (!usouCadastroInterno) {
      if (dados.importadorNome) { updateImportador("nome", dados.importadorNome); preenchidos++; }
      if (dados.importadorCnpj) { updateImportador("cnpj", dados.importadorCnpj); preenchidos++; }
      if (dados.importadorEndereco) { updateImportador("endereco", dados.importadorEndereco); preenchidos++; }
      if (dados.importadorBairro) { updateImportador("bairro", dados.importadorBairro); preenchidos++; }
      if (dados.importadorCep) { updateImportador("cep", dados.importadorCep); preenchidos++; }
      if (dados.importadorMunicipio) { updateImportador("municipio", dados.importadorMunicipio); preenchidos++; }
      if (dados.importadorUf) { updateImportador("uf", dados.importadorUf); preenchidos++; }
    }
    if (dados.adquirenteNome || dados.adquirenteCnpj) {
      // A declaração trouxe adquirente próprio (importação por conta e ordem / encomenda).
      setAdquirenteIgualImportador(false);
      if (dados.adquirenteNome) { updateAdquirente("nome", dados.adquirenteNome); preenchidos++; }
      if (dados.adquirenteCnpj) { updateAdquirente("cnpj", dados.adquirenteCnpj); preenchidos++; }
    }

    // === DECLARAÇÃO ===
    const tiposAtuais: string[] = formData.documento.tipo || [];
    if (!tiposAtuais.includes("DUIMP")) {
      updateDocumento("tipo", [...tiposAtuais, "DUIMP"]);
      preenchidos++;
    }
    if (dados.numeroDuimp) { updateDocumento("numero", dados.numeroDuimp); preenchidos++; }
    if (dados.dataRegistro) {
      const [dd, mm, yyyy] = dados.dataRegistro.split("/");
      if (dd && mm && yyyy) { updateDocumento("dataRegistro", `${yyyy}-${mm}-${dd}`); preenchidos++; }
    }
    if (dados.valorAduaneiro) {
      updateDocumento("valorCIF", dados.valorAduaneiro);
      updateField("valorCIFAdicion", dados.valorAduaneiro);
      updateICMSCalculo("valorCIF", dados.valorAduaneiro);
      preenchidos++;
    }
    if (dados.recintoNome) { updateDocumento("nomeRecinto", dados.recintoNome); preenchidos++; }
    if (dados.recintoCodigoRaw) {
      updateDocumento("codRecinto", dados.recintoCodigoRaw);
      preenchidos++;
      const recintoEncontrado = recintos.find((r: any) => {
        const codigoDB = r.codigo.replace(/[.\-]/g, "");
        return codigoDB === dados.recintoCodigoRaw || codigoDB.startsWith(dados.recintoCodigoRaw.slice(0, 6));
      });
      if (recintoEncontrado?.uf) { updateDocumento("ufDesembaraco", recintoEncontrado.uf); preenchidos++; }
    }

    // === ICMS: tributos federais e Taxa Siscomex em campos separados ===
    const tributosDuimp = ["ii", "ipi", "pis", "cofins"].reduce((t, k) => t + Math.round(paraNumero(dados[k]) * 100), 0) / 100;
    if (tributosDuimp > 0) {
      updateICMSCalculo("impostos", tributosDuimp.toFixed(2));
      preenchidos++;
    }
    reiniciarDespesas({ taxaSiscomex: dados.taxaSiscomex });

    // === ADIÇÕES / ITENS ===
    // A API traz valores por item; o extrato em PDF, não (o cálculo fica pelos totais)
    if (dados.adicoes?.length > 0) {
      const { produtos, tributadas } = separarAdicoes(dados.adicoes, (ad) =>
        valoresDaDeclaracao({ valorAduaneiro: ad.valorAduaneiro, ii: ad.ii, ipi: ad.ipi, pis: ad.pis, cofins: ad.cofins, pesoLiquido: ad.pesoLiquido }),
      );
      aplicarAdicoes(produtos, tributadas);
      preenchidos += produtos.length;
    }

    setShowImportar(false);
    if (preenchidos > 0) {
      toast.success(`DUIMP importada: ${preenchidos} campos preenchidos.`);
    } else {
      toast.warning("DUIMP lida, mas poucos campos foram reconhecidos. Confira se é o extrato da DUIMP.");
    }
  };

  const parsearDuimpPDFMutation = trpc.duimp.parsearPDF.useMutation({
    onSuccess: async (result: any) => {
      if (!result.sucesso || !result.dados) {
        toast.error(result.erro || "Não foi possível ler o PDF da DUIMP.");
        return;
      }
      await preencherFormularioDuimp(result.dados);
    },
    onError: (e: any) => toast.error(`Erro ao processar PDF: ${e.message}`),
  });

  const consultarDuimpAPIMutation = trpc.duimp.consultarAPI.useMutation({
    onSuccess: async (result: any) => {
      if (!result.sucesso || !result.dados) {
        toast.error(result.erro || "Não foi possível consultar a DUIMP na API.");
        return;
      }
      await preencherFormularioDuimp(result.dados);
    },
    onError: (e: any) => toast.error(`Erro na API do Portal Único: ${e.message}`),
  });

  // ===== PARSER DI XML =====
  const parsearXMLMutation = trpc.di.parsearXML.useMutation({
    onSuccess: async (data: any) => {
      let preenchidos = 0;

      // ===== IMPORTADOR: 1º cadastro interno → 2º BrasilAPI → 3º dados do XML =====
      const preencherImportadorDoXML = (comCnpj?: string) => {
        if (data.importador?.nome) { updateImportador("nome", data.importador.nome); preenchidos++; }
        if (comCnpj) { updateImportador("cnpj", formatarCNPJ(comCnpj)); preenchidos++; }
        if (data.importador?.endereco) { updateImportador("endereco", data.importador.endereco); preenchidos++; }
        if (data.importador?.bairro) { updateImportador("bairro", data.importador.bairro); preenchidos++; }
        if (data.importador?.municipio) { updateImportador("municipio", data.importador.municipio); preenchidos++; }
        if (data.importador?.uf) { updateImportador("uf", data.importador.uf); preenchidos++; }
        if (data.importador?.cep) { updateImportador("cep", data.importador.cep); preenchidos++; }
        if (data.importador?.telefone) { updateImportador("telefone", data.importador.telefone); preenchidos++; }
      };

      const cnpjRaw = data.importador?.cnpj?.replace(/\D/g, "");
      if (cnpjRaw && cnpjRaw.length === 14) {
        setCnpjBusca(cnpjRaw);
        let usouCadastroInterno = false;
        try {
          const interno = await buscarImportadorInterno(cnpjRaw);
          if (interno?.razaoSocial) {
            aplicarImportadorInterno(interno, cnpjRaw);
            preenchidos += 8;
            usouCadastroInterno = true;
          }
        } catch (_eInterno) {
          // Cadastro interno indisponível, seguir para BrasilAPI
        }
        if (!usouCadastroInterno) {
          try {
            const resp = await fetch(
              `/api/trpc/cnpj.buscar?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: { cnpj: cnpjRaw } } }))}`,
              { credentials: "include" },
            );
            const json = await resp.json();
            const d = json?.[0]?.result?.data?.json ?? json?.[0]?.result?.data ?? json?.result?.data;
            if (d?.razaoSocial) {
              updateImportador("nome", d.razaoSocial);
              updateImportador("cnpj", formatarCNPJ(d.cnpj));
              if (d.cnae) updateImportador("cnae", d.cnae);
              if (d.endereco) updateImportador("endereco", d.endereco);
              if (d.bairro) updateImportador("bairro", d.bairro);
              if (d.cep) updateImportador("cep", d.cep);
              if (d.municipio) updateImportador("municipio", d.municipio);
              if (d.uf) updateImportador("uf", d.uf);
              if (d.telefone) updateImportador("telefone", d.telefone);
              preenchidos += 8;
              toast.info(`Importador atualizado pela Receita Federal: ${d.razaoSocial}`);
            } else {
              preencherImportadorDoXML(cnpjRaw);
            }
          } catch (_e) {
            preencherImportadorDoXML(cnpjRaw);
          }
        }
      } else {
        preencherImportadorDoXML();
      }

      // ===== DECLARAÇÃO =====
      if (data.numeroDI) { updateDocumento("numero", data.numeroDI); preenchidos++; }
      if (data.dataRegistro) {
        let dataFormatada = data.dataRegistro;
        const matchDMY = data.dataRegistro.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (matchDMY) dataFormatada = `${matchDMY[3]}-${matchDMY[2]}-${matchDMY[1]}`;
        updateDocumento("dataRegistro", dataFormatada);
        preenchidos++;
      }
      if (data.recintoCodigoRaw) { updateDocumento("codRecinto", data.recintoCodigoFormatado || data.recintoCodigoRaw); preenchidos++; }
      if (data.recintoNome) { updateDocumento("nomeRecinto", data.recintoNome); preenchidos++; }
      if (data.urfNome) { updateDocumento("urfNome", data.urfNome); preenchidos++; }
      if (data.ufDesembaraco) { updateDocumento("ufDesembaraco", data.ufDesembaraco); preenchidos++; }
      // Valor aduaneiro: soma das adições (base do II); o CIF do texto livre fica como reserva
      const valorAduaneiro = paraNumero(data.valorAduaneiroTotal) > 0 ? data.valorAduaneiroTotal : data.valorCIFReais || data.valorCIF;
      if (valorAduaneiro) {
        updateDocumento("valorCIF", valorAduaneiro);
        updateICMSCalculo("valorCIF", valorAduaneiro);
        updateField("valorCIFAdicion", valorAduaneiro);
        preenchidos++;
      }
      // Tributos federais (II + IPI + PIS + COFINS); a Taxa Siscomex vai para as despesas
      if (paraNumero(data.totalTributosFederais) > 0) {
        updateICMSCalculo("impostos", data.totalTributosFederais);
        preenchidos++;
      }
      reiniciarDespesas({ taxaSiscomex: data.taxaSiscomex, outrasReceitas: data.outrasReceitas });

      // ===== ADIÇÕES (já ordenadas por número no servidor) =====
      if (data.adicoes?.length > 0) {
        const { produtos, tributadas } = separarAdicoes(data.adicoes, (ad) =>
          valoresDaDeclaracao({
            valorAduaneiro: ad.valorAduaneiro,
            ii: ad.impostos?.ii,
            ipi: ad.impostos?.ipi,
            pis: ad.impostos?.pis,
            cofins: ad.impostos?.cofins,
            pesoLiquido: ad.pesoLiquido,
          }),
        );
        aplicarAdicoes(produtos, tributadas);
        preenchidos += produtos.length;
      }

      setShowImportar(false);
      if (preenchidos > 0) {
        toast.success(`DI ${data.numeroDI || ""} importada: ${preenchidos} campos preenchidos.`);
      } else {
        toast.warning("XML lido, mas nenhum campo reconhecido. Confira se é o XML da DI exportado do Siscomex.");
      }
    },
    onError: (e) => toast.error(`Erro ao processar DI: ${e.message}`),
  });

  /** Um único ponto de entrada: .xml = DI; .pdf = extrato da DUIMP. */
  const handleImportarArquivo = (arquivo: File) => {
    const nome = arquivo.name.toLowerCase();
    if (nome.endsWith(".xml")) {
      const reader = new FileReader();
      reader.onload = (e) => parsearXMLMutation.mutate({ xmlContent: e.target?.result as string });
      reader.readAsText(arquivo, "UTF-8");
      return;
    }
    if (nome.endsWith(".pdf")) {
      // O texto é extraído no navegador; o servidor recebe apenas o texto
      setExtraindoTextoPDF(true);
      extrairTextoPDF(arquivo)
        .then((texto) => parsearDuimpPDFMutation.mutate({ texto }))
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          toast.error(`Erro ao processar PDF: ${msg}`);
        })
        .finally(() => setExtraindoTextoPDF(false));
      return;
    }
    toast.error("Formato não suportado. Envie o XML da DI ou o PDF do extrato da DUIMP.");
  };

  const importando = parsearXMLMutation.isPending || parsearDuimpPDFMutation.isPending || extraindoTextoPDF;

  // ===== SEFAZ: inscrição estadual e situação cadastral (certificado A1) =====
  const [consultaSefaz, setConsultaSefaz] = useState<EstadoConsultaSefaz>({ estado: "inativo" });
  const consultarSefazMutation = trpc.sefaz.consultarCadastro.useMutation();

  const consultarSefaz = async (cnpj: string, ufInformada: string) => {
    const uf = (ufInformada || "PE").toUpperCase();
    if (uf !== "PE") {
      setConsultaSefaz({ estado: "nao_encontrado", uf, mensagem: "a consulta automática da inscrição estadual está disponível para contribuintes de Pernambuco." });
      return;
    }
    setConsultaSefaz({ estado: "consultando", uf });
    try {
      const r = await consultarSefazMutation.mutateAsync({ cnpj, uf });
      if (!r.encontrado) {
        setConsultaSefaz({ estado: "nao_encontrado", uf, mensagem: r.mensagem || "CNPJ sem cadastro de contribuinte do ICMS." });
        return;
      }
      setConsultaSefaz({ estado: "encontrado", uf, cadastros: r.cadastros });
      const principal = r.cadastros.find((c) => c.habilitado) ?? r.cadastros[0];
      if (principal?.inscricaoEstadual) updateImportador("inscricaoEstadual", principal.inscricaoEstadual);
      if (principal && !principal.habilitado) {
        toast.warning(`Inscrição estadual ${principal.inscricaoEstadual} não habilitada na SEFAZ-${uf}.`);
      }
    } catch (e: any) {
      setConsultaSefaz({
        estado: "erro",
        uf,
        mensagem: e?.message || "Falha na consulta.",
        semCertificado: e?.data?.code === "PRECONDITION_FAILED",
      });
    }
  };

  // ===== CONSULTA CNPJ =====
  const buscarCNPJQuery = trpc.cnpj.buscar.useQuery({ cnpj: cnpjBusca.replace(/\D/g, "") }, { enabled: false, retry: false });

  const handleBuscarCNPJ = useCallback(async () => {
    const cnpjClean = cnpjBusca.replace(/\D/g, "");
    if (cnpjClean.length !== 14) {
      toast.error("Informe um CNPJ válido, com 14 dígitos.");
      return;
    }
    setCnpjLoading(true);
    setCnpjStatus("idle");
    try {
      const result = await buscarCNPJQuery.refetch();
      if (result.data) {
        const d = result.data;
        updateImportador("nome", d.razaoSocial);
        updateImportador("cnpj", formatarCNPJ(d.cnpj));
        updateImportador("cnae", d.cnae);
        updateImportador("endereco", d.endereco);
        updateImportador("bairro", d.bairro);
        updateImportador("cep", d.cep);
        updateImportador("municipio", d.municipio);
        updateImportador("uf", d.uf);
        updateImportador("telefone", d.telefone);
        setCnpjStatus("ok");
        toast.success(`Empresa encontrada: ${d.razaoSocial}`);
        // Inscrição estadual e situação cadastral vêm da SEFAZ (a Receita não tem esse dado)
        void consultarSefaz(d.cnpj, d.uf);
      }
    } catch (e: any) {
      setCnpjStatus("error");
      toast.error(e.message || "Não foi possível consultar o CNPJ.");
    } finally {
      setCnpjLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cnpjBusca, buscarCNPJQuery, updateImportador]);

  const handleSelecionarImportador = (imp: any) => {
    updateImportador("nome", imp.razaoSocial);
    updateImportador("cnpj", imp.cnpj);
    updateImportador("inscricaoEstadual", imp.inscricaoEstadual || "");
    updateImportador("cnae", imp.cnae || "");
    updateImportador("endereco", imp.endereco || "");
    updateImportador("bairro", imp.bairro || "");
    updateImportador("cep", imp.cep || "");
    updateImportador("municipio", imp.municipio || "");
    updateImportador("uf", imp.uf || "");
    updateImportador("telefone", imp.telefone || "");
    if (imp.editalDBF) updateICMSCalculo("editalDBF", imp.editalDBF);
    toast.success(`Importador selecionado: ${imp.razaoSocial}`);
  };

  const handleSalvarImportador = () => {
    const dados = formData.importador;
    if (!dados.cnpj || !dados.nome) {
      toast.error("CNPJ e razão social são obrigatórios.");
      return;
    }
    salvarImportadorMutation.mutate({
      cnpj: dados.cnpj.replace(/\D/g, ""),
      razaoSocial: dados.nome,
      nomeFantasia: "",
      inscricaoEstadual: dados.inscricaoEstadual || "",
      cnae: dados.cnae || "",
      endereco: dados.endereco || "",
      bairro: dados.bairro || "",
      cep: dados.cep || "",
      municipio: dados.municipio || "",
      uf: dados.uf || "",
      telefone: dados.telefone || "",
      email: "",
      editalDBF: editalDBFCadastro || "",
    });
  };

  const handleGerarPDF = async () => {
    setGerandoPDF(true);
    try {
      const unico = calculo.diferimento.length === 1 ? calculo.diferimento[0] : undefined;
      const dadosPDF = {
        ...formData,
        icmsCalculo: {
          ...formData.icmsCalculo,
          // 5.5: valor aduaneiro só das adições que constam na guia
          valorCIF: calculo.valorAduaneiroGLME > 0 ? calculo.valorAduaneiroGLME.toFixed(2) : formData.icmsCalculo.valorCIF,
          vt: unico ? unico.valorPartida.toFixed(2) : "",
          vti: unico ? unico.baseCalculo.toFixed(2) : "",
          vf: calculo.totalDiferido.toFixed(2),
          memoria: calculo.memoria,
          memoriaFrente: calculo.memoriaFrente,
        },
      };
      await gerarGLMEPDF(dadosPDF as any);
      if (calculo.avisos.length > 0) toast.warning("Guia gerada. Confira os avisos da seção ICMS antes de apresentá-la.");
      else toast.success("Guia gerada em PDF.");
    } catch (e: any) {
      toast.error(`Erro ao gerar PDF: ${e.message}`);
    } finally {
      setGerandoPDF(false);
    }
  };

  const handleDocumentoTypeChange = (tipo: string) => {
    const tipos = formData.documento.tipo.includes(tipo)
      ? formData.documento.tipo.filter((t) => t !== tipo)
      : [...formData.documento.tipo, tipo];
    updateDocumento("tipo", tipos);
  };

  const tributadas = formData.adicoesTributadas ?? [];
  const icms = formData.icmsCalculo;
  // Refeito a cada alteração do formulário (inclusive o valor aduaneiro da seção ICMS)
  const calculo = useMemo(() => calcularFormulario(formData), [formData]);

  const camposEmpresa = (
    dados: typeof formData.importador,
    atualizar: (campo: string, valor: string) => void,
    prefixo: string,
  ) => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
      <Campo rotulo="Razão social" htmlFor={`${prefixo}-nome`} className="sm:col-span-2 lg:col-span-6">
        <Input id={`${prefixo}-nome`} value={dados.nome} onChange={(e) => atualizar("nome", e.target.value)} />
      </Campo>
      <Campo rotulo="CNPJ / CPF" htmlFor={`${prefixo}-cnpj`} className="lg:col-span-2">
        <Input id={`${prefixo}-cnpj`} inputMode="numeric" value={dados.cnpj} onChange={(e) => atualizar("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
      </Campo>
      <Campo rotulo="Inscrição estadual" htmlFor={`${prefixo}-ie`} className="lg:col-span-2">
        <Input id={`${prefixo}-ie`} value={dados.inscricaoEstadual} onChange={(e) => atualizar("inscricaoEstadual", e.target.value)} />
      </Campo>
      <Campo rotulo="CNAE" htmlFor={`${prefixo}-cnae`} className="lg:col-span-2">
        <Input id={`${prefixo}-cnae`} value={dados.cnae} onChange={(e) => atualizar("cnae", e.target.value)} placeholder="0000-0/00" />
      </Campo>
      <Campo rotulo="Endereço" htmlFor={`${prefixo}-endereco`} className="sm:col-span-2 lg:col-span-4">
        <Input id={`${prefixo}-endereco`} value={dados.endereco} onChange={(e) => atualizar("endereco", e.target.value)} />
      </Campo>
      <Campo rotulo="Bairro" htmlFor={`${prefixo}-bairro`} className="lg:col-span-2">
        <Input id={`${prefixo}-bairro`} value={dados.bairro} onChange={(e) => atualizar("bairro", e.target.value)} />
      </Campo>
      <Campo rotulo="CEP" htmlFor={`${prefixo}-cep`} className="lg:col-span-2">
        <Input id={`${prefixo}-cep`} inputMode="numeric" value={dados.cep} onChange={(e) => atualizar("cep", e.target.value)} placeholder="00000-000" />
      </Campo>
      <Campo rotulo="Município" htmlFor={`${prefixo}-municipio`} className="lg:col-span-2">
        <Input id={`${prefixo}-municipio`} value={dados.municipio} onChange={(e) => atualizar("municipio", e.target.value)} />
      </Campo>
      <Campo rotulo="UF" htmlFor={`${prefixo}-uf`} className="lg:col-span-1">
        <SelectUF id={`${prefixo}-uf`} value={dados.uf} onChange={(v) => atualizar("uf", v)} placeholder="UF" />
      </Campo>
      <Campo rotulo="Telefone" htmlFor={`${prefixo}-telefone`} className="lg:col-span-1">
        <Input id={`${prefixo}-telefone`} inputMode="tel" value={dados.telefone} onChange={(e) => atualizar("telefone", e.target.value)} />
      </Campo>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* ===== Cabeçalho fixo com navegação por seções ===== */}
      <header ref={cabecalhoRef} className="sticky top-0 z-40 border-b bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/75">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
          <a href="#topo" className="flex min-w-0 items-center gap-3">
            <img src="/logo-bigfish.png" alt="Bigfish" className="size-10 shrink-0 rounded-xl" />
            <div className="min-w-0 leading-tight">
              <p className="font-semibold tracking-tight text-brand-navy">GLME</p>
              <p className="truncate text-xs text-muted-foreground">Guia de Liberação de Mercadoria Estrangeira</p>
            </div>
          </a>
          <div className="flex items-center gap-1">
            <span className="mr-2 hidden text-sm text-muted-foreground md:inline">{user?.name || user?.username}</span>
            {isAdmin && (
              <Button variant="ghost" size="icon" aria-label="Usuários" title="Usuários" onClick={() => navigate("/usuarios")}>
                <Users />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sair"
              title="Sair"
              onClick={async () => { await logout(); navigate("/login"); }}
            >
              <LogOut />
            </Button>
          </div>
        </div>
        <nav className="mx-auto max-w-5xl overflow-x-auto px-4 [scrollbar-width:none]" aria-label="Seções do formulário">
          <ul className="flex gap-1 pb-2">
            {SECOES.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  data-secao-nav={s.id}
                  aria-current={secaoAtiva === s.id ? "location" : undefined}
                  className={cn(
                    "block whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors",
                    secaoAtiva === s.id ? "bg-brand-navy text-white" : "text-muted-foreground hover:bg-secondary hover:text-brand-navy",
                  )}
                >
                  {s.rotulo}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div ref={acoesRef} className="mx-auto max-w-5xl px-4 pb-3">
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
              <BlocoAcao icone={Upload} titulo="Importar DI / DUIMP" rotuloCurto="Importar" subtitulo="XML da DI ou PDF da DUIMP" variante="principal" carregando={importando} onClick={() => setShowImportar(true)} />
              <BlocoAcao icone={FileDown} titulo="Gerar guia em PDF" rotuloCurto="Gerar PDF" subtitulo="Formulário oficial" carregando={gerandoPDF} onClick={handleGerarPDF} />
              <BlocoAcao icone={Building2} titulo="Importadores" rotuloCurto="Cadastro" subtitulo="Cadastro e edital DBF" onClick={() => setShowCadastro(true)} />
              <BlocoAcao icone={Eraser} titulo="Limpar formulário" rotuloCurto="Limpar" subtitulo="Começar uma nova guia" variante="perigo" onClick={() => setConfirmarLimpeza(true)} />
            </div>
          </div>
      </header>

      <main id="topo" className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:py-8">
        {/* ===== Introdução e ações ===== */}
        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-brand-navy sm:text-3xl">Nova guia GLME</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Importe a declaração, confira os dados e gere a guia oficial. O rascunho fica salvo neste navegador.
            </p>
          </div>
        </div>

        {/* ===== UF de recolhimento ===== */}
        <Secao id="uf" icone={MapPin} titulo="UF de recolhimento" descricao="Secretaria da Fazenda da UF a que se destina o ICMS.">
          <Campo rotulo="UF" htmlFor="secretaria-uf" className="max-w-xs">
            <SelectUF id="secretaria-uf" value={formData.secretariaUF} onChange={(v) => updateField("secretariaUF", v)} placeholder="Selecione a UF" />
          </Campo>
        </Secao>

        {/* ===== Importador ===== */}
        <Secao
          id="importador"
          icone={Building2}
          titulo="Importador"
          descricao="Consulte pelo CNPJ ou use um importador cadastrado."
          acoes={importadoresBD.length > 0 && (
            <Select onValueChange={(id) => {
              const imp = importadoresBD.find((i: any) => String(i.id) === id);
              if (imp) handleSelecionarImportador(imp);
            }}>
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue placeholder="Usar importador cadastrado" />
              </SelectTrigger>
              <SelectContent>
                {importadoresBD.map((imp: any) => (
                  <SelectItem key={imp.id} value={String(imp.id)}>{imp.razaoSocial}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        >
          <div className="mb-5 flex flex-col gap-2 rounded-xl bg-secondary/60 p-3 sm:flex-row sm:items-end">
            <Campo rotulo="Consultar CNPJ na Receita Federal e na SEFAZ-PE" htmlFor="cnpj-busca" className="flex-1">
              <Input
                id="cnpj-busca"
                inputMode="numeric"
                placeholder="00.000.000/0000-00"
                value={cnpjBusca}
                onChange={(e) => setCnpjBusca(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleBuscarCNPJ()}
                className="bg-card"
              />
            </Campo>
            <Button onClick={handleBuscarCNPJ} disabled={cnpjLoading} className="sm:w-auto">
              {cnpjLoading ? <Loader2 className="animate-spin" /> : <Search />}
              Consultar
            </Button>
          </div>
          {cnpjStatus === "ok" && (
            <p className="-mt-3 mb-4 flex items-center gap-1.5 text-xs text-[#00707d]">
              <CheckCircle2 className="size-3.5" /> Dados preenchidos com a consulta do CNPJ.
            </p>
          )}
          {consultaSefaz.estado !== "inativo" && (
            <div className="mb-4">
              <SituacaoCadastral
                consulta={consultaSefaz}
                onRepetir={() => consultarSefaz(formData.importador.cnpj.replace(/\D/g, ""), formData.importador.uf)}
              />
            </div>
          )}
          {camposEmpresa(formData.importador, updateImportador, "importador")}
        </Secao>

        {/* ===== Adquirente ===== */}
        <Secao
          id="adquirente"
          icone={UserRound}
          titulo="Adquirente / destinatário"
          descricao="Informe quando a mercadoria se destinar a terceiro."
          acoes={
            <label htmlFor="adquirente-igual" className="flex cursor-pointer items-center gap-2.5 rounded-full border px-3 py-1.5 text-sm">
              <Switch id="adquirente-igual" checked={adquirenteIgualImportador} onCheckedChange={setAdquirenteIgualImportador} />
              Mesmo do importador
            </label>
          }
        >
          {adquirenteIgualImportador ? (
            <p className="rounded-xl bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">
              Adquirente igual ao importador: os campos do adquirente ficam em branco na guia.
            </p>
          ) : (
            camposEmpresa(formData.adquirente, updateAdquirente, "adquirente")
          )}
        </Secao>

        {/* ===== Declaração ===== */}
        <Secao id="declaracao" icone={FileText} titulo="Declaração de importação" descricao="Preenchida automaticamente ao importar a DI ou a DUIMP.">
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-[13px] font-medium text-muted-foreground">Tipo de declaração</p>
              <div className="flex flex-wrap gap-2">
                {TIPOS_DOCUMENTO.map((tipo) => {
                  const marcado = formData.documento.tipo.includes(tipo.value);
                  return (
                    <button
                      key={tipo.value}
                      type="button"
                      aria-pressed={marcado}
                      title={tipo.label}
                      onClick={() => handleDocumentoTypeChange(tipo.value)}
                      className={cn(
                        "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                        marcado ? "border-brand-navy bg-brand-navy text-white" : "bg-card text-muted-foreground hover:border-brand-sky/60 hover:text-brand-navy",
                      )}
                    >
                      {tipo.value}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Campo rotulo="Número da declaração" htmlFor="doc-numero">
                <Input id="doc-numero" value={formData.documento.numero} onChange={(e) => updateDocumento("numero", e.target.value)} />
              </Campo>
              <Campo rotulo="Data de registro" htmlFor="doc-data">
                <Input id="doc-data" type="date" value={formData.documento.dataRegistro} onChange={(e) => updateDocumento("dataRegistro", e.target.value)} />
              </Campo>
              <Campo rotulo="Valor aduaneiro (VMLD) · R$" htmlFor="doc-valor">
                <Input
                  id="doc-valor"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={formData.documento.valorCIF}
                  onChange={(e) => {
                    updateDocumento("valorCIF", e.target.value);
                    updateField("valorCIFAdicion", e.target.value);
                  }}
                  placeholder="0,00"
                />
              </Campo>
              <Campo rotulo="Recinto alfandegado" htmlFor="doc-recinto" className="sm:col-span-2">
                <Input id="doc-recinto" value={formData.documento.nomeRecinto || ""} onChange={(e) => updateDocumento("nomeRecinto", e.target.value)} />
              </Campo>
              <Campo rotulo="Código do recinto" htmlFor="doc-cod-recinto">
                <Input id="doc-cod-recinto" value={formData.documento.codRecinto} disabled className="bg-secondary/60" />
              </Campo>
              <Campo rotulo="UF de desembaraço" htmlFor="doc-uf">
                <SelectUF id="doc-uf" value={formData.documento.ufDesembaraco} onChange={(v) => updateDocumento("ufDesembaraco", v)} />
              </Campo>
            </div>
          </div>
        </Secao>

        {/* ===== Adições / itens ===== */}
        <Secao
          id="adicoes"
          icone={Boxes}
          titulo="Adições / itens"
          descricao="Regime e alíquota consultados pela NCM de cada adição."
          acoes={
            <Button variant="outline" onClick={addProduto}>
              <Plus /> Nova adição
            </Button>
          }
        >
          <div className="space-y-4">
            {formData.produtos.map((produto, index) => (
              <article key={index} className="rounded-xl border bg-background/40 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-brand-navy">Adição {produto.adicao || index + 1}</h3>
                  {formData.produtos.length > 1 && (
                    <Button variant="ghost" size="icon-sm" aria-label={`Remover adição ${produto.adicao || index + 1}`} className="text-muted-foreground hover:text-destructive" onClick={() => removeProduto(index)}>
                      <Trash2 />
                    </Button>
                  )}
                </div>
                <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Campo rotulo="Nº da adição" htmlFor={`ad-${index}-numero`}>
                    <Input id={`ad-${index}-numero`} inputMode="numeric" value={produto.adicao} onChange={(e) => updateProduto(index, "adicao", e.target.value)} />
                  </Campo>
                  <Campo rotulo="NCM" htmlFor={`ad-${index}-ncm`}>
                    <Input
                      id={`ad-${index}-ncm`}
                      inputMode="numeric"
                      value={produto.classeTarifaria}
                      onChange={(e) => {
                        updateProduto(index, "classeTarifaria", e.target.value);
                        updateProduto(index, "ncm", e.target.value);
                      }}
                      placeholder="0000.00.00"
                    />
                  </Campo>
                  <Campo rotulo="Tratamento tributário" htmlFor={`ad-${index}-tratamento`}>
                    <Select value={produto.tratamento} onValueChange={(v) => updateProduto(index, "tratamento", v)}>
                      <SelectTrigger id={`ad-${index}-tratamento`} className="w-full">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {TRATAMENTOS_TRIBUTARIOS.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Campo>
                </div>
                <div className="mb-4">
                  <ValoresAdicao
                    id={`ad-${index}-valores`}
                    valores={produto.valores}
                    onChange={(campo, valor) => updateProduto(index, `valores.${campo}`, valor)}
                  />
                </div>
                <AdicaoFiscal
                  ncm={produto.classeTarifaria || produto.ncm}
                  itens={produto.itens}
                  descricao={produto.descricao}
                  naGLME
                  calculo={calculo.produtos[index]}
                />
              </article>
            ))}

            {tributadas.length > 0 && (
              <div className="space-y-3 pt-2">
                <div>
                  <h3 className="font-semibold text-brand-navy">Tributação normal — fora da GLME ({tributadas.length})</h3>
                  <p className="text-sm text-muted-foreground">NCM na lista negativa do Edital 060/2025: recolhimento integral do ICMS.</p>
                </div>
                {tributadas.map((ad, i) => (
                  <article key={`${ad.adicao}-${i}`} className="rounded-xl border border-amber-200/70 bg-amber-50/30 p-4">
                    <h4 className="mb-3 font-semibold text-brand-navy">
                      Adição {ad.adicao} <span className="font-normal text-muted-foreground">· NCM {ad.ncm}</span>
                    </h4>
                    <div className="mb-4">
                      <ValoresAdicao
                        id={`trib-${i}-valores`}
                        valores={ad.valores}
                        onChange={(campo, valor) => updateTributada(i, `valores.${campo}`, valor)}
                      />
                    </div>
                    <AdicaoFiscal ncm={ad.ncm} itens={ad.itens} descricao={ad.descricao} naGLME={false} calculo={calculo.tributadas[i]} />
                  </article>
                ))}
              </div>
            )}
          </div>
        </Secao>

        {/* ===== ICMS ===== */}
        <Secao id="icms" icone={Calculator} titulo="ICMS — fundamento legal e cálculo" descricao="Base: (valor aduaneiro + tributos + despesas aduaneiras) ÷ (1 − alíquota) × alíquota, por alíquota.">
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,220px)_1fr] sm:items-end">
              <Campo rotulo="Edital DBF" htmlFor="edital-dbf">
                <Input id="edital-dbf" value={formData.icmsCalculo.editalDBF} onChange={(e) => updateICMSCalculo("editalDBF", e.target.value)} placeholder="Ex.: 001/2024" />
              </Campo>
              {importadoresBD.some((i: any) => i.editalDBF) && (
                <Select onValueChange={(id) => {
                  const imp = importadoresBD.find((i: any) => String(i.id) === id);
                  if (imp?.editalDBF) updateICMSCalculo("editalDBF", imp.editalDBF);
                }}>
                  <SelectTrigger className="w-full sm:w-72">
                    <SelectValue placeholder="Usar edital de um importador" />
                  </SelectTrigger>
                  <SelectContent>
                    {importadoresBD.filter((i: any) => i.editalDBF).map((imp: any) => (
                      <SelectItem key={imp.id} value={String(imp.id)}>{imp.razaoSocial} — {imp.editalDBF}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-[13px] font-medium text-muted-foreground">Fundamento legal (campo 5.4 da guia)</p>
              <p className="rounded-xl bg-brand-sky-soft/60 px-4 py-3 text-sm leading-relaxed text-foreground">
                ICMS diferido nos termos da Lei nº 13.942/2009, art. 2º-A, I; § 1º; Decreto 44.650/2017, Anexo 8, art. 49, Anexo 27, art. 1º, II;
                Credenciamento de estímulo à atividade portuária – Edital DBF nº.{" "}
                <strong className="rounded bg-card px-1.5 py-0.5 text-brand-navy">{formData.icmsCalculo.editalDBF || "XXX/XXXX"}</strong>; Mercadoria não prevista na Lista de
                produtos impedidos para utilização do Programa de Estímulo à Atividade Portuária - PEAP - Anexo 27 do Decreto nº 44.650/2017.
              </p>
            </div>

            <Campo rotulo="Texto complementar (impresso abaixo do fundamento legal)" htmlFor="texto-adicional">
              <Textarea
                id="texto-adicional"
                className="min-h-[88px]"
                value={formData.icmsCalculo.textoAdicional || ""}
                onChange={(e) => updateICMSCalculo("textoAdicional", e.target.value)}
              />
            </Campo>

            <div className="space-y-3">
              <div>
                <p className="text-[13px] font-medium text-muted-foreground">Despesas aduaneiras da declaração · R$</p>
                <p className="text-xs text-muted-foreground">
                  Rateadas entre as adições pelo valor aduaneiro; o AFRMM, pelo peso líquido (Ajuste SINIEF 32/21).
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <CampoValor id="icms-siscomex" rotulo="Taxa Siscomex" valor={icms.taxaSiscomex} onChange={(v) => updateICMSCalculo("taxaSiscomex", v)} />
                <CampoValor id="icms-outras" rotulo="Taxas de anuentes e outras" valor={icms.outrasDespesas} onChange={(v) => updateICMSCalculo("outrasDespesas", v)} />
                <CampoValor id="icms-iof" rotulo="IOF-câmbio" valor={icms.iofCambio} onChange={(v) => updateICMSCalculo("iofCambio", v)} />
                <CampoValor id="icms-afrmm" rotulo="AFRMM" valor={icms.afrmm} onChange={(v) => updateICMSCalculo("afrmm", v)} />
              </div>
              <label htmlFor="icms-incluir-afrmm" className="flex w-fit cursor-pointer items-center gap-2.5 text-sm">
                <Switch id="icms-incluir-afrmm" checked={Boolean(icms.incluirAFRMM)} onCheckedChange={(v) => updateICMSCalculo("incluirAFRMM", v)} />
                Incluir o AFRMM na base de cálculo
              </label>
              {(icms.outrasReceitas?.length ?? 0) > 0 && (
                <p className="rounded-xl bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
                  A DI traz outros pagamentos:{" "}
                  {icms.outrasReceitas!.map((r) => `receita ${r.codigo} (R$ ${formatarMoeda(paraNumero(r.valor))})`).join(", ")}.
                  Some em “Taxas de anuentes e outras” o que for devido à aduana.
                </p>
              )}
            </div>

            {calculo.modo === "totais" ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Cálculo pelos totais da declaração. Para calcular por alíquota, informe os valores de cada adição em Adições / itens.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoValor id="icms-cif" rotulo="Valor aduaneiro" valor={icms.valorCIF} onChange={(v) => updateICMSCalculo("valorCIF", v)} />
                  <CampoValor id="icms-impostos" rotulo="Tributos federais (II + IPI + PIS + COFINS)" valor={icms.impostos} onChange={(v) => updateICMSCalculo("impostos", v)} />
                </div>
              </div>
            ) : (
              <p className="flex items-center gap-2 rounded-xl bg-brand-sky-soft/60 px-4 py-3 text-sm">
                <CheckCircle2 className="size-4 shrink-0 text-brand-navy" />
                Calculado adição por adição, com os valores informados em Adições / itens.
              </p>
            )}

            {calculo.avisos.map((aviso) => (
              <p key={aviso} className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{aviso}</span>
              </p>
            ))}

            {calculo.diferimento.length > 0 && (
              <div className="space-y-3">
                {calculo.diferimento.map((g) => (
                  <dl key={g.aliquota} className="divide-y overflow-hidden rounded-xl border text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-secondary/60 px-4 py-2.5">
                      <dt className="font-semibold text-brand-navy">Alíquota {formatarAliquota(g.aliquota)}</dt>
                      <dd className="text-xs text-muted-foreground">
                        {g.adicoes.length === 0 ? "Totais da declaração" : `${g.adicoes.length === 1 ? "Adição" : "Adições"} ${g.adicoes.join(", ")}`}
                      </dd>
                    </div>
                    <LinhaCalculo
                      rotulo="VT · valor aduaneiro + tributos + despesas"
                      detalhe={`${formatarMoeda(g.valorAduaneiro)} + ${formatarMoeda(g.tributosFederais)} + ${formatarMoeda(g.despesas)}`}
                      valor={g.valorPartida}
                    />
                    <LinhaCalculo rotulo={`VTI · VT ÷ ${formatarDivisor(g.divisor)}`} valor={g.baseCalculo} />
                    <LinhaCalculo rotulo={`ICMS (VF) · VTI × ${formatarAliquota(g.aliquota)}`} valor={g.icms} destaque={calculo.diferimento.length === 1} />
                  </dl>
                ))}
                {calculo.diferimento.length > 1 && (
                  <div className="flex items-center justify-between gap-4 rounded-xl bg-brand-navy px-4 py-3.5 text-white">
                    <span className="font-medium">ICMS diferido total</span>
                    <span className="whitespace-nowrap text-lg font-semibold tabular-nums">R$ {formatarMoeda(calculo.totalDiferido)}</span>
                  </div>
                )}
              </div>
            )}

            {calculo.totalTributacaoNormal > 0 && (
              <p className="flex items-center justify-between gap-4 rounded-xl border border-amber-200/70 bg-amber-50/40 px-4 py-3 text-sm">
                <span>ICMS a recolher — tributação normal, fora da guia</span>
                <span className="whitespace-nowrap font-semibold tabular-nums">R$ {formatarMoeda(calculo.totalTributacaoNormal)}</span>
              </p>
            )}

            {calculo.memoria.length > 0 && (
              <div>
                <p className="mb-1.5 text-[13px] font-medium text-muted-foreground">Memória de cálculo impressa na guia (campo 5.4)</p>
                <div className="space-y-1 rounded-xl border bg-background/60 px-4 py-3 text-xs leading-relaxed">
                  {calculo.memoria.map((l, i) => (
                    <p key={i} className={cn(l.destaque && "font-semibold text-brand-navy")}>{l.texto}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Secao>

        <footer className="pb-4 text-center text-xs leading-relaxed text-muted-foreground">
          Desenvolvido por: Brados Consultoria e Tecnologia Ltda
          <span className="hidden sm:inline"> · </span><br className="sm:hidden" />
          Todos os direitos reservados · 2023 - 2026
        </footer>
      </main>

      {/* ===== Importar DI / DUIMP ===== */}
      <ImportarDeclaracaoDialog
        open={showImportar}
        onOpenChange={setShowImportar}
        onArquivo={handleImportarArquivo}
        processando={importando}
        onConsultarAPI={(dados) => consultarDuimpAPIMutation.mutate(dados)}
        consultandoAPI={consultarDuimpAPIMutation.isPending}
      />

      {/* ===== Importadores ===== */}
      <Dialog open={showCadastro} onOpenChange={setShowCadastro}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-brand-navy">Importadores</DialogTitle>
            <DialogDescription>Use um importador cadastrado ou salve o importador atual com o edital DBF.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            {importadoresBD.length > 0 && (
              <ul className="max-h-64 divide-y overflow-y-auto rounded-xl border">
                {importadoresBD.map((imp: any) => (
                  <li key={imp.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{imp.razaoSocial}</p>
                      <p className="tabular-nums text-xs text-muted-foreground">
                        {imp.cnpj}
                        {imp.editalDBF && <span className="ml-2 text-brand-sky">Edital {imp.editalDBF}</span>}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="outline" onClick={() => { handleSelecionarImportador(imp); setShowCadastro(false); }}>Usar</Button>
                      <Button size="icon-sm" variant="ghost" aria-label={`Excluir ${imp.razaoSocial}`} className="text-muted-foreground hover:text-destructive" onClick={() => excluirImportadorMutation.mutate({ id: imp.id })}>
                        <Trash2 />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-3 rounded-xl bg-secondary/60 p-4">
              <p className="text-sm font-medium text-brand-navy">Salvar importador atual</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <Campo rotulo="Consultar CNPJ" htmlFor="cadastro-cnpj" className="flex-1">
                  <Input
                    id="cadastro-cnpj"
                    inputMode="numeric"
                    placeholder="00.000.000/0000-00"
                    value={cnpjBusca}
                    onChange={(e) => setCnpjBusca(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleBuscarCNPJ()}
                    className="bg-card"
                  />
                </Campo>
                <Button variant="outline" onClick={handleBuscarCNPJ} disabled={cnpjLoading} className="bg-card">
                  {cnpjLoading ? <Loader2 className="animate-spin" /> : <Search />}
                  Consultar
                </Button>
              </div>
              {formData.importador.nome && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Importador atual: </span>
                  {formData.importador.nome}
                </p>
              )}
              <Campo rotulo="Edital DBF do importador" htmlFor="edital-cadastro">
                <Input id="edital-cadastro" placeholder="Ex.: 001/2024" value={editalDBFCadastro} onChange={(e) => setEditalDBFCadastro(e.target.value)} className="bg-card" />
              </Campo>
              <Button onClick={handleSalvarImportador} disabled={salvarImportadorMutation.isPending} className="w-full">
                {salvarImportadorMutation.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                Salvar no cadastro
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Confirmação de limpeza ===== */}
      <AlertDialog open={confirmarLimpeza} onOpenChange={setConfirmarLimpeza}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar o formulário?</AlertDialogTitle>
            <AlertDialogDescription>Todos os dados preenchidos nesta guia serão apagados deste navegador.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => { resetForm(); setAdquirenteIgualImportador(false); }}>
              Limpar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
