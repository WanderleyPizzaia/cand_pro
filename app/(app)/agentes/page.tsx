import { redirect } from "next/navigation";
import { query, queryOne, quotaEfetiva, disparosUsadosHoje } from "@/lib/db";
import { getSessao } from "@/lib/auth";
import { statusConfig, garantirSegredo } from "@/lib/config";
import AgenteCard from "./AgenteCard";
import ReaplicarWebhooks from "./ReaplicarWebhooks";
import NovoAgente from "./NovoAgente";
import BulkAtivar from "./BulkAtivar";
import SincronizarContatos from "./SincronizarContatos";
import WhatsTabs from "./WhatsTabs";
import CopyLink from "../../components/CopyLink";
import Icon from "../../components/Icon";

export const dynamic = "force-dynamic";

export default async function AgentesPage() {
  const sessao = getSessao()!;
  if (!["ADMIN", "COORDENACAO"].includes(sessao.perfil)) redirect("/");

  // Sem segredos no client: NÃO selecionar apikey/ia_key/meta_token (só flags).
  const agentes = await query<{
    id: number;
    candidato: string;
    foto: string | null;
    instancia: string | null;
    telefone: string | null;
    persona: string | null;
    ativo: number;
    tem_ia: boolean;
    provedor: string;
    meta_phone_id: string | null;
    meta_waba_id: string | null;
    tem_meta_token: boolean;
    quota_diaria: number | null;
  }>(
    `SELECT id, candidato, foto, instancia, telefone, persona, ativo,
            provedor, meta_phone_id, meta_waba_id, quota_diaria,
            (ia_key IS NOT NULL) AS tem_ia,
            (meta_token IS NOT NULL) AS tem_meta_token
       FROM agentes ORDER BY id`
  );
  const lista = await Promise.all(
    agentes.map(async (a) => {
      const total =
        (
          await queryOne<{ c: number }>(
            "SELECT COUNT(*) c FROM mensagens WHERE agente_id = $1 AND direcao IN ('in','out')",
            [a.id]
          )
        )?.c ?? 0;
      const hoje =
        (
          await queryOne<{ c: number }>(
            `SELECT COUNT(*) c FROM mensagens
              WHERE agente_id = $1 AND direcao = 'in'
                AND (criado_em AT TIME ZONE 'America/Sao_Paulo')::date
                  = (now() AT TIME ZONE 'America/Sao_Paulo')::date`,
            [a.id]
          )
        )?.c ?? 0;
      const disparosHoje = await disparosUsadosHoje(a.id);
      return {
        ...a,
        totalMensagens: total,
        recebidasHoje: hoje,
        quotaEfetiva: quotaEfetiva(a),
        disparosHoje,
      };
    })
  );

  const st = await statusConfig();
  // IA agora é por agente (cada card mostra seu status); aqui só a Evolution global.
  const pronto = st.evolutionUrl && st.evolutionApiKey;
  // Token obrigatório do webhook (gerado na 1ª vez). Só ADMIN/COORD chegam aqui.
  const tokenWebhook = await garantirSegredo("WEBHOOK_TOKEN");

  return (
    <>
      <h1 className="page-title">
        <Icon name="bot" /> Agentes de IA · WhatsApp
      </h1>
      <p className="page-sub">
        Um agente por candidato. Configure a instância e ligue para responder
        automaticamente.
      </p>
      <WhatsTabs />

      {!pronto && (
        <div className="msg err" style={{ marginBottom: 18 }}>
          Integração incompleta:{" "}
          {[
            !st.evolutionUrl && "URL da Evolution",
            !st.evolutionApiKey && "chave da Evolution",
          ]
            .filter(Boolean)
            .join(", ")}{" "}
          pendente(s). Configure em <b>Configurações</b>. A chave de IA é por
          agente (configure em cada card abaixo).
        </div>
      )}

      <div className="link-card" style={{ marginBottom: 24 }}>
        <h3>URL do Webhook (Evolution API)</h3>
        <p>
          O sistema já configura esta URL ao conectar cada número. Ela contém o token
          de segurança: sem ele, as mensagens são recusadas. Não compartilhe.
        </p>
        <CopyLink path={`/api/whatsapp/webhook?token=${encodeURIComponent(tokenWebhook)}`} />
        <ReaplicarWebhooks />
      </div>

      <BulkAtivar />
      <SincronizarContatos />
      <NovoAgente />

      <div className="agentes-grid">
        {lista.map((a) => (
          <AgenteCard key={a.id} agente={a} temChaveGlobal={st.iaGlobal} />
        ))}
      </div>
    </>
  );
}
