"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon, { IconName } from "../../components/Icon";

type Passos = { assistente: boolean; posicionamento: boolean; whatsapp: boolean };

const TAREFAS: { chave: keyof Passos; icone: IconName; titulo: string; desc: string; href: string; cta: string }[] = [
  {
    chave: "assistente",
    icone: "bot",
    titulo: "Treine seu assistente",
    desc: "Responda a entrevista guiada (texto ou áudio) ou converse com o seu agente. A IA passa a falar no seu tom e com as suas posições.",
    href: "/meu-agente",
    cta: "Treinar agora",
  },
  {
    chave: "posicionamento",
    icone: "matriz",
    titulo: "Defina seu posicionamento",
    desc: "Responda os critérios da Matriz Política ou calibre pela IA. É a bússola que mantém toda a comunicação coerente.",
    href: "/matriz",
    cta: "Abrir a Matriz",
  },
  {
    chave: "whatsapp",
    icone: "whatsapp",
    titulo: "Conecte seu WhatsApp",
    desc: "Ligue o número do gabinete para o assistente atender os eleitores e a base crescer sozinha.",
    href: "/meu-agente",
    cta: "Conectar WhatsApp",
  },
];

export default function PrimeirosPassosCliente() {
  const [passos, setPassos] = useState<Passos | null>(null);
  const [candidato, setCandidato] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch("/api/primeiros-passos")
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (ok) {
          setPassos(j.passos);
          setCandidato(j.candidato || "");
        } else setErro(j.erro || "Falha ao carregar.");
      })
      .catch(() => setErro("Falha ao carregar."));
  }, []);

  const feitos = passos ? Object.values(passos).filter(Boolean).length : 0;
  const total = TAREFAS.length;
  const pct = Math.round((feitos / total) * 100);
  const completo = feitos === total;

  return (
    <div className="pp-wrap">
      {erro && <div className="msg err">{erro}</div>}

      <div className="pp-progresso">
        <div className="pp-bar">
          <div className="pp-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="pp-conta">
          {feitos} de {total} concluídos{completo ? " · gabinete configurado!" : ""}
        </div>
      </div>

      <div className="pp-lista">
        {TAREFAS.map((t, i) => {
          const feito = !!passos?.[t.chave];
          return (
            <div key={t.chave} className={`pp-item ${feito ? "feito" : ""}`}>
              <div className="pp-ico">
                {feito ? <Icon name="check" size={20} /> : <Icon name={t.icone} size={20} />}
              </div>
              <div className="pp-txt">
                <div className="pp-tit">
                  <span className="pp-n">{i + 1}</span>
                  {t.titulo}
                  {feito && <span className="pp-badge">Feito</span>}
                </div>
                <div className="pp-desc">{t.desc}</div>
              </div>
              <Link href={t.href} className={`btn ${feito ? "" : "btn-primary"} pp-cta`}>
                {feito ? "Revisar" : t.cta}
              </Link>
            </div>
          );
        })}
      </div>

      {completo && (
        <div className="pp-pronto">
          Tudo pronto, {candidato ? candidato.split(" ")[0] : "gabinete"}. O sistema já está trabalhando com o seu tom e a sua estratégia.
          <Link href="/" className="btn btn-primary" style={{ marginLeft: 10 }}>
            Ir para o painel
          </Link>
        </div>
      )}
    </div>
  );
}
