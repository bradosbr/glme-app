import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ValoresAdicaoForm } from "@/hooks/useGLMEForm";

const CAMPOS: { campo: keyof ValoresAdicaoForm; rotulo: string; passo?: string }[] = [
  { campo: "valorAduaneiro", rotulo: "Valor aduaneiro" },
  { campo: "ii", rotulo: "II" },
  { campo: "ipi", rotulo: "IPI" },
  { campo: "pis", rotulo: "PIS" },
  { campo: "cofins", rotulo: "COFINS" },
  { campo: "pesoLiquido", rotulo: "Peso líquido (kg)", passo: "0.001" },
  { campo: "aliquota", rotulo: "Alíquota ICMS (%)", passo: "0.01" },
];

interface Props {
  id: string;
  valores?: ValoresAdicaoForm;
  /** Alíquota consultada pela NCM, mostrada como sugestão no campo de alíquota. */
  aliquotaConsultada?: number;
  onChange: (campo: keyof ValoresAdicaoForm, valor: string) => void;
}

/** Valores da adição usados no cálculo do ICMS (R$), preenchidos pela DI/DUIMP. */
export function ValoresAdicao({ id, valores, aliquotaConsultada, onChange }: Props) {
  return (
    <fieldset className="rounded-xl border border-dashed px-3 pb-3 pt-2">
      <legend className="px-1 text-[13px] font-medium text-muted-foreground">Valores para o cálculo do ICMS · R$</legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {CAMPOS.map(({ campo, rotulo, passo }) => (
          <div key={campo} className="space-y-1">
            <Label htmlFor={`${id}-${campo}`} className="text-xs font-medium text-muted-foreground">{rotulo}</Label>
            <Input
              id={`${id}-${campo}`}
              type="number"
              inputMode="decimal"
              step={passo ?? "0.01"}
              min="0"
              value={valores?.[campo] ?? ""}
              onChange={(e) => onChange(campo, e.target.value)}
              placeholder={campo === "aliquota" && aliquotaConsultada !== undefined ? String(aliquotaConsultada).replace(".", ",") : "0,00"}
              title={campo === "aliquota" ? "Em branco usa a alíquota da NCM; preencha só se a SEFAZ aplicar outra." : undefined}
              className="h-9 tabular-nums"
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}
