# Formulário GLME - TODO

## Funcionalidades Iniciais
- [x] Formulário GLME com abas organizadas
- [x] Lista suspensa de UF no item 1
- [x] Lista suspensa de empresas no item 2.2 com preenchimento automático (2.2-2.9)
- [x] Checkboxes para DI, DSI, DA no item 4
- [x] Campo de texto 4.1 sincronizado com 5.1
- [x] Campo de texto 4.3 sincronizado com 5.5
- [x] Lista suspensa de UF no item 4.6
- [x] Texto completo no item 5.4 com campo XXX/XXXX editável
- [x] Cálculos automáticos ICMS (VT, VTI, VF)
- [x] Persistência de dados no localStorage
- [x] Exportar/Importar JSON
- [x] Limpar formulário

## Funcionalidades Avançadas
- [x] Cadastro de importador com busca por CNPJ (BrasilAPI + ReceitaWS)
- [x] Campo de edital DBF no cadastro de importador
- [x] Banco de dados para importadores cadastrados
- [x] Lista dinâmica de recintos alfandegados (portos, portos secos, aeroportos)
- [x] Recintos agrupados por tipo no dropdown
- [x] Preenchimento automático de UF ao selecionar recinto
- [x] Importação de DI via XML com extração de dados automática
- [x] Preenchimento automático de Importador, Produtos e Cálculo ICMS a partir da DI
- [x] Testes automatizados (9 testes passando)

## Pendente / Futuro
- [ ] Exportação para PDF com layout oficial da GLME
- [ ] Importação de DI via PDF (OCR)
- [ ] Validação de CNPJ com dígito verificador
- [ ] Histórico de formulários preenchidos
- [ ] Autenticação de usuários

## Melhorias v3
- [x] Adicionar recintos ICTSI RIO Brasil Terminal e Multirio Terminais RJ com códigos corretos
- [x] Guia 5 Produtos: remover sincronização item 5.1 com 4.1
- [x] Guia 5 Produtos: remover campo NCM visível
- [x] Guia 5 Produtos: ocultar campos 5.4 e 5.5 (manter dados internos para PDF)
- [x] Importar XML: somente XML, extrair apenas adições (número e NCM)
- [x] Item 5.4: caixa de texto para inclusão manual abaixo do texto ICMS Diferido
- [x] Gerar GLME em PDF com layout oficial
- [x] Assinatura digital via certificado no campo 6 e exportar PDF assinado
- [x] 14 testes automatizados passando

## PDF Layout Oficial
- [x] Recriar PDF com layout idêntico ao .docx original (cores, bordas, tabelas, fontes) - 15 testes passando

## PDF - Campo 5.4
- [x] Ajustar campo 5.4 no PDF: texto ICMS Diferido e cálculos em linhas separadas para melhor legibilidade - 15 testes passando

## Melhorias v4
- [x] Renomear guias: 1-Estado de Recolhimento, 2-Importador/Adquirente, 3-Dados da Declaração, 4-Adições, 6-ICMS
- [x] Guia 2: criar campos do item 3 (Adquirente) com checkbox "dados iguais ao Importador"
- [x] Remover opção de Assinatura Digital
- [x] Remover botões Exportar JSON e Importar JSON
- [x] Corrigir importação XML (parser robusto com múltiplos formatos SISCOMEX)
- [x] PDF: células fixas (5.1-5.5) sem alterar layout, continuar no verso se ultrapassar
- [x] PDF: centralizar texto nas células 5.1-5.5
- [x] PDF: aumentar fonte do item 5.4 em 3 pontos
- [x] 18 testes automatizados passando

## Melhorias v5
- [x] Atualizar parser XML para extrair todos os campos do padrão SISCOMEX real
- [x] Renomear guia 6 para "5 - ICMS"
- [x] Mapear e importar: importador completo (nome, CNPJ, endereço, bairro, CEP, município, UF, telefone, representante legal)
- [x] Mapear e importar: dados da declaração (número DI, data registro, valor CIF em reais, recinto, UF desembaraço)
- [x] Mapear e importar: adições (número, NCM, descrição, valor aduaneiro)
- [x] Mapear e importar: informações complementares (frete, seguro, CIF em USD e BRL)
- [x] 27 testes automatizados passando

## Melhorias v6
- [x] PDF: mesclar células do item 5.4 em ambas as páginas (texto ICMS Diferido + Cálculo)
- [x] PDF: mesclar células do item 5.5 e repetir valor do item 4.3
- [x] Adições: ordenar por ordem numérica crescente (no formulário e no PDF)
- [x] Importar XML: ao extrair CNPJ, realizar consulta automática e preencher todos os dados do importador
- [x] Item 4.4: remover lista suspensa, exibir apenas o resultado da importação XML
- [x] Importar XML: somar I.I + I.P.I + PIS/PASEP + COFINS + Taxa SISCOMEX e colocar em Impostos (Guia 5)
- [x] 27 testes passando

## Melhorias v7
- [x] Item 4.2: vincular data do registro ao campo dataRegistro importado do XML (converte DD/MM/YYYY → YYYY-MM-DD)
- [x] Item 4.3: exibir o valor VMLD (CIF em R$) importado do XML
- [x] Item 5.3 (guia 4): definir "3 - Diferimento" como valor padrão (estado inicial, addProduto e importação XML)
- [x] 27 testes passando

## Melhorias v8
- [x] Ao importar XML: verificar CNPJ no cadastro interno de importadores primeiro; se encontrado usar dados cadastrados, caso contrário buscar na Receita Federal (BrasilAPI) - 27 testes passando

## Melhorias v9 (Filtragem Lista Negativa Edital 060/2025)
- [x] Extrair tabela de NCMs e alíquotas do PDF Anexo I (ALIQUOTASICMS-PE.pdf)
- [x] Extrair lista negativa de 509 NCMs do Edital 060/2025
- [x] Parser XML: extrair impostos individuais por adição (II, IPI, PIS, COFINS)
- [x] Ao importar XML: NCMs da lista negativa → remover da guia 4, gerar texto na guia 5
- [x] Alíquota: usar Anexo I se NCM constar; caso contrário usar 20,5% padrão
- [x] Cálculo: (II + IPI + PIS + COFINS da adição + Taxa SISCOMEX/qtd adições) × alíquota
- [x] Texto automático: "ADIÇÃO [X] - TRIBUTAÇÃO NORMAL - ALIQUOTA [X]% - VALOR DO ICMS - R$ [X]" + explicação
- [x] 32 testes automatizados passando

## Melhorias v9 - Correção Cálculo ICMS Lista Negativa
- [x] Corrigir fórmula: (II + IPI + PIS + COFINS + Taxa SISCOMEX de 1 adição) ÷ 0,795 × alíquota
- [x] Verificar alíquota pelos 4 primeiros dígitos da NCM no Anexo I (não 8 dígitos)
- [x] Texto: "ADIÇÃO [X] - TRIBUTAÇÃO NORMAL - ALIQUOTA [X]% - VALOR DO ICMS - R$ [X]\nA ADIÇÃO [X] É RECOLHIMENTO INTEGRAL, POR ISSO ELA NÃO CONSTA NA GLME."
- [x] 35 testes automatizados passando

## Melhorias v9 - Correção Fórmula ICMS com VCMV e Taxa FOB
- [x] Extrair VCMV (condicaoVendaValorMoeda) por adição do XML (valor em moeda estrangeira)
- [x] Calcular taxa de câmbio FOB USD→BRL (valorFOBReais / valorFOBDolar do informacaoComplementar)
- [x] Fórmula: (VCMV_USD × taxaFOB + II + IPI + PIS + COFINS + Taxa_SISCOMEX/adições) ÷ 0,795 × alíquota
- [x] 39 testes automatizados passando

## Melhorias v9 - Correção Extração Taxa FOB USD
- [x] Investigar campos de taxa de câmbio no XML SISCOMEX: campo condicaoVendaTaxaCambio (15 dígitos, ÷ 100000)
- [x] Extrair taxa FOB USD do campo condicaoVendaTaxaCambio de cada adição (prioridade) + fallback do informacaoComplementar
- [x] Atualizar fórmula para usar taxaCambio da adição individual
- [x] 42 testes automatizados passando

## Melhorias v9 - Correção Fórmula ICMS v3 (Base de Cálculo)
- [x] Substituir VCMV×taxaFOB por Base de Cálculo da Adição R$ (valorAduaneiro = iiBaseCalculo do XML)
- [x] Nova fórmula: (BaseCalculo + II + IPI + PIS + COFINS + TaxaSISCOMEX) ÷ 0,795 × alíquota
- [x] 48 testes automatizados passando

## Melhorias v10 - Auto-shrink campo 5.4 no PDF
- [x] Localizar geração do campo 5.4 (Texto Adicional ICMS) no gerador de PDF (glmePDF.ts)
- [x] Implementar auto-shrink: calcHeight54() mede altura necessária; render54() reduz escala em passos de 0.05 até caber (mínimo 40% do tamanho original)

## Bug Fix - Chamadas fetch manuais com formato tRPC incorreto
- [x] Corrigir fetch importadores.buscarPorCNPJ: usar formato batch correto {"0":{"json":{...}}} + credentials:include
- [x] Corrigir fetch cnpj.buscar: usar formato batch correto {"0":{"json":{...}}} + credentials:include
- [x] Corrigir extração da resposta: json?.[0]?.result?.data?.json ?? json?.[0]?.result?.data

## Feature - Importação DUIMP (v11)
- [x] Parser de PDF DUIMP no servidor (server/duimpParser.ts) - extrai importador, adições, NCM, impostos, taxa SISCOMEX
- [x] Endpoint tRPC duimp.parsearPDF - recebe base64 do PDF e retorna dados estruturados
- [x] Endpoint tRPC duimp.consultarAPI - proxy para API do Portal Único (requer certificado ICP-Brasil)
- [x] Botão "Importar DUIMP" na barra de ações do formulário
- [x] Modal com duas abas: Via PDF (upload) e Via API (número + clientId + clientSecret)
- [x] Preenchimento automático do formulário com dados da DUIMP (importador, adições, lista negativa)
- [x] 52 testes automatizados passando (4 novos testes para o parser DUIMP)
