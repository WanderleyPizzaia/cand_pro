import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";
import { query, Agente } from "@/lib/db";
import { statusConfig } from "@/lib/config";
import WhatsTabs from "../agentes/WhatsTabs";
import CampanhasCliente from "./CampanhasCliente";
import Icon from "../../components/Icon";

export const dynamic = "force-dynamic";

export default async function CampanhasPage() {
  const sessao = getSessao()!;
  if (!["ADMIN", "COORDENACAO"].includes(sessao.perfil)) redirect("/");

  const agentes = await query<Agente>(
    "SELECT * FROM agentes ORDER BY id"
  );
  const cidades = await query<{ cidade: string }>(
    "SELECT DISTINCT cidade FROM pessoas WHERE cidade IS NOT NULL AND cidade <> '' ORDER BY cidade"
  );
  const categorias = await query<{ categoria: string }>(
    "SELECT DISTINCT categoria FROM pessoas WHERE categoria IS NOT NULL AND categoria <> '' ORDER BY categoria"
  );
  const st = await statusConfig();

  return (
    <>
      <h1 className="page-title">
        <Icon name="megaphone" /> Campanhas de WhatsApp
      </h1>
      <p className="page-sub">
        Disparo em massa para listas segmentadas · números comuns (texto livre) e
        oficiais da Meta (template aprovado)
      </p>
      <WhatsTabs />

      {!(st.evolutionUrl && st.evolutionApiKey) && (
        <div className="msg err" style={{ marginBottom: 16 }}>
          Evolution não configurada - configure em <b>Configurações</b> antes de
          disparar.
        </div>
      )}

      <CampanhasCliente
        agentes={agentes.map((a) => ({
          id: a.id,
          candidato: a.candidato,
          instancia: a.instancia,
          provedor: a.provedor,
          // "pronto" = dá para disparar: Meta com credenciais ou Evolution com instância.
          pronto:
            a.provedor === "meta"
              ? !!(a.meta_phone_id && a.meta_token)
              : !!a.instancia,
        }))}
        cidades={cidades.map((c) => c.cidade)}
        categorias={categorias.map((c) => c.categoria)}
      />
    </>
  );
}
