import { query, execute, Agente } from "./db";
import { buscarContatos } from "./evolution";
import { geoDoNumero } from "./ddd";
import { regiaoMaisProxima } from "./opcoes";

// ============================================================
// Sincronizador de contatos: puxa a caixa de entrada inteira de uma instância
// Evolution e grava em `pessoas`, ligada ao agente (agente_id) — assim a base
// cresce em quantidade E fica organizada (ADMIN vê tudo; cada candidato vê os
// seus). Geolocaliza por DDD (barato, sem rede) pra o mapa se encher também.
// Idempotente: re-sincronizar não duplica.
// ============================================================

const CRIADO_POR = "sync-wa";
const CHUNK = 400;

// Jitter determinístico (~±3km) pra pinos do mesmo DDD não empilharem.
function jitter(seed: number, sal: number): number {
  const s = Math.sin(seed * 12.9898 + sal * 78.233) * 43758.5453;
  return (s - Math.floor(s) - 0.5) * 0.06;
}

export type ResultadoSync = {
  agente: string;
  agenteId: number;
  encontrados: number;
  novos: number;
  jaExistiam: number;
  ok: boolean;
  erro?: string;
};

export async function sincronizarContatosAgente(agente: Agente): Promise<ResultadoSync> {
  const bruto: ResultadoSync = {
    agente: agente.candidato,
    agenteId: agente.id,
    encontrados: 0,
    novos: 0,
    jaExistiam: 0,
    ok: false,
  };
  if (agente.provedor === "meta" || !agente.instancia)
    return { ...bruto, erro: "Sem instância Evolution (Meta não expõe lista de contatos)." };

  const r = await buscarContatos(agente.instancia, agente.apikey);
  if (!r.ok) return { ...bruto, erro: r.erro || "Falha ao buscar contatos." };

  const contatos = r.contatos;
  bruto.encontrados = contatos.length;

  // Números que este agente já tem (compara só os dígitos).
  const existentesRows = await query<{ d: string }>(
    `SELECT regexp_replace(COALESCE(whatsapp,''),'\\D','','g') AS d
       FROM pessoas WHERE agente_id = $1`,
    [agente.id]
  );
  const existentes = new Set(existentesRows.map((x) => x.d));

  const novos = contatos.filter((c) => !existentes.has(c.numero.replace(/\D/g, "")));
  bruto.jaExistiam = contatos.length - novos.length;

  let inseridos = 0;
  for (let i = 0; i < novos.length; i += CHUNK) {
    const lote = novos.slice(i, i + CHUNK);
    const valores: any[] = [];
    const linhas: string[] = [];
    lote.forEach((c, idx) => {
      const geo = geoDoNumero(c.numero);
      let lat: number | null = null;
      let lng: number | null = null;
      let cidade: string | null = null;
      let regiao: string | null = null;
      if (geo) {
        const seed = parseInt(c.numero.slice(-6)) || idx + 1;
        lat = geo.lat + jitter(seed, 1);
        lng = geo.lng + jitter(seed, 2);
        cidade = geo.cidade;
        regiao = geo.uf === "SP" ? regiaoMaisProxima(geo.lat, geo.lng) : geo.uf;
      }
      const b = idx * 8;
      linhas.push(
        `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},'WhatsApp')`
      );
      valores.push(c.nome || "Contato WhatsApp", c.numero, cidade, regiao, lat, lng, agente.id, CRIADO_POR);
    });
    inseridos += await execute(
      `INSERT INTO pessoas (nome, whatsapp, cidade, regiao, lat, lng, agente_id, criado_por, categoria)
       VALUES ${linhas.join(",")}`,
      valores
    );
  }

  bruto.novos = inseridos;
  bruto.ok = true;
  return bruto;
}
