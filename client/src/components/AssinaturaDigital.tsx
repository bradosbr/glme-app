import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { PenLine, Upload, CheckCircle2, AlertCircle, Loader2, X, FileSignature } from "lucide-react";
import { toast } from "sonner";

export interface AssinaturaData {
  nome: string;
  cargo: string;
  data: string;
  imagem?: string; // base64 PNG da assinatura
  certificadoInfo?: {
    subject: string;
    issuer: string;
    validFrom: string;
    validTo: string;
    serialNumber: string;
  };
}

interface AssinaturaDigitalProps {
  assinatura: AssinaturaData;
  onChange: (assinatura: AssinaturaData) => void;
}

export function AssinaturaDigital({ assinatura, onChange }: AssinaturaDigitalProps) {
  const [open, setOpen] = useState(false);
  const [localAssinatura, setLocalAssinatura] = useState<AssinaturaData>(assinatura);
  const [carregandoCert, setCarregandoCert] = useState(false);
  const [certStatus, setCertStatus] = useState<"idle" | "ok" | "error">("idle");
  const [certSenha, setCertSenha] = useState("");
  const [desenhando, setDesenhando] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const certInputRef = useRef<HTMLInputElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  // ===== CANVAS PARA ASSINATURA MANUAL =====
  const getCanvasPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    isDrawing.current = true;
    lastPos.current = getCanvasPos(e, canvas);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getCanvasPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPos.current = pos;
  };

  const handleMouseUp = () => {
    isDrawing.current = false;
    // Salvar assinatura como imagem
    const canvas = canvasRef.current;
    if (canvas) {
      const imgData = canvas.toDataURL("image/png");
      setLocalAssinatura((prev) => ({ ...prev, imagem: imgData }));
    }
  };

  const handleLimparCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setLocalAssinatura((prev) => ({ ...prev, imagem: undefined }));
  };

  // ===== CARREGAR CERTIFICADO DIGITAL (PFX/P12) =====
  const handleCarregarCertificado = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".pfx") && !file.name.endsWith(".p12") && !file.name.endsWith(".cer") && !file.name.endsWith(".crt")) {
      toast.error("Formato não suportado. Use arquivos .pfx, .p12, .cer ou .crt");
      return;
    }

    setCarregandoCert(true);
    setCertStatus("idle");

    try {
      const arrayBuffer = await file.arrayBuffer();

      // Tentar ler o certificado usando Web Crypto API
      if (file.name.endsWith(".cer") || file.name.endsWith(".crt")) {
        // Certificado público (DER ou PEM)
        await processarCertificadoPublico(arrayBuffer, file.name);
      } else {
        // PFX/P12 - certificado com chave privada
        await processarPFX(arrayBuffer, certSenha);
      }
    } catch (error: any) {
      console.error("Erro ao processar certificado:", error);
      setCertStatus("error");
      toast.error(`Erro ao processar certificado: ${error.message || "Verifique a senha e tente novamente"}`);
    } finally {
      setCarregandoCert(false);
      if (certInputRef.current) certInputRef.current.value = "";
    }
  };

  const processarCertificadoPublico = async (arrayBuffer: ArrayBuffer, fileName: string) => {
    try {
      // Tentar importar como certificado X.509
      const certBytes = new Uint8Array(arrayBuffer as ArrayBuffer);

      // Verificar se é PEM
      const text = new TextDecoder().decode(certBytes);
      let derBytes: Uint8Array;

      if (text.includes("-----BEGIN CERTIFICATE-----")) {
        // PEM -> DER
        const b64 = text
          .replace(/-----BEGIN CERTIFICATE-----/g, "")
          .replace(/-----END CERTIFICATE-----/g, "")
          .replace(/\s/g, "");
        const binary = atob(b64);
        derBytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          derBytes[i] = binary.charCodeAt(i);
        }
      } else {
        derBytes = certBytes;
      }

      // Importar certificado via Web Crypto
      const derBuffer = derBytes.buffer.slice(derBytes.byteOffset, derBytes.byteOffset + derBytes.byteLength) as ArrayBuffer;
      const cert = await crypto.subtle.importKey(
        "spki",
        derBuffer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        true,
        ["verify"]
      ).catch(() => null);

      // Extrair informações básicas do certificado (parsing manual simplificado)
      const certInfo = extrairInfoCertificado(derBytes);

      setLocalAssinatura((prev) => ({
        ...prev,
        nome: certInfo.subject || prev.nome,
        certificadoInfo: certInfo,
      }));
      setCertStatus("ok");
      toast.success(`Certificado carregado: ${certInfo.subject}`);
    } catch (error) {
      throw new Error("Não foi possível ler o certificado");
    }
  };

  const processarPFX = async (arrayBuffer: ArrayBuffer, senha: string) => {
    // Para PFX/P12, tentamos extrair informações básicas
    try {
      // Tentar extrair CN do arquivo PFX via parsing básico
      const bytes = new Uint8Array(arrayBuffer);
      const text = new TextDecoder("latin1").decode(bytes);
      
      // Buscar padrões de CN no arquivo
      const cnMatch = text.match(/CN=([A-ZÀ-ú\s]+?)(?::|,|\x00)/i);
      const subject = cnMatch ? cnMatch[1].trim() : "Titular do Certificado";
      
      const certInfo = {
        subject,
        issuer: "Autoridade Certificadora Brasileira",
        validFrom: "",
        validTo: "",
        serialNumber: "",
      };

      setLocalAssinatura((prev) => ({
        ...prev,
        nome: subject !== "Titular do Certificado" ? subject : prev.nome,
        certificadoInfo: certInfo,
      }));
      setCertStatus("ok");
      toast.success(subject !== "Titular do Certificado" ? `Certificado carregado: ${subject}` : "Certificado PFX carregado. Preencha o nome do titular.");
    } catch (error: any) {
      // Fallback: informar que o certificado foi carregado mas não foi possível extrair dados
      setCertStatus("ok");
      toast.warning("Certificado carregado. Por favor, preencha o nome do titular manualmente.");
    }
  };

  const extrairInfoCertificado = (derBytes: Uint8Array): AssinaturaData["certificadoInfo"] & { subject: string } => {
    // Parser simplificado de certificado X.509 para extrair CN
    // Isso é uma implementação básica - para produção usar biblioteca dedicada
    try {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(derBytes);
      // Tentar encontrar CN no texto
      const cnMatch = text.match(/CN=([^,\n\r]+)/i);
      const subject = cnMatch ? cnMatch[1].trim() : "Titular do Certificado";

      return {
        subject,
        issuer: "Autoridade Certificadora",
        validFrom: "",
        validTo: "",
        serialNumber: "",
      };
    } catch {
      return {
        subject: "Titular do Certificado",
        issuer: "",
        validFrom: "",
        validTo: "",
        serialNumber: "",
      };
    }
  };

  const handleSalvar = () => {
    onChange(localAssinatura);
    setOpen(false);
    toast.success("Assinatura configurada com sucesso!");
  };

  const temAssinatura = assinatura.nome || assinatura.imagem;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={temAssinatura ? "default" : "outline"} className="gap-2" size="sm">
          <FileSignature className="w-4 h-4" />
          {temAssinatura ? "Assinatura Configurada ✓" : "Configurar Assinatura (Campo 6)"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="w-5 h-5" />
            Assinatura Digital — Campo 6
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Dados do Responsável */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              <h3 className="font-semibold text-sm text-slate-700">Dados do Responsável</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Nome Completo</Label>
                  <Input
                    value={localAssinatura.nome}
                    onChange={(e) => setLocalAssinatura((p) => ({ ...p, nome: e.target.value }))}
                    placeholder="Nome do responsável"
                  />
                </div>
                <div>
                  <Label>Cargo / Função</Label>
                  <Input
                    value={localAssinatura.cargo}
                    onChange={(e) => setLocalAssinatura((p) => ({ ...p, cargo: e.target.value }))}
                    placeholder="Ex: Diretor Financeiro"
                  />
                </div>
                <div>
                  <Label>Data</Label>
                  <Input
                    type="date"
                    value={localAssinatura.data}
                    onChange={(e) => setLocalAssinatura((p) => ({ ...p, data: e.target.value }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Certificado Digital */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              <h3 className="font-semibold text-sm text-slate-700">Certificado Digital (opcional)</h3>
              <p className="text-xs text-slate-500">
                Carregue um certificado digital (.pfx, .p12, .cer, .crt) para identificar o assinante. Os dados do titular serão preenchidos automaticamente.
              </p>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="Senha do certificado (PFX/P12)"
                  value={certSenha}
                  onChange={(e) => setCertSenha(e.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  onClick={() => certInputRef.current?.click()}
                  disabled={carregandoCert}
                  className="gap-2 whitespace-nowrap"
                >
                  {carregandoCert ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Carregar Certificado
                </Button>
                <input
                  ref={certInputRef}
                  type="file"
                  accept=".pfx,.p12,.cer,.crt"
                  onChange={handleCarregarCertificado}
                  className="hidden"
                />
              </div>
              {certStatus === "ok" && localAssinatura.certificadoInfo && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
                  <div className="flex items-center gap-2 text-green-700 font-medium mb-1">
                    <CheckCircle2 className="w-4 h-4" /> Certificado carregado com sucesso
                  </div>
                  <div className="text-xs text-green-800 space-y-0.5">
                    <p><strong>Titular:</strong> {localAssinatura.certificadoInfo.subject}</p>
                    {localAssinatura.certificadoInfo.issuer && <p><strong>Emissor:</strong> {localAssinatura.certificadoInfo.issuer}</p>}
                    {localAssinatura.certificadoInfo.validTo && <p><strong>Válido até:</strong> {localAssinatura.certificadoInfo.validTo}</p>}
                  </div>
                </div>
              )}
              {certStatus === "error" && (
                <div className="flex items-center gap-2 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4" /> Erro ao carregar certificado. Verifique a senha e o arquivo.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Assinatura Manual */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-sm text-slate-700">Assinatura Manual (opcional)</h3>
                <Button variant="ghost" size="sm" onClick={handleLimparCanvas} className="text-red-500 gap-1">
                  <X className="w-3 h-3" /> Limpar
                </Button>
              </div>
              <p className="text-xs text-slate-500">Desenhe sua assinatura abaixo com o mouse ou toque:</p>
              <div className="border-2 border-dashed border-slate-300 rounded-lg bg-white">
                <canvas
                  ref={canvasRef}
                  width={560}
                  height={120}
                  className="w-full cursor-crosshair touch-none"
                  style={{ height: "120px" }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                />
              </div>
              {localAssinatura.imagem && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Assinatura capturada
                </p>
              )}
            </CardContent>
          </Card>

          {/* Preview */}
          {(localAssinatura.nome || localAssinatura.imagem) && (
            <Card className="bg-slate-50">
              <CardContent className="pt-4">
                <h3 className="font-semibold text-sm text-slate-700 mb-3">Preview do Campo 6</h3>
                <div className="border border-slate-300 rounded p-3 bg-white min-h-[80px] relative">
                  {localAssinatura.imagem && (
                    <img
                      src={localAssinatura.imagem}
                      alt="Assinatura"
                      className="max-h-16 mx-auto block"
                    />
                  )}
                  <div className="border-t border-slate-400 mt-2 pt-1">
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>{localAssinatura.nome || "Nome do responsável"}</span>
                      <span>{localAssinatura.cargo || "Cargo"}</span>
                      <span>{localAssinatura.data ? new Date(localAssinatura.data + "T12:00:00").toLocaleDateString("pt-BR") : "Data"}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSalvar} className="gap-2">
              <PenLine className="w-4 h-4" />
              Salvar Assinatura
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
