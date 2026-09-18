/**
 * Consulta de inscrição estadual por UF.
 *
 * - `webservice`: CadConsultaCadastro4 (NF-e 4.00), consulta automática com certificado A1.
 *   Fonte: Portal da NF-e, "Relação de Serviços Web" (nfe.fazenda.gov.br/portal/webServices.aspx),
 *   conferida em 18/09/2026. AC, ES, PB, RN e SC usam a SEFAZ Virtual do RS (SVRS);
 *   AL, AP, CE, DF, MA, PA, PI, RJ, RO, RR, SE e TO não oferecem o serviço.
 * - `consulta`: página pública de consulta da SEFAZ (portal nacional do SINTEGRA,
 *   sintegra.gov.br, com endereços atualizados quando o do portal estava fora do ar).
 */

export interface CadastroUF {
  nome: string;
  webservice?: string;
  /** Autorizador que atende a UF, quando não é a própria SEFAZ. */
  autorizador?: "SVRS";
  consulta: string;
}

const SVRS = "https://cad.svrs.rs.gov.br/ws/cadconsultacadastro/cadconsultacadastro4.asmx";

/** Cadastro Centralizado de Contribuintes: todas as UFs, exige login gov.br. */
export const LINK_CCC = "https://dfe-portal.svrs.rs.gov.br/NFE/CCC";

export const CADASTRO_UF: Record<string, CadastroUF> = {
  AC: { nome: "Acre", webservice: SVRS, autorizador: "SVRS", consulta: "https://sefazonline.ac.gov.br/sefazonline/app.wmsintegralista" },
  AL: { nome: "Alagoas", consulta: "https://sintegra.sefaz.al.gov.br/" },
  AP: { nome: "Amapá", consulta: "https://virtual.sefaz.ap.gov.br/sefazvirtual/cadastro-de-contribuintes/consultas/dados-do-contribuinte" },
  AM: { nome: "Amazonas", webservice: "https://nfe.sefaz.am.gov.br/services2/services/CadConsultaCadastro4", consulta: "http://online.sefaz.am.gov.br/sintegra/" },
  BA: { nome: "Bahia", webservice: "https://nfe.sefaz.ba.gov.br/webservices/CadConsultaCadastro4/CadConsultaCadastro4.asmx", consulta: "https://portal.sefaz.ba.gov.br/scripts/cadastro/cadastroBa/consultaBa.asp" },
  CE: { nome: "Ceará", consulta: "https://internet-consultapublica.apps.sefaz.ce.gov.br/sintegra/preparar-consultar" },
  DF: { nome: "Distrito Federal", consulta: "https://ww1.receita.fazenda.df.gov.br/icms/sintegra-consulta" },
  ES: { nome: "Espírito Santo", webservice: SVRS, autorizador: "SVRS", consulta: "http://www.sintegra.es.gov.br/" },
  GO: { nome: "Goiás", webservice: "https://nfe.sefaz.go.gov.br/nfe/services/CadConsultaCadastro4", consulta: "https://appasp.sefaz.go.gov.br/Sintegra/Consulta/default.html" },
  MA: { nome: "Maranhão", consulta: "https://aplicacoes.ma.gov.br/sintegra/jsp/consultaSintegra/consultaSintegraFiltro.jsf" },
  MT: { nome: "Mato Grosso", webservice: "https://nfe.sefaz.mt.gov.br/nfews/v2/services/CadConsultaCadastro4", consulta: "https://www.sefaz.mt.gov.br/cadastro/emissaocartao/emissaocartaocontribuinteacessodireto" },
  MS: { nome: "Mato Grosso do Sul", webservice: "https://nfe.sefaz.ms.gov.br/ws/CadConsultaCadastro4", consulta: "https://servicos.efazenda.ms.gov.br/consultapublica" },
  // O SINTEGRA de MG encaminha para o CCC nacional
  MG: { nome: "Minas Gerais", webservice: "https://nfe.fazenda.mg.gov.br/nfe2/services/CadConsultaCadastro4", consulta: LINK_CCC },
  PA: { nome: "Pará", consulta: "https://app.sefa.pa.gov.br/Sintegra/" },
  PB: { nome: "Paraíba", webservice: SVRS, autorizador: "SVRS", consulta: "https://www4.sefaz.pb.gov.br/sintegra/" },
  PR: { nome: "Paraná", webservice: "https://nfe.sefa.pr.gov.br/nfe/CadConsultaCadastro4", consulta: "http://www.sintegra.fazenda.pr.gov.br/sintegra/" },
  PE: { nome: "Pernambuco", webservice: "https://nfe.sefaz.pe.gov.br/nfe-service/services/CadConsultaCadastro4", consulta: "http://www.sintegra.sefaz.pe.gov.br/" },
  // A SEFAZ-PI orienta a consulta pelo CCC nacional
  PI: { nome: "Piauí", consulta: LINK_CCC },
  RJ: { nome: "Rio de Janeiro", consulta: "https://sucief-sincad-web.fazenda.rj.gov.br/sincad-web/index.jsf" },
  RN: { nome: "Rio Grande do Norte", webservice: SVRS, autorizador: "SVRS", consulta: "http://www.set.rn.gov.br/uvt/consultacontribuinte.aspx" },
  RS: { nome: "Rio Grande do Sul", webservice: SVRS, consulta: "https://www.sefaz.rs.gov.br/consultas/contribuinte" },
  RO: { nome: "Rondônia", consulta: "https://portalcontribuinte.sefin.ro.gov.br/Publico/parametropublica.jsp" },
  RR: { nome: "Roraima", consulta: "https://portalweb.sefaz.rr.gov.br/sintegra/servlet/wp_siate_consultasintegra" },
  SC: { nome: "Santa Catarina", webservice: SVRS, autorizador: "SVRS", consulta: "https://sat.sef.sc.gov.br/tax.NET/Sat.Cadastro.Web/ComprovanteIE/Consulta.aspx" },
  SP: { nome: "São Paulo", webservice: "https://nfe.fazenda.sp.gov.br/ws/cadconsultacadastro4.asmx", consulta: "https://www.cadesp.fazenda.sp.gov.br/Pages/Cadastro/Consultas/ConsultaPublica/ConsultaPublica.aspx" },
  SE: { nome: "Sergipe", consulta: "https://security.sefaz.se.gov.br/SIC/sintegra/index.jsp" },
  TO: { nome: "Tocantins", consulta: "https://sintegra.sefaz.to.gov.br/" },
};

export const UFS_COM_WEBSERVICE = Object.keys(CADASTRO_UF).filter((uf) => CADASTRO_UF[uf].webservice);

export function cadastroDaUF(uf: string | undefined | null): CadastroUF | undefined {
  return uf ? CADASTRO_UF[uf.trim().toUpperCase()] : undefined;
}

/** Link da página pública de consulta da SEFAZ da UF (ou o CCC, quando a UF é desconhecida). */
export function linkConsultaIE(uf: string | undefined | null): string {
  return cadastroDaUF(uf)?.consulta ?? LINK_CCC;
}
