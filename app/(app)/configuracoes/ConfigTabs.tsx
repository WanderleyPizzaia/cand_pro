"use client";

import { useState } from "react";
import Icon, { IconName } from "../../components/Icon";
import FormConfig from "./FormConfig";
import FormSenha from "../conta/FormSenha";
import UsuariosCliente from "../usuarios/UsuariosCliente";
import EditorCargos from "./EditorCargos";
import IntegracoesStatus from "./IntegracoesStatus";

type Status = {
  evolutionUrl: boolean;
  evolutionApiKey: boolean;
  anthropicKey: boolean;
  googleCalendar: boolean;
  n8nDisparoUrl: boolean;
  n8nToken: boolean;
  n8nAgenteUrl: boolean;
  metaAppSecret: boolean;
};

type Aba = "usuarios" | "integracoes" | "cargos" | "senha";

export default function ConfigTabs({
  meuId,
  status,
  admin = true,
}: {
  meuId: number;
  status: Status | null;
  admin?: boolean;
}) {
  const [aba, setAba] = useState<Aba>("usuarios");

  const tab = (chave: Aba, icon: IconName, label: string) => (
    <button
      className={`map-tab${aba === chave ? " ativo" : ""}`}
      onClick={() => setAba(chave)}
    >
      <Icon name={icon} size={16} /> {label}
    </button>
  );

  return (
    <>
      <div className="map-tabs">
        {tab("usuarios", "users", admin ? "Login e senha" : "Meu time")}
        {admin && tab("integracoes", "message", "Integrações")}
        {admin && tab("cargos", "tasks", "Cargos")}
        {tab("senha", "key", "Minha senha")}
      </div>

      {aba === "usuarios" && (
        <>
          <p className="page-sub">
            {admin
              ? "Equipe do sistema · crie logins e defina perfis (Marketing, Coordenação, Candidatos e Líderes)."
              : "Seu time · veja todos e redefina a senha de qualquer membro."}
          </p>
          <UsuariosCliente meuId={meuId} admin={admin} />
        </>
      )}

      {aba === "integracoes" && status && (
        <>
          <div className="integr-head">
            <span className="dot-verde" /> Tudo verificado e conectado
          </div>
          <IntegracoesStatus />
          <p className="page-sub" style={{ marginTop: 18 }}>
            Credenciais de WhatsApp + IA. Guardadas no banco (Supabase), com
            fallback para variáveis de ambiente.
          </p>
          <div
            className="msg"
            style={{
              background: "var(--panel-2)",
              color: "var(--muted)",
              border: "1px solid var(--border)",
              marginBottom: 18,
            }}
          >
            Por segurança, os valores nunca são exibidos de volta - preencha só o
            que quiser alterar.
          </div>
          <FormConfig status={status} />
        </>
      )}

      {aba === "cargos" && (
        <>
          <p className="page-sub">
            Cargos/funções do cadastro. Crie, edite, reordene ou remova. A IA usa
            esta lista para classificar contatos que chegam pelo WhatsApp.
          </p>
          <EditorCargos />
        </>
      )}

      {aba === "senha" && (
        <>
          <p className="page-sub">Troque sua senha de acesso ao painel.</p>
          <FormSenha />
        </>
      )}
    </>
  );
}
