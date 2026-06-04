import { useState, useRef, useCallback } from "react";
import { gerarGLMEPDF } from "@/lib/glmePDF";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useGLMEForm } from "@/hooks/useGLMEForm";
import {
  ESTADOS_BRASIL,
  TIPOS_DOCUMENTO,
  TRATAMENTOS_TRIBUTARIOS,
} from "@/lib/formData";
import {
  Plus,
  Trash2,
  Save,
  Search,
  Building2,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileDown,
  FileSearch2,
  Link,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { ncmNaListaNegativa } from "@/lib/listaNegativa";
import { verificarAliquotaNCM, formatarMoeda } from "@/lib/aliquotasICMS";

export default function Home() {
  const {
    formData,
    updateField,
    updateImportador,
    updateAdquirente,
    updateDocumento,
    updateProduto,
    updateICMSCalculo,
    addProduto,
    removeProduto,
    resetForm,
  } = useGLMEForm();

  const [gerandoPDF, setGerandoPDF] = useState(false);
  const diFileInputRef = useRef<HTMLInputElement>(null);

  // ===== Adquirente igual ao Importador =====
  const [adquirenteIgualImportador, setAdquirenteIgualImportador] = useState(false);

  // ===== CNPJ =====
  const [cnpjBusca, setCnpjBusca] = useState("");
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjStatus, setCnpjStatus] = useState<"idle" | "ok" | "error">("idle");

  // ===== CADASTRO DE IMPORTADORES =====
  const [showCadastro, setShowCadastro] = useState(false);
  const [editalDBFCadastro, setEditalDBFCadastro] = useState("");

  // ===== RECINTOS =====
  const { data: recintos = [], isLoading: recintoLoading } = trpc.recintos.listar.useQuery();

  // ===== IMPORTADORES DO BD =====
  const { data: importadoresBD = [], refetch: refetchImportadores } = trpc.importadores.listar.useQuery();
  const salvarImportadorMutation = trpc.importadores.salvar.useMutation({
    onSuccess: () => {
      toast.success("Importador salvo com sucesso!");
      refetchImportadores();
      setShowCadastro(false);
    },
    onError: (e) => toast.error(`Erro ao salvar: ${e.message}`),
  });
  const excluirImportadorMutation = trpc.importadores.excluir.useMutation({
    onSuccess: () => {
      toast.success("Importador excluído!");
      refetchImportadores();
    },
    onError: (e) => toast.error(`Erro ao excluir: ${e.message}`),
  });

  // ===== IMPORTAÇÃO DUIMP =====
  const [showDuimpModal, setShowDuimpModal] = useState(false);
  const [duimpModo, setDuimpModo] = useState<"pdf" | "api">("pdf");
  const [duimpNumero, setDuimpNumero] = useState("");
  const [duimpVersao, setDuimpVersao] = useState("0");
  const [duimpClientId, setDuimpClientId] = useState("");
  const [duimpClientSecret, setDuimpClientSecret] = useState("");
  const duimpFileInputRef = useRef<HTMLInputElement>(null);

  const parsearDuimpPDFMutation = trpc.duimp.parsearPDF.useMutation({
    onSuccess: (result: any) => {
      if (!result.sucesso || !result.dados) {
        toast.error(result.erro || "Erro ao processar PDF da DUIMP.");
        return;
      }
      preencherFormularioDuimp(result.dados);
    },
    onError: (e: any) => toast.error(`Erro ao processar PDF: ${e.message}`),
  });

  const consultarDuimpAPIMutation = trpc.duimp.consultarAPI.useMutation({
    onSuccess: (result: any) => {
      if (!result.sucesso || !result.dados) {
        toast.error(result.erro || "Erro ao consultar DUIMP na API.");
        return;
      }
      preencherFormularioDuimp(result.dados);
    },
    onError: (e: any) => toast.error(`Erro na API: ${e.message}`),
  });

  const preencherFormularioDuimp = (dados: any) => {
    let preenchidos = 0;

    // === IMPORTADOR ===
    if (dados.importadorNome) { updateImportador("nome", dados.importadorNome); preenchidos++; }
    if (dados.importadorCnpj) { updateImportador("cnpj", dados.importadorCnpj); preenchidos++; }
    if (dados.importadorEndereco) { updateImportador("endereco", dados.importadorEndereco); preenchidos++; }
    if (dados.importadorBairro) { updateImportador("bairro", dados.importadorBairro); preenchidos++; }
    if (dados.importadorCep) { updateImportador("cep", dados.importadorCep); preenchidos++; }
    if (dados.importadorMunicipio) { updateImportador("municipio", dados.importadorMunicipio); preenchidos++; }
    if (dados.importadorUf) { updateImportador("uf", dados.importadorUf); preenchidos++; }
    if (dados.adquirenteNome) { updateAdquirente("nome", dados.adquirenteNome); preenchidos++; }
    if (dados.adquirenteCnpj) { updateAdquirente("cnpj", dados.adquirenteCnpj); preenchidos++; }

    // === DADOS DA DECLARAÇÃO (guia 3) ===
    // Tipo de documento: marcar DUIMP
    const tiposAtuais: string[] = formData.documento.tipo || [];
    if (!tiposAtuais.includes("DUIMP")) {
      updateDocumento("tipo", [...tiposAtuais, "DUIMP"]);
      preenchidos++;
    }
    // 4.1 Número = número da DUIMP (ex: 26BR0000680227-4)
    if (dados.numeroDuimp) { updateDocumento("numero", dados.numeroDuimp); preenchidos++; }
    // 4.2 Data do Registro (DD/MM/YYYY → YYYY-MM-DD para input[type=date])
    if (dados.dataRegistro) {
      const [dd, mm, yyyy] = dados.dataRegistro.split("/");
      if (dd && mm && yyyy) { updateDocumento("dataRegistro", `${yyyy}-${mm}-${dd}`); preenchidos++; }
    }
    // 4.3 Valor CIF (VMLD) = Valor Aduaneiro da DUIMP
    if (dados.valorAduaneiro) {
      updateDocumento("valorCIF", dados.valorAduaneiro);
      updateField("valorCIFAdicion", dados.valorAduaneiro);
      updateICMSCalculo("valorCIF", dados.valorAduaneiro);
      preenchidos++;
    }
    // 4.4 Recinto Alfandegado = nome após o código de 7 dígitos
    if (dados.recintoNome) { updateDocumento("nomeRecinto", dados.recintoNome); preenchidos++; }
    // 4.5 Código do Recinto = 7 dígitos antes do nome
    if (dados.recintoCodigoRaw) {
      updateDocumento("codRecinto", dados.recintoCodigoRaw);
      preenchidos++;
      // 4.6 UF Desembaraço: buscar no cadastro de recintos pelo código
      const recintoEncontrado = recintos.find((r: any) => {
        const codigoDB = r.codigo.replace(/[.\-]/g, "");
        return codigoDB === dados.recintoCodigoRaw || codigoDB.startsWith(dados.recintoCodigoRaw.slice(0, 6));
      });
      if (recintoEncontrado?.uf) { updateDocumento("ufDesembaraco", recintoEncontrado.uf); preenchidos++; }
    }

    // === GUIA 5 — ICMS ===
    // Impostos = Soma do Recolhimento (II + IPI + PIS + COFINS + TAXA SISCOMEX)
    if (dados.impostosTotal && parseFloat(dados.impostosTotal) > 0) {
      updateICMSCalculo("impostos", dados.impostosTotal);
      preenchidos++;
    }

    // === ADIÇÕES (guia 4) — NCMs já consolidadas pelo parser ===
    if (dados.adicoes?.length > 0) {
      const adicoesNormais: any[] = [];
      const textoLinhasNegativas: string[] = [];

      dados.adicoes.forEach((ad: any) => {
        if (ncmNaListaNegativa(ad.ncm || "")) {
          const ncmLimpo = (ad.ncm || "").replace(/[^0-9]/g, "");
          const ncm4dig = ncmLimpo.slice(0, 4);
          const aliquotaInfo = verificarAliquotaNCM(ncm4dig);
          const aliquotaPct = aliquotaInfo ? aliquotaInfo.aliquota : 20.5;
          textoLinhasNegativas.push(
            `ADIÇÃO ${ad.numero} - NCM ${ad.ncm} - TRIBUTAÇÃO NORMAL - ALIQUOTA ${aliquotaPct}%\nA ADIÇÃO ${ad.numero} É RECOLHIMENTO INTEGRAL, POR ISSO ELA NÃO CONSTA NA GLME.`
          );
        } else {
          adicoesNormais.push(ad);
        }
      });

      const numNormais = adicoesNormais.length;
      const numProdutosAtual = formData.produtos.length;
      if (numNormais > numProdutosAtual) {
        for (let i = numProdutosAtual; i < numNormais; i++) addProduto();
      }
      adicoesNormais.forEach((ad: any, idx: number) => {
        updateProduto(idx, "adicao", ad.numero || "");
        if (ad.ncm) { updateProduto(idx, "ncm", ad.ncm); updateProduto(idx, "classeTarifaria", ad.ncm); }
        updateProduto(idx, "tratamento", "3");
        if (ad.descricao) updateProduto(idx, "descricao", ad.descricao);
        if (ad.baseCalculo) updateProduto(idx, "valorAduaneiro", ad.baseCalculo);
        preenchidos++;
      });

      if (textoLinhasNegativas.length > 0) {
        const textoAtual = (formData.icmsCalculo as any).textoAdicional || "";
        const novoTexto = textoAtual ? textoAtual + "\n\n" + textoLinhasNegativas.join("\n\n") : textoLinhasNegativas.join("\n\n");
        updateICMSCalculo("textoAdicional" as any, novoTexto);
        toast.info(`${textoLinhasNegativas.length} adição(ões) da lista negativa registrada(s) na guia 5.`);
      }
    }

    setShowDuimpModal(false);
    if (preenchidos > 0) {
      toast.success(`DUIMP importada! ${preenchidos} campos preenchidos.`);
    } else {
      toast.warning("DUIMP processada, mas poucos campos foram reconhecidos. Verifique o arquivo.");
    }
  };

  const handleImportarDuimpPDF = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Selecione um arquivo PDF do extrato da DUIMP.");
      if (duimpFileInputRef.current) duimpFileInputRef.current.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      parsearDuimpPDFMutation.mutate({ pdfBase64: base64 });
    };
    reader.readAsDataURL(file);
    if (duimpFileInputRef.current) duimpFileInputRef.current.value = "";
  };

  // ===== PARSER DI XML =====
  const parsearXMLMutation = trpc.di.parsearXML.useMutation({
    onSuccess: async (data: any) => {
      let preenchidos = 0;

      // ===== IMPORTADOR: 1º cadastro interno → 2º BrasilAPI → 3º dados do XML =====
      const cnpjRaw = data.importador?.cnpj?.replace(/\D/g, "");
      if (cnpjRaw && cnpjRaw.length === 14) {
        setCnpjBusca(cnpjRaw);
        // 1º: verificar cadastro interno de importadores
        let usouCadastroInterno = false;
        try {
          const respInterno = await fetch(`/api/trpc/importadores.buscarPorCNPJ?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: { cnpj: cnpjRaw } } }))}`, { credentials: "include" });
          const jsonInterno = await respInterno.json();
          const interno = jsonInterno?.[0]?.result?.data?.json ?? jsonInterno?.[0]?.result?.data ?? jsonInterno?.result?.data;
          if (interno?.razaoSocial) {
            updateImportador("nome", interno.razaoSocial);
            updateImportador("cnpj", cnpjRaw.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5"));
            if (interno.inscricaoEstadual) updateImportador("inscricaoEstadual", interno.inscricaoEstadual);
            if (interno.cnae) updateImportador("cnae", interno.cnae);
            if (interno.endereco) updateImportador("endereco", interno.endereco);
            if (interno.bairro) updateImportador("bairro", interno.bairro);
            if (interno.cep) updateImportador("cep", interno.cep);
            if (interno.municipio) updateImportador("municipio", interno.municipio);
            if (interno.uf) updateImportador("uf", interno.uf);
            if (interno.telefone) updateImportador("telefone", interno.telefone);
            if (interno.editalDBF) updateICMSCalculo("editalDBF", interno.editalDBF);
            preenchidos += 8;
            usouCadastroInterno = true;
            toast.success(`Importador encontrado no cadastro interno: ${interno.razaoSocial}`);
          }
        } catch (_eInterno) {
          // Cadastro interno indisponível, seguir para BrasilAPI
        }
        // 2º: se não encontrou no cadastro interno, buscar na BrasilAPI
        if (!usouCadastroInterno) {
        try {
          const resp = await fetch(`/api/trpc/cnpj.buscar?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: { cnpj: cnpjRaw } } }))}`, { credentials: "include" });
          const json = await resp.json();
          const d = json?.[0]?.result?.data?.json ?? json?.[0]?.result?.data ?? json?.result?.data;
          if (d?.razaoSocial) {
            updateImportador("nome", d.razaoSocial);
            updateImportador("cnpj", d.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5"));
            if (d.cnae) updateImportador("cnae", d.cnae);
            if (d.endereco) updateImportador("endereco", d.endereco);
            if (d.bairro) updateImportador("bairro", d.bairro);
            if (d.cep) updateImportador("cep", d.cep);
            if (d.municipio) updateImportador("municipio", d.municipio);
            if (d.uf) updateImportador("uf", d.uf);
            if (d.telefone) updateImportador("telefone", d.telefone);
            preenchidos += 8;
            toast.info(`Dados do importador atualizados via CNPJ: ${d.razaoSocial}`);
          } else {
            // Fallback: usar dados do XML
            if (data.importador?.nome) { updateImportador("nome", data.importador.nome); preenchidos++; }
            updateImportador("cnpj", cnpjRaw.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")); preenchidos++;
            if (data.importador?.endereco) { updateImportador("endereco", data.importador.endereco); preenchidos++; }
            if (data.importador?.bairro) { updateImportador("bairro", data.importador.bairro); preenchidos++; }
            if (data.importador?.municipio) { updateImportador("municipio", data.importador.municipio); preenchidos++; }
            if (data.importador?.uf) { updateImportador("uf", data.importador.uf); preenchidos++; }
            if (data.importador?.cep) { updateImportador("cep", data.importador.cep); preenchidos++; }
            if (data.importador?.telefone) { updateImportador("telefone", data.importador.telefone); preenchidos++; }
          }
        } catch (_e) {
          // Fallback: usar dados do XML
          if (data.importador?.nome) { updateImportador("nome", data.importador.nome); preenchidos++; }
          updateImportador("cnpj", cnpjRaw.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")); preenchidos++;
          if (data.importador?.endereco) { updateImportador("endereco", data.importador.endereco); preenchidos++; }
          if (data.importador?.bairro) { updateImportador("bairro", data.importador.bairro); preenchidos++; }
          if (data.importador?.municipio) { updateImportador("municipio", data.importador.municipio); preenchidos++; }
          if (data.importador?.uf) { updateImportador("uf", data.importador.uf); preenchidos++; }
          if (data.importador?.cep) { updateImportador("cep", data.importador.cep); preenchidos++; }
          if (data.importador?.telefone) { updateImportador("telefone", data.importador.telefone); preenchidos++; }
        }
        } // fim if (!usouCadastroInterno)
      } else { // sem CNPJ de 14 dígitos
        // Sem CNPJ: usar dados do XML diretamente
        if (data.importador?.nome) { updateImportador("nome", data.importador.nome); preenchidos++; }
        if (data.importador?.endereco) { updateImportador("endereco", data.importador.endereco); preenchidos++; }
        if (data.importador?.bairro) { updateImportador("bairro", data.importador.bairro); preenchidos++; }
        if (data.importador?.municipio) { updateImportador("municipio", data.importador.municipio); preenchidos++; }
        if (data.importador?.uf) { updateImportador("uf", data.importador.uf); preenchidos++; }
        if (data.importador?.cep) { updateImportador("cep", data.importador.cep); preenchidos++; }
        if (data.importador?.telefone) { updateImportador("telefone", data.importador.telefone); preenchidos++; }
      }

      // ===== DOCUMENTO =====
      if (data.numeroDI) { updateDocumento("numero", data.numeroDI); preenchidos++; }
      if (data.dataRegistro) {
        // Converter DD/MM/YYYY → YYYY-MM-DD para o input type="date"
        let dataFormatada = data.dataRegistro;
        const matchDMY = data.dataRegistro.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (matchDMY) {
          dataFormatada = `${matchDMY[3]}-${matchDMY[2]}-${matchDMY[1]}`;
        }
        updateDocumento("dataRegistro", dataFormatada);
        preenchidos++;
      }
      // Recinto: preencher nome e código diretamente do XML
      if (data.recintoCodigoRaw) {
        updateDocumento("codRecinto", data.recintoCodigoFormatado || data.recintoCodigoRaw);
        preenchidos++;
      }
      if (data.recintoNome) {
        updateDocumento("nomeRecinto", data.recintoNome);
        preenchidos++;
      }
      // URF de desembaraço
      if (data.urfNome) { updateDocumento("urfNome", data.urfNome); preenchidos++; }
      // UF de desembaraço
      if (data.ufDesembaraco) { updateDocumento("ufDesembaraco", data.ufDesembaraco); preenchidos++; }
      // Valor CIF / VMLD (em reais) → preenche item 4.3 e guia ICMS
      if (data.valorCIFReais) {
        updateDocumento("valorCIF", data.valorCIFReais);
        updateICMSCalculo("valorCIF", data.valorCIFReais);
        updateField("valorCIFAdicion", data.valorCIFReais);
        preenchidos++;
      } else if (data.valorCIF) {
        updateDocumento("valorCIF", data.valorCIF);
        updateICMSCalculo("valorCIF", data.valorCIF);
        updateField("valorCIFAdicion", data.valorCIF);
        preenchidos++;
      }
      // ===== IMPOSTOS SOMADOS (II + IPI + PIS + COFINS + Taxa Siscomex) =====
      if (data.totalImpostosReais && parseFloat(data.totalImpostosReais) > 0) {
        updateICMSCalculo("impostos", data.totalImpostosReais);
        preenchidos++;
      }
      // ===== ADIÇÕES (já ordenadas por número crescente no servidor) =====
      if (data.adicoes?.length > 0) {
        // Taxa SISCOMEX proporcional por adição
        const taxaSiscomexTotal = parseFloat(data.taxaSiscomex || "0");
        const totalAdicoes = data.adicoes.length;
        const taxaPorAdicao = totalAdicoes > 0 ? taxaSiscomexTotal / totalAdicoes : 0;

        // Separar adições normais (diferimento) das adições da lista negativa
        const adicoesNormais: any[] = [];
        const textoLinhasNegativas: string[] = [];

        data.adicoes.forEach((ad: any) => {
          if (ncmNaListaNegativa(ad.ncm || "")) {
            // Adição da lista negativa: calcular ICMS e gerar texto explicativo
            // Buscar alíquota pelos 4 primeiros dígitos da NCM no Anexo I
            const ncmLimpo = (ad.ncm || "").replace(/[^0-9]/g, "");
            const ncm4dig = ncmLimpo.slice(0, 4);
            const aliquotaInfo = verificarAliquotaNCM(ncm4dig);
            const aliquotaPct = aliquotaInfo ? aliquotaInfo.aliquota : 20.5;

            // Base de Cálculo da Adição R$ (iiBaseCalculo / valorAduaneiro do XML)
            const baseCalculo = parseFloat(ad.valorAduaneiro || "0");

            // Impostos da adição: II + IPI + PIS/PASEP + COFINS + Taxa SISCOMEX de 1 adição
            const impostosAdicao = ad.impostos
              ? parseFloat(ad.impostos.ii || "0") +
                parseFloat(ad.impostos.ipi || "0") +
                parseFloat(ad.impostos.pis || "0") +
                parseFloat(ad.impostos.cofins || "0")
              : 0;
            const somaBase = baseCalculo + impostosAdicao + taxaPorAdicao;

            // Fórmula: (BaseCalculo + II + IPI + PIS/PASEP + COFINS + TaxaSISCOMEX) ÷ 0,795 × alíquota
            const valorICMS = (somaBase / 0.795) * (aliquotaPct / 100);
            const aliquotaStr = aliquotaPct % 1 === 0 ? `${aliquotaPct}` : `${aliquotaPct}`;
            const valorICMSStr = formatarMoeda(valorICMS);
            textoLinhasNegativas.push(
              `ADIÇÃO ${ad.numero} - TRIBUTAÇÃO NORMAL - ALIQUOTA ${aliquotaStr}% - VALOR DO ICMS - R$ ${valorICMSStr}\nA ADIÇÃO ${ad.numero} É RECOLHIMENTO INTEGRAL, POR ISSO ELA NÃO CONSTA NA GLME.`
            );
          } else {
            adicoesNormais.push(ad);
          }
        });

        // Preencher guia 4 apenas com adições normais (diferimento)
        const numNormais = adicoesNormais.length;
        const numProdutosAtual = formData.produtos.length;
        if (numNormais > numProdutosAtual) {
          for (let i = numProdutosAtual; i < numNormais; i++) addProduto();
        }
        adicoesNormais.forEach((ad: any, idx: number) => {
          updateProduto(idx, "adicao", ad.numero || "");
          updateProduto(idx, "ncm", ad.ncm || "");
          updateProduto(idx, "classeTarifaria", ad.ncm || "");
          updateProduto(idx, "tratamento", "3"); // padrão: 3 - Diferimento
          if (ad.descricao) updateProduto(idx, "descricao", ad.descricao);
          if (ad.valorAduaneiro) updateProduto(idx, "valorAduaneiro", ad.valorAduaneiro);
          preenchidos++;
        });

        // Adicionar texto explicativo na guia 5 para adições da lista negativa
        if (textoLinhasNegativas.length > 0) {
          const textoAtual = (formData.icmsCalculo as any).textoAdicional || "";
          const novoTexto = textoAtual
            ? textoAtual + "\n\n" + textoLinhasNegativas.join("\n\n")
            : textoLinhasNegativas.join("\n\n");
          updateICMSCalculo("textoAdicional" as any, novoTexto);
          toast.info(`${textoLinhasNegativas.length} adição(ões) da lista negativa removida(s) da guia 4 e registrada(s) na guia 5.`);
        }
      }
      if (preenchidos > 0) {
        toast.success(`DI ${data.numeroDI || ""} importada! ${preenchidos} campos preenchidos automaticamente.`);
      } else {
        toast.warning("XML processado, mas nenhum campo reconhecido. Verifique se é um XML de DI do SISCOMEX.");
      }
    },
    onError: (e) => toast.error(`Erro ao processar DI: ${e.message}`),
  });

  // ===== BUSCA CNPJ =====
  const buscarCNPJQuery = trpc.cnpj.buscar.useQuery(
    { cnpj: cnpjBusca.replace(/\D/g, "") },
    { enabled: false, retry: false }
  );

  const handleBuscarCNPJ = useCallback(async () => {
    const cnpjClean = cnpjBusca.replace(/\D/g, "");
    if (cnpjClean.length !== 14) {
      toast.error("Digite um CNPJ válido com 14 dígitos");
      return;
    }
    setCnpjLoading(true);
    setCnpjStatus("idle");
    try {
      const result = await buscarCNPJQuery.refetch();
      if (result.data) {
        const d = result.data;
        updateImportador("nome", d.razaoSocial);
        updateImportador("cnpj", d.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5"));
        updateImportador("cnae", d.cnae);
        updateImportador("endereco", d.endereco);
        updateImportador("bairro", d.bairro);
        updateImportador("cep", d.cep);
        updateImportador("municipio", d.municipio);
        updateImportador("uf", d.uf);
        updateImportador("telefone", d.telefone);
        setCnpjStatus("ok");
        toast.success(`Empresa encontrada: ${d.razaoSocial}`);
      }
    } catch (e: any) {
      setCnpjStatus("error");
      toast.error(e.message || "Erro ao consultar CNPJ");
    } finally {
      setCnpjLoading(false);
    }
  }, [cnpjBusca, buscarCNPJQuery, updateImportador]);

  // ===== SELECIONAR IMPORTADOR DO BD =====
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
    toast.success(`Importador "${imp.razaoSocial}" selecionado`);
  };

  // ===== SALVAR IMPORTADOR NO BD =====
  const handleSalvarImportador = () => {
    const dados = formData.importador;
    if (!dados.cnpj || !dados.nome) {
      toast.error("CNPJ e Razão Social são obrigatórios");
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

  // ===== SELECIONAR RECINTO =====
  const handleSelecionarRecinto = (codigoRecinto: string) => {
    const recinto = recintos.find((r: any) => r.codigo === codigoRecinto);
    if (recinto) {
      updateDocumento("nomeRecinto", recinto.nome);
      updateDocumento("codRecinto", recinto.codigo);
      if (recinto.uf) updateDocumento("ufDesembaraco", recinto.uf);
    }
  };

  // ===== IMPORTAR DI XML =====
  const handleImportarDI = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xml")) {
      toast.error("Formato não suportado. Use apenas arquivos XML da DI exportados do SISCOMEX.");
      if (diFileInputRef.current) diFileInputRef.current.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      parsearXMLMutation.mutate({ xmlContent: content });
    };
    reader.readAsText(file, "UTF-8");
    if (diFileInputRef.current) diFileInputRef.current.value = "";
  };

  // ===== GERAR PDF =====
  const handleGerarPDF = async () => {
    setGerandoPDF(true);
    try {
      await gerarGLMEPDF(formData as any);
      toast.success("PDF gerado com sucesso!");
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

  // Agrupar recintos por tipo
  const recintosPorTipo = {
    porto: recintos.filter((r: any) => r.tipo === "porto"),
    porto_seco: recintos.filter((r: any) => r.tipo === "porto_seco"),
    aeroporto: recintos.filter((r: any) => r.tipo === "aeroporto"),
    fronteira: recintos.filter((r: any) => r.tipo === "fronteira"),
  };

  // Dados do adquirente: se igual ao importador, usar dados do importador; senão usar adquirente
  const adquirenteExibido = adquirenteIgualImportador ? formData.importador : formData.adquirente;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900 mb-1">
            GLME — Guia para Liberação de Mercadoria Estrangeira
          </h1>
          <p className="text-slate-500 text-sm">
            Formulário interativo com cálculos automáticos de ICMS · Dados salvos automaticamente no navegador
          </p>
        </div>

        {/* Barra de Ações */}
        <div className="flex flex-wrap gap-2 mb-4">
          <Button
            onClick={() => diFileInputRef.current?.click()}
            variant="default"
            className="gap-2 bg-blue-700 hover:bg-blue-800"
            disabled={parsearXMLMutation.isPending}
          >
            {parsearXMLMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Importar DI (XML)
          </Button>
           <input ref={diFileInputRef} type="file" accept=".xml" onChange={handleImportarDI} className="hidden" />
          {/* Botão Importar DUIMP */}
          <Button
            onClick={() => setShowDuimpModal(true)}
            variant="outline"
            className="gap-2 border-blue-600 text-blue-700 hover:bg-blue-50"
          >
            <FileSearch2 className="w-4 h-4" />
            Importar DUIMP
          </Button>
          <input ref={duimpFileInputRef} type="file" accept=".pdf" onChange={handleImportarDuimpPDF} className="hidden" />
          <Button
            onClick={handleGerarPDF}
            variant="default"
            className="gap-2 bg-green-700 hover:bg-green-800"
            disabled={gerandoPDF}
          >
            {gerandoPDF ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            Gerar PDF Oficial
          </Button>

          <Dialog open={showCadastro} onOpenChange={setShowCadastro}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Building2 className="w-4 h-4" />
                Cadastro de Importadores
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Cadastro de Importadores</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {importadoresBD.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-sm text-slate-700 mb-2">Importadores Cadastrados</h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2">
                      {importadoresBD.map((imp: any) => (
                        <div key={imp.id} className="flex items-center justify-between p-2 bg-slate-50 rounded border text-sm">
                          <div>
                            <p className="font-medium">{imp.razaoSocial}</p>
                            <p className="text-slate-500 text-xs">
                              {imp.cnpj}
                              {imp.editalDBF && <span className="text-blue-600 ml-2">Edital: {imp.editalDBF}</span>}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => { handleSelecionarImportador(imp); setShowCadastro(false); }}>
                              Usar
                            </Button>
                            <Button size="sm" variant="ghost" className="text-red-500"
                              onClick={() => excluirImportadorMutation.mutate({ id: imp.id })}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border-t pt-4">
                  <h3 className="font-semibold text-sm text-slate-700 mb-3">Buscar e Cadastrar por CNPJ</h3>
                  <div className="flex gap-2 mb-4">
                    <Input
                      placeholder="Digite o CNPJ (00.000.000/0000-00)"
                      value={cnpjBusca}
                      onChange={(e) => setCnpjBusca(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleBuscarCNPJ()}
                      className="flex-1"
                    />
                    <Button onClick={handleBuscarCNPJ} disabled={cnpjLoading} className="gap-2">
                      {cnpjLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      Buscar
                    </Button>
                  </div>
                  {cnpjStatus === "ok" && (
                    <div className="flex items-center gap-2 text-green-700 text-sm mb-3">
                      <CheckCircle2 className="w-4 h-4" /> Dados preenchidos na aba Importador / Adquirente
                    </div>
                  )}
                  {cnpjStatus === "error" && (
                    <div className="flex items-center gap-2 text-red-600 text-sm mb-3">
                      <AlertCircle className="w-4 h-4" /> Não foi possível consultar o CNPJ
                    </div>
                  )}
                  <div className="mb-4">
                    <Label htmlFor="edital-cadastro" className="text-sm font-medium">
                      Número do Edital DBF (será preenchido no item 6 — ICMS)
                    </Label>
                    <Input
                      id="edital-cadastro"
                      placeholder="Ex: 001/2024"
                      value={editalDBFCadastro}
                      onChange={(e) => setEditalDBFCadastro(e.target.value)}
                    />
                    <p className="text-xs text-slate-500 mt-1">Este número substituirá XXX/XXXX no texto do fundamento legal</p>
                  </div>
                  <Button
                    onClick={handleSalvarImportador}
                    disabled={salvarImportadorMutation.isPending}
                    className="w-full gap-2"
                  >
                    {salvarImportadorMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Salvar Importador Atual no Cadastro
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Button onClick={resetForm} variant="destructive" size="sm">
            Limpar Formulário
          </Button>
        </div>

        {/* Info bar */}
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
          <strong>Dica:</strong> Use "Importar DI (XML)" para preencher automaticamente os campos com dados da Declaração de Importação (arquivo XML exportado do SISCOMEX). Os dados são salvos automaticamente no navegador.
        </div>

        {/* Tabs */}
        <Tabs defaultValue="secretaria" className="w-full">
          <TabsList className="grid w-full grid-cols-6 mb-4">
            <TabsTrigger value="secretaria">1 — Estado de Recolhimento</TabsTrigger>
            <TabsTrigger value="importador">2 — Importador / Adquirente</TabsTrigger>
            <TabsTrigger value="documento">3 — Dados da Declaração</TabsTrigger>
            <TabsTrigger value="produtos">4 — Adições</TabsTrigger>
            <TabsTrigger value="icms">5 — ICMS</TabsTrigger>
          </TabsList>

          {/* TAB 1: Estado de Recolhimento */}
          <TabsContent value="secretaria">
            <Card>
              <CardHeader>
                <CardTitle>1 — SECRETARIA DA FAZENDA OU DE FINANÇAS — ESTADO DE RECOLHIMENTO</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-w-sm">
                  <Label htmlFor="secretaria-uf">UF da Secretaria da Fazenda</Label>
                  <Select value={formData.secretariaUF} onValueChange={(v) => updateField("secretariaUF", v)}>
                    <SelectTrigger id="secretaria-uf">
                      <SelectValue placeholder="Selecione um estado" />
                    </SelectTrigger>
                    <SelectContent>
                      {ESTADOS_BRASIL.map((e) => (
                        <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: Importador / Adquirente */}
          <TabsContent value="importador">
            <div className="space-y-6">
              {/* Seção 2 - Importador */}
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle>2 — IMPORTADOR</CardTitle>
                    <div className="flex gap-2">
                      {importadoresBD.length > 0 && (
                        <Select onValueChange={(id) => {
                          const imp = importadoresBD.find((i: any) => String(i.id) === id);
                          if (imp) handleSelecionarImportador(imp);
                        }}>
                          <SelectTrigger className="w-64">
                            <SelectValue placeholder="Selecionar importador cadastrado" />
                          </SelectTrigger>
                          <SelectContent>
                            {importadoresBD.map((imp: any) => (
                              <SelectItem key={imp.id} value={String(imp.id)}>
                                {imp.razaoSocial}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Button variant="outline" size="sm" onClick={() => setShowCadastro(true)} className="gap-1">
                        <Building2 className="w-4 h-4" />
                        Gerenciar
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Busca CNPJ inline */}
                    <div className="p-3 bg-slate-50 border rounded-lg">
                      <Label className="text-sm font-semibold text-slate-700 mb-2 block">
                        2.1 — Buscar dados pelo CNPJ (Receita Federal)
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="00.000.000/0000-00"
                          value={cnpjBusca}
                          onChange={(e) => setCnpjBusca(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleBuscarCNPJ()}
                          className="flex-1"
                        />
                        <Button onClick={handleBuscarCNPJ} disabled={cnpjLoading} className="gap-2">
                          {cnpjLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                          Consultar
                        </Button>
                      </div>
                      {cnpjStatus === "ok" && (
                        <p className="text-green-700 text-xs mt-1 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Dados preenchidos automaticamente
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <Label>Nome / Razão Social</Label>
                        <Input value={formData.importador.nome} onChange={(e) => updateImportador("nome", e.target.value)} placeholder="Razão Social da empresa" />
                      </div>
                      <div>
                        <Label>2.2 — Inscrição Estadual</Label>
                        <Input value={formData.importador.inscricaoEstadual} onChange={(e) => updateImportador("inscricaoEstadual", e.target.value)} placeholder="00.000.000.000.000" />
                      </div>
                      <div>
                        <Label>2.3 — CNPJ/CPF</Label>
                        <Input value={formData.importador.cnpj} onChange={(e) => updateImportador("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
                      </div>
                      <div>
                        <Label>2.4 — CNAE</Label>
                        <Input value={formData.importador.cnae} onChange={(e) => updateImportador("cnae", e.target.value)} placeholder="0000-0/00" />
                      </div>
                      <div className="md:col-span-2">
                        <Label>2.5 — Endereço</Label>
                        <Input value={formData.importador.endereco} onChange={(e) => updateImportador("endereco", e.target.value)} placeholder="Rua/Avenida, número" />
                      </div>
                      <div>
                        <Label>2.6 — Bairro ou Distrito</Label>
                        <Input value={formData.importador.bairro} onChange={(e) => updateImportador("bairro", e.target.value)} placeholder="Bairro" />
                      </div>
                      <div>
                        <Label>2.7 — CEP</Label>
                        <Input value={formData.importador.cep} onChange={(e) => updateImportador("cep", e.target.value)} placeholder="00000-000" />
                      </div>
                      <div>
                        <Label>2.8 — Município</Label>
                        <Input value={formData.importador.municipio} onChange={(e) => updateImportador("municipio", e.target.value)} placeholder="Município" />
                      </div>
                      <div>
                        <Label>2.9 — UF</Label>
                        <Select value={formData.importador.uf} onValueChange={(v) => updateImportador("uf", v)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {ESTADOS_BRASIL.map((e) => (
                              <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>2.10 — Telefone</Label>
                        <Input value={formData.importador.telefone} onChange={(e) => updateImportador("telefone", e.target.value)} placeholder="(00) 0000-0000" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Seção 3 - Adquirente */}
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>3 — ADQUIRENTE OU DESTINATÁRIO *</CardTitle>
                    <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <Checkbox
                        id="adquirente-igual"
                        checked={adquirenteIgualImportador}
                        onCheckedChange={(checked) => setAdquirenteIgualImportador(!!checked)}
                      />
                      <Label htmlFor="adquirente-igual" className="cursor-pointer text-amber-800 font-medium text-sm">
                        Os dados do Adquirente são iguais aos do Importador
                      </Label>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {adquirenteIgualImportador ? (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                      <CheckCircle2 className="w-4 h-4 inline mr-2" />
                      Os dados do Adquirente serão os mesmos do Importador no formulário PDF. Os campos abaixo ficam em branco.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <Label>Nome / Razão Social</Label>
                        <Input value={formData.adquirente.nome} onChange={(e) => updateAdquirente("nome", e.target.value)} placeholder="Razão Social do adquirente" />
                      </div>
                      <div>
                        <Label>3.2 — Inscrição Estadual</Label>
                        <Input value={formData.adquirente.inscricaoEstadual} onChange={(e) => updateAdquirente("inscricaoEstadual", e.target.value)} placeholder="00.000.000.000.000" />
                      </div>
                      <div>
                        <Label>3.3 — CNPJ/CPF</Label>
                        <Input value={formData.adquirente.cnpj} onChange={(e) => updateAdquirente("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
                      </div>
                      <div>
                        <Label>3.4 — CNAE</Label>
                        <Input value={formData.adquirente.cnae} onChange={(e) => updateAdquirente("cnae", e.target.value)} placeholder="0000-0/00" />
                      </div>
                      <div className="md:col-span-2">
                        <Label>3.5 — Endereço</Label>
                        <Input value={formData.adquirente.endereco} onChange={(e) => updateAdquirente("endereco", e.target.value)} placeholder="Rua/Avenida, número" />
                      </div>
                      <div>
                        <Label>3.6 — Bairro ou Distrito</Label>
                        <Input value={formData.adquirente.bairro} onChange={(e) => updateAdquirente("bairro", e.target.value)} placeholder="Bairro" />
                      </div>
                      <div>
                        <Label>3.7 — CEP</Label>
                        <Input value={formData.adquirente.cep} onChange={(e) => updateAdquirente("cep", e.target.value)} placeholder="00000-000" />
                      </div>
                      <div>
                        <Label>3.8 — Município</Label>
                        <Input value={formData.adquirente.municipio} onChange={(e) => updateAdquirente("municipio", e.target.value)} placeholder="Município" />
                      </div>
                      <div>
                        <Label>3.9 — UF</Label>
                        <Select value={formData.adquirente.uf} onValueChange={(v) => updateAdquirente("uf", v)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {ESTADOS_BRASIL.map((e) => (
                              <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>3.10 — Telefone</Label>
                        <Input value={formData.adquirente.telefone} onChange={(e) => updateAdquirente("telefone", e.target.value)} placeholder="(00) 0000-0000" />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* TAB 3: Dados da Declaração */}
          <TabsContent value="documento">
            <Card>
              <CardHeader>
                <CardTitle>3 — DADOS DA DECLARAÇÃO DE IMPORTAÇÃO</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <Label className="text-base font-semibold mb-3 block">Tipo de Documento</Label>
                    <div className="flex gap-6">
                      {TIPOS_DOCUMENTO.map((tipo) => (
                        <div key={tipo.value} className="flex items-center space-x-2">
                          <Checkbox
                            id={`doc-${tipo.value}`}
                            checked={formData.documento.tipo.includes(tipo.value)}
                            onCheckedChange={() => handleDocumentoTypeChange(tipo.value)}
                          />
                          <Label htmlFor={`doc-${tipo.value}`} className="font-normal cursor-pointer">{tipo.label}</Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>4.1 — Número</Label>
                      <Input
                        value={formData.documento.numero}
                        onChange={(e) => {
                          updateDocumento("numero", e.target.value);
                        }}
                        placeholder="Número do documento"
                      />
                    </div>
                    <div>
                      <Label>4.2 — Data do Registro</Label>
                      <Input type="date" value={formData.documento.dataRegistro} onChange={(e) => updateDocumento("dataRegistro", e.target.value)} />
                    </div>
                    <div>
                      <Label>4.3 — Valor CIF (VMLD) em R$</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.documento.valorCIF}
                        onChange={(e) => {
                          updateDocumento("valorCIF", e.target.value);
                          updateField("valorCIFAdicion", e.target.value);
                        }}
                        placeholder="0,00"
                      />
                      <p className="text-xs text-slate-500 mt-1">Sincronizado com cálculo ICMS (guia 6)</p>
                    </div>

                    <div>
                      <Label>4.4 — Recinto Alfandegado</Label>
                      <Input
                        value={formData.documento.nomeRecinto || ""}
                        onChange={(e) => updateDocumento("nomeRecinto", e.target.value)}
                        placeholder="Preenchido automaticamente ao importar DI XML"
                        className="bg-slate-50"
                      />
                      <p className="text-xs text-slate-500 mt-1">Preenchido automaticamente pela importação do XML</p>
                    </div>

                    <div>
                      <Label>4.5 — Código do Recinto</Label>
                      <Input value={formData.documento.codRecinto} disabled className="bg-slate-100" placeholder="Preenchido automaticamente" />
                    </div>

                    <div>
                      <Label>4.6 — UF Desembaraço</Label>
                      <Select value={formData.documento.ufDesembaraco} onValueChange={(v) => updateDocumento("ufDesembaraco", v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um estado" />
                        </SelectTrigger>
                        <SelectContent>
                          {ESTADOS_BRASIL.map((e) => (
                            <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 4: Adições */}
          <TabsContent value="produtos">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>4 — ADIÇÕES (PRODUTOS SEM RECOLHIMENTO DO ICMS)</CardTitle>
                  <Button onClick={addProduto} variant="outline" size="sm" className="gap-2">
                    <Plus className="w-4 h-4" /> Adicionar Adição
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {formData.produtos.map((produto, index) => (
                    <div key={index} className="p-4 border rounded-lg bg-slate-50">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-semibold text-slate-900">Adição {index + 1}</h3>
                        {formData.produtos.length > 1 && (
                          <Button onClick={() => removeProduto(index)} variant="ghost" size="sm" className="text-red-600">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label>5.1 — Adição Nº</Label>
                          <Input
                            value={produto.adicao}
                            onChange={(e) => updateProduto(index, "adicao", e.target.value)}
                            placeholder="Número da adição"
                          />
                        </div>
                        <div>
                          <Label>5.2 — Classe Tarifária (NCM)</Label>
                          <Input
                            value={produto.classeTarifaria}
                            onChange={(e) => updateProduto(index, "classeTarifaria", e.target.value)}
                            placeholder="0000.00.00"
                          />
                        </div>
                        <div>
                          <Label>5.3 — Tratamento Tributário</Label>
                          <Select value={produto.tratamento} onValueChange={(v) => updateProduto(index, "tratamento", v)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {TRATAMENTOS_TRIBUTARIOS.map((t) => (
                                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {/* 5.4 e 5.5 ocultos no formulário, mantidos no estado para o PDF */}
                        <input type="hidden" value={produto.fundamentoLegal} />
                        <input type="hidden" value={produto.valor} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 6: Cálculo ICMS */}
          <TabsContent value="icms">
            <Card>
              <CardHeader>
                <CardTitle>6 — FUNDAMENTO LEGAL E CÁLCULO ICMS (Item 5.4 do Formulário Oficial)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Campo Edital DBF */}
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <Label htmlFor="edital-dbf" className="font-semibold text-amber-900">
                      Edital DBF (substitui XXX/XXXX no texto abaixo)
                    </Label>
                    <div className="flex gap-2 mt-2">
                      <Input
                        id="edital-dbf"
                        value={formData.icmsCalculo.editalDBF}
                        onChange={(e) => updateICMSCalculo("editalDBF", e.target.value)}
                        placeholder="Ex: 001/2024"
                        className="max-w-xs"
                      />
                      {importadoresBD.length > 0 && (
                        <Select onValueChange={(id) => {
                          const imp = importadoresBD.find((i: any) => String(i.id) === id);
                          if (imp?.editalDBF) updateICMSCalculo("editalDBF", imp.editalDBF);
                        }}>
                          <SelectTrigger className="w-56">
                            <SelectValue placeholder="Usar edital do importador" />
                          </SelectTrigger>
                          <SelectContent>
                            {importadoresBD.filter((i: any) => i.editalDBF).map((imp: any) => (
                              <SelectItem key={imp.id} value={String(imp.id)}>
                                {imp.razaoSocial} — {imp.editalDBF}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>

                  {/* Texto de Fundamento Legal */}
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-slate-700 leading-relaxed space-y-2">
                    <p>
                      ICMS diferido nos termos da Lei nº 13.942/2009, art. 2º-A, I; § 1º; Decreto 44.650/2017, Anexo 8, art. 49,
                      Anexo 27, art. 1º, II; Credenciamento de estímulo à atividade portuária – Edital DBF nº.{" "}
                      <Badge variant="outline" className="font-bold text-blue-800 border-blue-400">
                        {formData.icmsCalculo.editalDBF || "XXX/XXXX"}
                      </Badge>
                      ; Mercadoria não prevista na Lista de produtos impedidos para utilização do Programa de Estímulo à Atividade
                      Portuária - PEAP - Anexo 27 do Decreto nº 44.650/2017.
                    </p>
                  </div>

                  {/* Caixa de Texto Adicional Manual */}
                  <div className="space-y-2">
                    <Label htmlFor="texto-adicional" className="font-semibold text-slate-700">
                      Texto Adicional (inserção manual no item 5.4)
                    </Label>
                    <textarea
                      id="texto-adicional"
                      className="w-full min-h-[80px] p-3 border border-slate-300 rounded-lg text-sm text-slate-700 resize-y focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                      placeholder="Digite aqui qualquer texto adicional que deverá constar no item 5.4 do formulário oficial..."
                      value={(formData.icmsCalculo as any).textoAdicional || ""}
                      onChange={(e) => updateICMSCalculo("textoAdicional" as any, e.target.value)}
                    />
                    <p className="text-xs text-slate-500">Este texto será incluído abaixo do texto do ICMS Diferido no PDF gerado.</p>
                  </div>

                  {/* Cálculos */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-slate-900 text-sm uppercase tracking-wide">CÁLCULO: (VALOR CIF) + IMPOSTOS = (VT)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label>Valor CIF (R$)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.icmsCalculo.valorCIF}
                          onChange={(e) => updateICMSCalculo("valorCIF", e.target.value)}
                          placeholder="0,00"
                          className="bg-blue-50 border-blue-200"
                        />
                        <p className="text-xs text-blue-600 mt-1">Sincronizado com item 4.3</p>
                      </div>
                      <div>
                        <Label>Impostos (R$)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.icmsCalculo.impostos}
                          onChange={(e) => updateICMSCalculo("impostos", e.target.value)}
                          placeholder="0,00"
                        />
                      </div>
                      <div>
                        <Label className="font-bold">VT = CIF + Impostos (R$)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.icmsCalculo.vt}
                          disabled
                          className="bg-slate-100 font-semibold"
                          placeholder="0,00"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Base de Cálculo ICMS */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-slate-900 text-sm uppercase tracking-wide">BASE DE CÁLCULO PARA ICMS: (VT) / 0,795 = (VTI)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label>VT (R$)</Label>
                        <Input value={formData.icmsCalculo.vt} disabled className="bg-slate-100" placeholder="0,00" />
                      </div>
                      <div className="flex items-end pb-1">
                        <span className="text-slate-600 font-semibold">÷ 0,795 =</span>
                      </div>
                      <div>
                        <Label className="font-bold">VTI (R$)</Label>
                        <Input value={formData.icmsCalculo.vti} disabled className="bg-slate-100 font-semibold" placeholder="0,00" />
                      </div>
                    </div>
                  </div>

                  {/* Cálculo ICMS */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-slate-900 text-sm uppercase tracking-wide">CÁLCULO ICMS: (VTI) × 20,5% = (VF)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label>VTI (R$)</Label>
                        <Input value={formData.icmsCalculo.vti} disabled className="bg-slate-100" placeholder="0,00" />
                      </div>
                      <div className="flex items-end pb-1">
                        <span className="text-slate-600 font-semibold">× 20,5% =</span>
                      </div>
                      <div>
                        <Label className="font-bold text-green-800">VF — ICMS (R$)</Label>
                        <Input value={formData.icmsCalculo.vf} disabled className="bg-green-100 font-bold text-green-800 border-green-300" placeholder="0,00" />
                      </div>
                    </div>
                  </div>

                  {/* Resumo */}
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <h4 className="font-bold text-green-900 mb-3">ONDE:</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm text-green-800">
                      <div><strong>Valor CIF:</strong></div><div>R$ {parseFloat(formData.icmsCalculo.valorCIF || "0").toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
                      <div><strong>Impostos:</strong></div><div>R$ {parseFloat(formData.icmsCalculo.impostos || "0").toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
                      <div><strong>VT (CIF + Impostos):</strong></div><div>R$ {parseFloat(formData.icmsCalculo.vt || "0").toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
                      <div><strong>VTI (VT / 0,795):</strong></div><div>R$ {parseFloat(formData.icmsCalculo.vti || "0").toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
                      <div className="font-bold text-base border-t border-green-300 pt-2"><strong>ICMS a Recolher (VF):</strong></div>
                      <div className="font-bold text-base border-t border-green-300 pt-2">R$ {parseFloat(formData.icmsCalculo.vf || "0").toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ===== MODAL IMPORTAÇÃO DUIMP ===== */}
      <Dialog open={showDuimpModal} onOpenChange={setShowDuimpModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSearch2 className="w-5 h-5 text-blue-600" />
              Importar DUIMP
            </DialogTitle>
            <DialogDescription>
              Importe os dados da Declaração Única de Importação (DUIMP) via PDF do extrato ou via API do Portal Único.
            </DialogDescription>
          </DialogHeader>

          {/* Seletor de modo */}
          <div className="flex gap-2 mb-4">
            <Button
              variant={duimpModo === "pdf" ? "default" : "outline"}
              className="flex-1 gap-2"
              onClick={() => setDuimpModo("pdf")}
            >
              <Upload className="w-4 h-4" />
              Via PDF
            </Button>
            <Button
              variant={duimpModo === "api" ? "default" : "outline"}
              className="flex-1 gap-2"
              onClick={() => setDuimpModo("api")}
            >
              <Link className="w-4 h-4" />
              Via API
            </Button>
          </div>

          {duimpModo === "pdf" && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Faça o download do <strong>Extrato da DUIMP</strong> no Portal Único de Comércio Exterior e envie o arquivo PDF aqui.
              </p>
              <Button
                variant="outline"
                className="w-full gap-2 border-dashed border-2 h-20 text-slate-600 hover:border-blue-400 hover:text-blue-600"
                onClick={() => duimpFileInputRef.current?.click()}
                disabled={parsearDuimpPDFMutation.isPending}
              >
                {parsearDuimpPDFMutation.isPending ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Processando PDF...</>
                ) : (
                  <><Upload className="w-5 h-5" /> Clique para selecionar o PDF da DUIMP</>
                )}
              </Button>
              <p className="text-xs text-slate-400">
                Formatos aceitos: .pdf — Extrato gerado pelo Portal Único de Comércio Exterior
              </p>
            </div>
          )}

          {duimpModo === "api" && (
            <div className="space-y-3">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <strong>Atenção:</strong> A API do Portal Único requer autenticação com certificado digital ICP-Brasil.
                As credenciais (clientId e clientSecret) devem ser obtidas no Portal Único.
              </div>
              <div className="space-y-2">
                <Label>Número da DUIMP</Label>
                <Input
                  placeholder="Ex: 25BR000000000-0"
                  value={duimpNumero}
                  onChange={(e) => setDuimpNumero(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Versão</Label>
                <Input
                  placeholder="0"
                  value={duimpVersao}
                  onChange={(e) => setDuimpVersao(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Client ID</Label>
                <Input
                  placeholder="Seu clientId do Portal Único"
                  value={duimpClientId}
                  onChange={(e) => setDuimpClientId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Client Secret</Label>
                <Input
                  type="password"
                  placeholder="Seu clientSecret do Portal Único"
                  value={duimpClientSecret}
                  onChange={(e) => setDuimpClientSecret(e.target.value)}
                />
              </div>
              <Button
                className="w-full gap-2"
                disabled={!duimpNumero || !duimpClientId || !duimpClientSecret || consultarDuimpAPIMutation.isPending}
                onClick={() => consultarDuimpAPIMutation.mutate({
                  numeroDuimp: duimpNumero,
                  versaoDuimp: duimpVersao || "0",
                  clientId: duimpClientId,
                  clientSecret: duimpClientSecret,
                })}
              >
                {consultarDuimpAPIMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Consultando...</>
                ) : (
                  <><Link className="w-4 h-4" /> Consultar DUIMP
                  </>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
