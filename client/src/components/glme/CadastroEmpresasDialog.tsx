import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Building2, CheckCircle2, Loader2, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CadastroEmpresa, type ChavePortalInformada } from "@/components/glme/CadastroEmpresa";
import { SituacaoCadastral } from "@/components/glme/SituacaoCadastral";
import { useConsultaSefaz } from "@/hooks/useConsultaSefaz";
import { ESTADOS_BRASIL } from "@/lib/formData";
import { trpc } from "@/lib/trpc";

/** Empresa como vem do cadastro (tabela importadores). */
export interface EmpresaCadastrada {
  id: number;
  cnpj: string;
  razaoSocial: string;
  inscricaoEstadual?: string | null;
  cnae?: string | null;
  endereco?: string | null;
  bairro?: string | null;
  cep?: string | null;
  municipio?: string | null;
  uf?: string | null;
  telefone?: string | null;
  editalDBF?: string | null;
}

/** Dados da empresa no formato da seção Importador da guia. */
export interface DadosEmpresa {
  nome: string;
  cnpj: string;
  inscricaoEstadual: string;
  cnae: string;
  endereco: string;
  bairro: string;
  cep: string;
  municipio: string;
  uf: string;
  telefone: string;
}

const VAZIO: DadosEmpresa = { nome: "", cnpj: "", inscricaoEstadual: "", cnae: "", endereco: "", bairro: "", cep: "", municipio: "", uf: "", telefone: "" };

const digitos = (v: string | null | undefined) => (v || "").replace(/\D/g, "");
export const formatarCNPJ = (v: string) => digitos(v).replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
const semAcento = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const deCadastro = (e: EmpresaCadastrada): DadosEmpresa => ({
  nome: e.razaoSocial,
  cnpj: formatarCNPJ(e.cnpj),
  inscricaoEstadual: e.inscricaoEstadual || "",
  cnae: e.cnae || "",
  endereco: e.endereco || "",
  bairro: e.bairro || "",
  cep: e.cep || "",
  municipio: e.municipio || "",
  uf: e.uf || "",
  telefone: e.telefone || "",
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresas: EmpresaCadastrada[];
  /** Ao abrir, já entra no cadastro desta empresa (ex.: o importador da guia). */
  abrirCom?: DadosEmpresa | null;
  /** Leva a empresa para a seção Importador da guia. */
  onUsar: (empresa: EmpresaCadastrada) => void;
  /** Avisado depois de salvar, para a guia acompanhar o edital e a IE da empresa. */
  onSalvo?: (dados: DadosEmpresa, editalDBF: string) => void;
}

/**
 * Cadastro de empresas (importadores): dados da Receita Federal e da SEFAZ da UF,
 * edital DBF e chave de acesso do Portal Único. Tudo o que é da empresa fica aqui,
 * fora da seção Importador da guia.
 */
export function CadastroEmpresasDialog({ open, onOpenChange, empresas, abrirCom, onUsar, onSalvo }: Props) {
  const utils = trpc.useUtils();
  const [modo, setModo] = useState<"lista" | "form">("lista");
  const [filtro, setFiltro] = useState("");
  const [dados, setDados] = useState<DadosEmpresa>(VAZIO);
  const [edital, setEdital] = useState("");
  const [consultandoCNPJ, setConsultandoCNPJ] = useState(false);
  const sefaz = useConsultaSefaz();

  const salvarMutation = trpc.importadores.salvar.useMutation({
    onSuccess: () => {
      utils.importadores.listar.invalidate();
      utils.conta.empresas.invalidate();
      utils.importadores.chavePortal.invalidate();
      utils.importadores.comChavePortal.invalidate();
    },
    onError: (e) => toast.error(`Erro ao salvar: ${e.message}`),
  });
  const excluirMutation = trpc.importadores.excluir.useMutation({
    onSuccess: () => {
      toast.success("Empresa excluída do cadastro.");
      utils.importadores.listar.invalidate();
      utils.conta.empresas.invalidate();
    },
    onError: (e) => toast.error(`Erro ao excluir: ${e.message}`),
  });

  const cnpj = digitos(dados.cnpj);
  const cadastro = cnpj.length === 14 ? empresas.find((e) => digitos(e.cnpj) === cnpj) : undefined;

  const editar = (base: DadosEmpresa) => {
    const existente = empresas.find((e) => digitos(e.cnpj) === digitos(base.cnpj));
    setDados(existente ? deCadastro(existente) : base);
    setEdital(existente?.editalDBF || "");
    sefaz.limpar();
    setModo("form");
  };

  // Cada abertura começa pela lista, ou direto na empresa pedida
  useEffect(() => {
    if (!open) return;
    setFiltro("");
    if (abrirCom && digitos(abrirCom.cnpj).length === 14) editar(abrirCom);
    else setModo("lista");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const listaFiltrada = useMemo(() => {
    const termo = semAcento(filtro.trim());
    const termoDigitos = digitos(filtro);
    const lista = [...empresas].sort((a, b) => a.razaoSocial.localeCompare(b.razaoSocial, "pt-BR"));
    if (!termo) return lista;
    return lista.filter((e) =>
      semAcento(e.razaoSocial).includes(termo)
      || (termoDigitos.length >= 3 && digitos(e.cnpj).includes(termoDigitos))
      || semAcento(`${e.municipio || ""} ${e.uf || ""}`).includes(termo));
  }, [empresas, filtro]);

  const atualizar = (campo: keyof DadosEmpresa, valor: string) => setDados((d) => ({ ...d, [campo]: valor }));

  /** Receita Federal (dados cadastrais) e, em seguida, SEFAZ da UF (inscrição estadual). */
  const consultarCNPJ = async () => {
    if (cnpj.length !== 14) {
      toast.error("Informe um CNPJ válido, com 14 dígitos.");
      return;
    }
    setConsultandoCNPJ(true);
    try {
      const d = await utils.cnpj.buscar.fetch({ cnpj });
      setDados((atual) => ({
        ...atual,
        nome: d.razaoSocial || atual.nome,
        cnpj: formatarCNPJ(d.cnpj || cnpj),
        cnae: d.cnae || atual.cnae,
        endereco: d.endereco || atual.endereco,
        bairro: d.bairro || atual.bairro,
        cep: d.cep || atual.cep,
        municipio: d.municipio || atual.municipio,
        uf: d.uf || atual.uf,
        telefone: d.telefone || atual.telefone,
      }));
      toast.success(`Empresa encontrada na Receita Federal: ${d.razaoSocial}`);
      const ie = await sefaz.consultar(cnpj, d.uf);
      if (ie) setDados((atual) => ({ ...atual, inscricaoEstadual: ie }));
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível consultar o CNPJ.");
    } finally {
      setConsultandoCNPJ(false);
    }
  };

  const salvar = async (chavePortal?: ChavePortalInformada) => {
    if (cnpj.length !== 14 || !dados.nome.trim()) {
      toast.error("Informe o CNPJ e a razão social antes de salvar o cadastro.");
      throw new Error("dados incompletos");
    }
    const jaCadastrada = Boolean(cadastro);
    await salvarMutation.mutateAsync({
      cnpj,
      razaoSocial: dados.nome.trim(),
      nomeFantasia: "",
      inscricaoEstadual: dados.inscricaoEstadual,
      cnae: dados.cnae,
      endereco: dados.endereco,
      bairro: dados.bairro,
      cep: dados.cep,
      municipio: dados.municipio,
      uf: dados.uf,
      telefone: dados.telefone,
      email: "",
      editalDBF: edital.trim(),
      chavePortal,
    });
    toast.success(
      jaCadastrada
        ? `Cadastro atualizado${chavePortal ? " com a nova chave de acesso" : ""}.`
        : `Empresa cadastrada e vinculada às suas empresas${chavePortal ? ", com a chave de acesso" : ""}.`,
    );
    onSalvo?.(dados, edital.trim());
  };

  const excluir = async () => {
    if (!cadastro) return;
    await excluirMutation.mutateAsync({ id: cadastro.id });
    setModo("lista");
  };

  const campo = (chave: keyof DadosEmpresa, rotulo: string, className = "", extra: Partial<React.ComponentProps<typeof Input>> = {}) => (
    <div className={`space-y-1.5 ${className}`}>
      <Label htmlFor={`empresa-${chave}`} className="text-[13px] font-medium text-muted-foreground">{rotulo}</Label>
      <Input id={`empresa-${chave}`} value={dados[chave]} onChange={(e) => atualizar(chave, e.target.value)} {...extra} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-brand-navy">Cadastro de empresas</DialogTitle>
          <DialogDescription>
            Dados da Receita Federal e da SEFAZ, edital DBF e chave de acesso do Portal Único de cada importador.
          </DialogDescription>
        </DialogHeader>

        {modo === "lista" ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Buscar empresa"
                  placeholder="Buscar por razão social, CNPJ ou município"
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button onClick={() => editar(VAZIO)}>
                <Plus /> Nova empresa
              </Button>
            </div>

            {listaFiltrada.length === 0 ? (
              <p className="rounded-xl bg-secondary/60 px-4 py-6 text-center text-sm text-muted-foreground">
                {empresas.length === 0 ? "Nenhuma empresa cadastrada ainda." : "Nenhuma empresa encontrada."}
              </p>
            ) : (
              <ul className="divide-y rounded-xl border">
                {listaFiltrada.map((e) => (
                  <li key={e.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-brand-navy">{e.razaoSocial}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {formatarCNPJ(e.cnpj)}
                        {e.uf && ` · ${e.municipio ? `${e.municipio}/` : ""}${e.uf}`}
                        {` · Edital ${e.editalDBF || "não informado"}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="outline" onClick={() => { onUsar(e); onOpenChange(false); }}>
                        <CheckCircle2 /> Usar na guia
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => editar(deCadastro(e))}>
                        <Pencil /> Editar
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setModo("lista")}>
              <ArrowLeft /> Empresas cadastradas
            </Button>

            <div className="flex flex-col gap-2 rounded-xl bg-secondary/60 p-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="empresa-cnpj" className="text-[13px] font-medium text-muted-foreground">
                  CNPJ (consulta na Receita Federal e na SEFAZ da UF)
                </Label>
                <Input
                  id="empresa-cnpj"
                  inputMode="numeric"
                  placeholder="00.000.000/0000-00"
                  value={dados.cnpj}
                  onChange={(e) => atualizar("cnpj", e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && consultarCNPJ()}
                  className="bg-card"
                />
              </div>
              <Button onClick={consultarCNPJ} disabled={consultandoCNPJ}>
                {consultandoCNPJ ? <Loader2 className="animate-spin" /> : <Search />} Consultar
              </Button>
            </div>

            {sefaz.consulta.estado !== "inativo" && (
              <SituacaoCadastral consulta={sefaz.consulta} onRepetir={() => sefaz.consultar(cnpj, dados.uf)} />
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
              {campo("nome", "Razão social", "sm:col-span-2 lg:col-span-6")}
              {campo("inscricaoEstadual", "Inscrição estadual", "lg:col-span-3")}
              {campo("cnae", "CNAE", "lg:col-span-3", { placeholder: "0000-0/00" })}
              {campo("endereco", "Endereço", "sm:col-span-2 lg:col-span-4")}
              {campo("bairro", "Bairro", "lg:col-span-2")}
              {campo("cep", "CEP", "lg:col-span-2", { inputMode: "numeric", placeholder: "00000-000" })}
              {campo("municipio", "Município", "lg:col-span-2")}
              <div className="space-y-1.5 lg:col-span-1">
                <Label htmlFor="empresa-uf" className="text-[13px] font-medium text-muted-foreground">UF</Label>
                <Select value={dados.uf} onValueChange={(v) => atualizar("uf", v)}>
                  <SelectTrigger id="empresa-uf" className="w-full"><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>
                    {ESTADOS_BRASIL.map((e) => <SelectItem key={e.value} value={e.value} title={e.label}>{e.value}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {campo("telefone", "Telefone", "lg:col-span-1", { inputMode: "tel" })}
            </div>

            {cnpj.length === 14 ? (
              <CadastroEmpresa
                key={cadastro?.id ?? cnpj}
                cadastro={cadastro ? { id: cadastro.id, razaoSocial: cadastro.razaoSocial } : undefined}
                editalDBF={edital}
                onEditalChange={setEdital}
                onSalvar={salvar}
                salvando={salvarMutation.isPending}
                onExcluir={excluir}
                excluindo={excluirMutation.isPending}
              />
            ) : (
              <p className="flex items-center gap-2 rounded-xl bg-secondary/60 px-3 py-2 text-sm text-muted-foreground">
                <Building2 className="size-4" /> Informe o CNPJ completo para cadastrar o edital e a chave de acesso.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
