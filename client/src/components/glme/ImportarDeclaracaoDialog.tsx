import { ChevronDown, FileCode2, FileText, Link2, Loader2, UploadCloud } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface ConsultaDuimpAPI {
  numeroDuimp: string;
  versaoDuimp: string;
  clientId: string;
  clientSecret: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Recebe o arquivo escolhido: .xml (DI) ou .pdf (extrato da DUIMP). */
  onArquivo: (arquivo: File) => void;
  processando: boolean;
  onConsultarAPI: (dados: ConsultaDuimpAPI) => void;
  consultandoAPI: boolean;
}

export function ImportarDeclaracaoDialog({ open, onOpenChange, onArquivo, processando, onConsultarAPI, consultandoAPI }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [api, setApi] = useState<ConsultaDuimpAPI>({ numeroDuimp: "", versaoDuimp: "0", clientId: "", clientSecret: "" });

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
            <p className="rounded-xl bg-secondary px-3 py-2 text-xs text-muted-foreground">
              Requer credenciais de acesso à API do Portal Único (clientId e clientSecret), vinculadas a certificado ICP-Brasil.
            </p>
            <div className="grid grid-cols-[1fr_88px] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="api-numero">Número da DUIMP</Label>
                <Input id="api-numero" placeholder="25BR0000000000-0" value={api.numeroDuimp} onChange={(e) => setApi({ ...api, numeroDuimp: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="api-versao">Versão</Label>
                <Input id="api-versao" value={api.versaoDuimp} onChange={(e) => setApi({ ...api, versaoDuimp: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="api-client-id">Client ID</Label>
              <Input id="api-client-id" autoComplete="off" value={api.clientId} onChange={(e) => setApi({ ...api, clientId: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="api-client-secret">Client Secret</Label>
              <Input id="api-client-secret" type="password" autoComplete="off" value={api.clientSecret} onChange={(e) => setApi({ ...api, clientSecret: e.target.value })} />
            </div>
            <Button
              className="w-full"
              disabled={!api.numeroDuimp || !api.clientId || !api.clientSecret || consultandoAPI}
              onClick={() => onConsultarAPI({ ...api, versaoDuimp: api.versaoDuimp || "0" })}
            >
              {consultandoAPI ? <Loader2 className="animate-spin" /> : <Link2 />}
              {consultandoAPI ? "Consultando…" : "Consultar DUIMP"}
            </Button>
          </CollapsibleContent>
        </Collapsible>
      </DialogContent>
    </Dialog>
  );
}
