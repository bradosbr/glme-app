import { AlertTriangle, ChevronDown, FileCode2, FileText, KeyRound, Link2, Loader2, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface ConsultaDuimpAPI {
  numeroDuimp: string;
  /** Em branco: versão vigente. */
  versaoDuimp?: string;
  /** Empresa cuja chave de acesso do Portal Único será usada. */
  importadorId: number;
}

export interface EmpresaComChave {
  id: number;
  razaoSocial: string;
  cnpj: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Recebe o arquivo escolhido: .xml (DI) ou .pdf (extrato da DUIMP). */
  onArquivo: (arquivo: File) => void;
  processando: boolean;
  onConsultarAPI: (dados: ConsultaDuimpAPI) => void;
  consultandoAPI: boolean;
  /** Empresas com chave de acesso que o usuário pode usar. */
  empresasComChave: EmpresaComChave[];
  /** Empresa da seção Importador, sugerida quando tiver chave. */
  empresaSugeridaId?: number;
}

export function ImportarDeclaracaoDialog({
  open, onOpenChange, onArquivo, processando, onConsultarAPI, consultandoAPI, empresasComChave, empresaSugeridaId,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [numeroDuimp, setNumeroDuimp] = useState("");
  const [versaoDuimp, setVersaoDuimp] = useState("");
  const [empresaId, setEmpresaId] = useState<number | undefined>();

  // Ao abrir: a empresa da seção Importador, se tiver chave; senão, a única disponível
  useEffect(() => {
    if (!open) return;
    const sugerida = empresasComChave.find((e) => e.id === empresaSugeridaId);
    setEmpresaId(sugerida?.id ?? (empresasComChave.length === 1 ? empresasComChave[0].id : undefined));
  }, [open, empresaSugeridaId, empresasComChave]);

  const empresa = empresasComChave.find((e) => e.id === empresaId);

  const escolher = (arquivo?: File) => {
    if (arquivo) onArquivo(arquivo);
    if (inputRef.current) inputRef.current.value = "";
  };

  const soltar = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setArrastando(false);
    if (!processando) escolher(e.dataTransfer.files?.[0]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-brand-navy">Importar DI / DUIMP</DialogTitle>
          <DialogDescription>
            Envie o XML da DI exportado do Siscomex ou o PDF do extrato da DUIMP emitido no Portal Único.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          accept=".xml,.pdf,application/xml,text/xml,application/pdf"
          className="hidden"
          onChange={(e) => escolher(e.target.files?.[0])}
        />
        <button
          type="button"
          disabled={processando}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
          onDragLeave={() => setArrastando(false)}
          onDrop={soltar}
          className={cn(
            "flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            arrastando ? "border-brand-sky bg-brand-sky-soft" : "border-input hover:border-brand-sky/60 hover:bg-brand-sky-soft/50",
            processando && "cursor-wait opacity-70",
          )}
        >
          {processando ? (
            <Loader2 className="size-8 animate-spin text-brand-sky" />
          ) : (
            <UploadCloud className="size-8 text-brand-sky" strokeWidth={1.75} />
          )}
          <span className="text-sm font-medium text-brand-navy">
            {processando ? "Lendo a declaração…" : "Arraste o arquivo ou clique para selecionar"}
          </span>
          <span className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1">
              <FileCode2 className="size-3.5" /> DI · .xml
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1">
              <FileText className="size-3.5" /> DUIMP · .pdf
            </span>
          </span>
        </button>

        <Collapsible>
          <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-lg px-1 py-2 text-sm font-medium text-muted-foreground hover:text-brand-navy">
            <span className="flex items-center gap-2"><Link2 className="size-4" /> Consultar DUIMP pela API do Portal Único</span>
            <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-2">
            <p className="rounded-xl bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
              A consulta usa a chave de acesso do Portal Único cadastrada na empresa (seção Importador › Cadastro da empresa)
              e traz todos os itens, com valor aduaneiro e tributos, para o cálculo do ICMS.
            </p>

            {empresasComChave.length === 0 ? (
              <p className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                Nenhuma empresa com chave de acesso disponível para você. Cadastre a chave em Importador › Cadastro da empresa.
              </p>
            ) : empresasComChave.length === 1 ? (
              <p className="flex items-center gap-2 text-sm">
                <KeyRound className="size-4 shrink-0 text-brand-sky" />
                <span>Chave de acesso de <strong className="font-medium">{empresasComChave[0].razaoSocial}</strong></span>
              </p>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="api-empresa">Empresa (chave de acesso)</Label>
                <Select value={empresaId ? String(empresaId) : ""} onValueChange={(v) => setEmpresaId(Number(v))}>
                  <SelectTrigger id="api-empresa" className="w-full">
                    <SelectValue placeholder="Escolha a empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {empresasComChave.map((e) => (
                      <SelectItem key={e.id} value={String(e.id)}>{e.razaoSocial}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-[1fr_96px] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="api-numero">Número da DUIMP</Label>
                <Input id="api-numero" placeholder="26BR0000000000-0" value={numeroDuimp} onChange={(e) => setNumeroDuimp(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="api-versao">Versão</Label>
                <Input id="api-versao" inputMode="numeric" placeholder="vigente" value={versaoDuimp} onChange={(e) => setVersaoDuimp(e.target.value)} />
              </div>
            </div>
            <Button
              className="w-full"
              disabled={!numeroDuimp.trim() || !empresa || consultandoAPI}
              onClick={() => empresa && onConsultarAPI({ numeroDuimp: numeroDuimp.trim(), versaoDuimp: versaoDuimp.trim() || undefined, importadorId: empresa.id })}
            >
              {consultandoAPI ? <Loader2 className="animate-spin" /> : <Link2 />}
              {consultandoAPI ? "Consultando o Portal Único…" : "Consultar DUIMP"}
            </Button>
          </CollapsibleContent>
        </Collapsible>
      </DialogContent>
    </Dialog>
  );
}
