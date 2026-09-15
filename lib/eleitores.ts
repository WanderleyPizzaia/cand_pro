import { query, queryOne, execute, Agente } from "./db";
import { buscarCidade } from "./cidades";
import { regiaoMaisProxima } from "./opcoes";
import { geoDoNumero } from "./ddd";
import { extrairNomeCidade } from "./ia";

// ============================================================
// Cadastro automático do eleitor a partir da conversa do agente de IA.
// Quando o agente coleta nome/cidade no WhatsApp, criamos/atualizamos um
// registro em `pessoas` (geolocalizado, ligado ao agente) — o mapa se
// enche sozinho. Best-effort: nunca lança (não pode quebrar o webhook).
// ============================================================

const CRIADO_POR = "agente-ia";

// Jitter determinístico (~±3km) pra pinos da mesma cidade não empilharem.
function jitter(id: number, sal: number): number {
  const s = Math.sin(id * 12.9898 + sal * 78.233) * 43758.5453;
  return (s - Math.floor(s) - 0.5) * 0.06;
}

// Nome no PADRÃO da base (MAIÚSCULO, sem acento, sem emoji), igual aos importados.
function nomeReal(v: string | null | undefined): string | null {
  let s = (v ?? "").toString();
  s = s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}‍️⃣]/gu, "");
  s = s.split("|")[0].normalize("NFD").replace(/[̀-ͯ]/g, "");
  s = s.replace(/[^A-Za-z0-9 .,'&\-]/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
  if (!s || s.length < 2 || /^\d+$/.test(s)) return null; // vazio, curto ou só dígitos
  return s.slice(0, 80);
}

type Geo = { lat: number | null; lng: number | null; cidade: string | null; regiao: string | null };

// Resolve coordenadas: pela cidade (base SP) ou, se não reconhecer, pelo DDD.
function resolverGeo(cidade: string | null, numero: string): Geo {
  if (cidade) {
    const c = buscarCidade(cidade);
    if (c) {
      return { lat: c.lat, lng: c.lng, cidade, regiao: regiaoMaisProxima(c.lat, c.lng) };
    }
  }
  const g = geoDoNumero(numero);
  if (g) {
    return {
      lat: g.lat,
      lng: g.lng,
      cidade: cidade || g.cidade,
      regiao: g.uf === "SP" ? regiaoMaisProxima(g.lat, g.lng) : g.uf,
    };
  }
  return { lat: null, lng: null, cidade, regiao: null };
}

// Captura/atualiza o eleitor após uma mensagem recebida.
export async function capturarEleitor(
  agente: Agente,
  numero: string,
  nomePush?: string | null
): Promise<void> {
  try {
    const digits = (numero || "").replace(/\D/g, "");
    if (!digits) return;

    // Respeita o toggle "Cadastrar eleitor no mapa" (Meu Agente).
    // Sem config gravada = ligado (comportamento padrão de fábrica).
    if (agente.config?.ferramentas?.cadastrar_eleitor === false) return;

    const existente = await queryOne<{ id: number; nome: string | null; cidade: string | null }>(
      `SELECT id, nome, cidade FROM pessoas
        WHERE regexp_replace(COALESCE(whatsapp,''),'\\D','','g') = $1 AND agente_id = $2
        LIMIT 1`,
      [digits, agente.id]
    );

    // Já tem nome real + cidade -> nada a fazer (não gasta IA).
    if (existente && nomeReal(existente.nome) && (existente.cidade || "").trim()) return;

    // Extrai da conversa (nome/cidade). Best-effort.
    const ex = await extrairNomeCidade(agente.id, numero, agente.ia_key);

    const nomeFinal =
      nomeReal(ex.nome) || nomeReal(existente?.nome) || nomeReal(nomePush) || null;
    const cidadeFinal = ex.cidade || existente?.cidade || null;

    const geo = resolverGeo(cidadeFinal, digits);

    if (existente) {
      // Só melhora campos vazios/fracos (não apaga dado bom).
      await execute(
        `UPDATE pessoas
            SET nome         = COALESCE($1, nome),
                cidade       = COALESCE(NULLIF($2,''), cidade),
                regiao       = COALESCE(NULLIF($3,''), regiao),
                lat          = COALESCE($4, lat),
                lng          = COALESCE($5, lng),
                funcao       = COALESCE(funcao, $6),
                funcao_outro = COALESCE(funcao_outro, $7)
          WHERE id = $8`,
        [
          nomeFinal,
          geo.cidade || "",
          geo.regiao || "",
          geo.lat != null ? geo.lat + jitter(existente.id, 1) : null,
          geo.lng != null ? geo.lng + jitter(existente.id, 2) : null,
          ex.funcao,
          ex.funcao_outro,
          existente.id,
        ]
      );
      return;
    }

    // Novo eleitor (só cria se conseguimos posicioná-lo no mapa ou temos nome).
    if (geo.lat == null && !nomeFinal) return;

    const inserido = await queryOne<{ id: number }>(
      `INSERT INTO pessoas (nome, categoria, cidade, regiao, whatsapp, lat, lng, agente_id, criado_por, funcao, funcao_outro)
       VALUES ($1, 'Eleitor', $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        nomeFinal || "Sem nome",
        geo.cidade,
        geo.regiao,
        digits,
        geo.lat,
        geo.lng,
        agente.id,
        CRIADO_POR,
        ex.funcao,
        ex.funcao_outro,
      ]
    );
    // Aplica o jitter agora que temos o id (evita empilhar).
    if (inserido && geo.lat != null && geo.lng != null) {
      await execute("UPDATE pessoas SET lat = $1, lng = $2 WHERE id = $3", [
        geo.lat + jitter(inserido.id, 1),
        geo.lng + jitter(inserido.id, 2),
        inserido.id,
      ]);
    }
  } catch (e) {
    console.error("[eleitores] capturarEleitor", (e as Error).message);
  }
}
