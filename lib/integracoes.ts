// ============================================================
// Estado REAL das integrações para o quadro de Configurações. Antes os quatro
// cartões diziam "Conectado" sempre, configurados ou não. Aqui cada um olha o
// que dá para conferir sem pesar a página: credenciais gravadas, números e
// contas cadastrados e, no WhatsApp (Evolution), a conexão de cada número.
// ============================================================
import { query, queryOne } from "./db";
import { statusConfig } from "./config";
import { estadoInstancia } from "./evolution";

export type EstadoIntegracao = {
  nome: "Google" | "WhatsApp" | "Meta" | "Instagram";
  detalhe: string;
  estado: "ok" | "atencao" | "off";
  rotulo: string;
};

// Espera no máximo `ms` (Evolution fora do ar não pode travar a tela).
function comPrazo<T>(p: Promise<T>, ms: number, padrao: T): Promise<T> {
  return Promise.race([p, new Promise<T>((ok) => setTimeout(() => ok(padrao), ms))]);
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export async function estadoIntegracoes(): Promise<EstadoIntegracao[]> {
  const st = await statusConfig();

  // Google: só a agenda (embed do Google Calendar); não há sincronização de contatos.
  const google: EstadoIntegracao = st.googleCalendar
    ? { nome: "Google", detalhe: "Agenda (Google Calendar)", estado: "ok", rotulo: "Configurado" }
    : { nome: "Google", detalhe: "Agenda (Google Calendar)", estado: "off", rotulo: "Não configurado" };

  // WhatsApp pela Evolution: credenciais + estado de cada número.
  let whatsapp: EstadoIntegracao;
  const evo = await query<{ instancia: string; apikey: string | null }>(
    "SELECT instancia, apikey FROM agentes WHERE provedor <> 'meta' AND COALESCE(instancia,'') <> ''"
  );
  if (!(st.evolutionUrl && st.evolutionApiKey)) {
    whatsapp = { nome: "WhatsApp", detalhe: "Evolution: falta URL ou chave", estado: "off", rotulo: "Não configurado" };
  } else if (!evo.length) {
    whatsapp = { nome: "WhatsApp", detalhe: "Evolution configurada, nenhum número", estado: "atencao", rotulo: "Sem números" };
  } else {
    const estados = await Promise.all(
      evo.map((a) => comPrazo(estadoInstancia(a.instancia, a.apikey), 4000, { ok: false, state: null as string | null }))
    );
    const abertos = estados.filter((e) => e.state === "open").length;
    const semResposta = estados.every((e) => !e.ok);
    whatsapp = semResposta
      ? { nome: "WhatsApp", detalhe: "A Evolution não respondeu", estado: "atencao", rotulo: "Sem resposta" }
      : {
          nome: "WhatsApp",
          detalhe: `${abertos} de ${plural(evo.length, "número conectado", "números conectados")}`,
          estado: abertos === evo.length ? "ok" : "atencao",
          rotulo: abertos === evo.length ? "Conectado" : abertos ? "Parcial" : "Desconectado",
        };
  }

  // WhatsApp oficial (Meta Cloud API): números com credencial + App Secret do webhook.
  const meta = await queryOne<{ n: number }>(
    "SELECT COUNT(*)::int n FROM agentes WHERE provedor = 'meta' AND meta_token IS NOT NULL AND COALESCE(meta_phone_id,'') <> ''"
  );
  const nMeta = meta?.n ?? 0;
  const metaEst: EstadoIntegracao = !nMeta
    ? { nome: "Meta", detalhe: "WhatsApp oficial (Cloud API)", estado: "off", rotulo: "Não usado" }
    : !st.metaAppSecret
    ? { nome: "Meta", detalhe: "Falta o App Secret: mensagens recebidas são recusadas", estado: "atencao", rotulo: "Incompleto" }
    : { nome: "Meta", detalhe: plural(nMeta, "número oficial", "números oficiais"), estado: "ok", rotulo: "Configurado" };

  // Instagram: contas conectadas, IA ligada e token com problema.
  const ig = await queryOne<{ contas: number; ativas: number; erros: number }>(
    `SELECT COUNT(*)::int contas,
            COUNT(*) FILTER (WHERE ig_ativo)::int ativas,
            COUNT(*) FILTER (WHERE ig_token_erro IS NOT NULL)::int erros
       FROM agentes WHERE ig_token IS NOT NULL AND ig_user_id IS NOT NULL`
  );
  const contas = ig?.contas ?? 0;
  const instagram: EstadoIntegracao = !contas
    ? { nome: "Instagram", detalhe: "Direct: conecte em Agentes → Instagram", estado: "off", rotulo: "Não conectado" }
    : ig!.erros
    ? { nome: "Instagram", detalhe: `Token com erro em ${plural(ig!.erros, "conta", "contas")}: reconecte`, estado: "atencao", rotulo: "Atenção" }
    : {
        nome: "Instagram",
        detalhe: `${plural(contas, "conta", "contas")} · IA ligada em ${ig!.ativas}`,
        estado: "ok",
        rotulo: "Conectado",
      };

  return [google, whatsapp, metaEst, instagram];
}
