import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import type { EstadoConsultaSefaz } from "@/components/glme/SituacaoCadastral";
import { cadastroDaUF } from "@shared/sefazUF";

/**
 * Inscrição estadual e situação cadastral na SEFAZ da UF (certificado A1 do servidor).
 * Sem webservice na UF, o estado "sem_servico" leva a tela a mostrar o link de consulta.
 * Devolve a inscrição encontrada (a habilitada, se houver) para quem chamou preencher o campo.
 */
export function useConsultaSefaz() {
  const [consulta, setConsulta] = useState<EstadoConsultaSefaz>({ estado: "inativo" });
  const mutation = trpc.sefaz.consultarCadastro.useMutation();

  const consultar = async (cnpj: string, ufInformada: string): Promise<string | undefined> => {
    const uf = (ufInformada || "").trim().toUpperCase();
    const cadastro = cadastroDaUF(uf);
    if (!cadastro) {
      setConsulta({ estado: "erro", uf: uf || "UF", mensagem: "Informe a UF da empresa para consultar a inscrição estadual." });
      return undefined;
    }
    if (!cadastro.webservice) {
      setConsulta({ estado: "sem_servico", uf });
      return undefined;
    }
    setConsulta({ estado: "consultando", uf });
    try {
      const r = await mutation.mutateAsync({ cnpj, uf });
      if (!r.encontrado) {
        setConsulta({ estado: "nao_encontrado", uf, mensagem: r.mensagem || "CNPJ sem cadastro de contribuinte do ICMS." });
        return undefined;
      }
      setConsulta({ estado: "encontrado", uf, cadastros: r.cadastros });
      const principal = r.cadastros.find((c) => c.habilitado) ?? r.cadastros[0];
      if (principal && !principal.habilitado) {
        toast.warning(`Inscrição estadual ${principal.inscricaoEstadual} não habilitada na SEFAZ-${uf}.`);
      }
      return principal?.inscricaoEstadual || undefined;
    } catch (e: any) {
      setConsulta({
        estado: "erro",
        uf,
        mensagem: e?.message || "Falha na consulta.",
        semCertificado: e?.data?.code === "PRECONDITION_FAILED",
      });
      return undefined;
    }
  };

  const limpar = () => setConsulta({ estado: "inativo" });

  return { consulta, consultar, limpar };
}
