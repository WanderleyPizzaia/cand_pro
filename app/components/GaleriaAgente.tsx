"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "./Icon";

// Galeria do agente: arquivos prontos (santinho, plano de governo) que a IA
// pode mandar no WhatsApp. Serve ao candidato (Meu agente) e ao gestor
// (Agentes → Ajustes, com agenteId).

type Arquivo = {
  id: number;
  nome: string;
  quando: string;
  legenda: string | null;
  tipo: "imagem" | "documento";
  mime: string;
  nome_arquivo: string | null;
  url: string | null;
  tamanho: number | null;
  criado_em: string;
};

type Dados = {
  ligado: boolean;
  provedor: string;
  arquivos: Arquivo[];
  limiteBytes: number;
  maxArquivos: number;
};

type Teste = { texto: string; arquivo: { id: number; nome: string; tipo: string } | null };

const MODELOS = [
  {
    nome: "Santinho",
    quando: "quando pedirem o número do candidato, o santinho, material para divulgar ou como votar",
  },
  {
    nome: "Plano de governo",
    quando: "quando perguntarem pelas propostas, pelo plano de governo ou pelo que o candidato pretende fazer",
  },
];

const ACEITOS = "image/jpeg,image/png,application/pdf";

function tamanhoLegivel(b: number | null): string {
  if (b == null) return "link";
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  return `${(b / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function lerComoDataUri(f: File): Promise<string> {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result || ""));
    r.onerror = () => falha(new Error("Não deu para ler o arquivo."));
    r.readAsDataURL(f);
  });
}

export default function GaleriaAgente({ agenteId }: { agenteId?: number }) {
  const api = `/api/galeria${agenteId ? `?id=${agenteId}` : ""}`;
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);

  // Novo arquivo
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [quando, setQuando] = useState("");
  const [legenda, setLegenda] = useState("");
  const [modo, setModo] = useState<"arquivo" | "link">("arquivo");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [link, setLink] = useState("");

  // Edição
  const [editando, setEditando] = useState<number | null>(null);
  const [ed, setEd] = useState({ nome: "", quando: "", legenda: "" });

  // Teste
  const [pergunta, setPergunta] = useState("");
  const [testando, setTestando] = useState(false);
  const [teste, setTeste] = useState<Teste | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(api, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro || "Não deu para carregar a galeria.");
      setD(j);
    } catch (e: any) {
      setErro(e.message);
    }
  }, [api]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  async function post(corpo: Record<string, unknown>) {
    const r = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || "Algo deu errado. Tente de novo.");
    return j;
  }

  function limparForm() {
    setNome("");
    setQuando("");
    setLegenda("");
    setArquivo(null);
    setLink("");
    setModo("arquivo");
  }

  async function ligar() {
    if (!d) return;
    setErro("");
    const valor = !d.ligado;
    setD({ ...d, ligado: valor });
    try {
      await post({ acao: "ligar", valor });
      setAviso(valor ? "Ligado: a IA já pode mandar os arquivos." : "Desligado: a IA não manda mais arquivos.");
    } catch (e: any) {
      setD({ ...d, ligado: !valor });
      setErro(e.message);
    }
  }

  async function adicionar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!d) return;
    setErro("");
    setAviso("");
    const corpo: Record<string, unknown> = { acao: "adicionar", nome, quando, legenda };
    if (modo === "arquivo") {
      if (!arquivo) return setErro("Escolha o arquivo.");
      if (arquivo.size > d.limiteBytes)
        return setErro("Arquivo acima de 3 MB. Comprima o PDF ou use um link direto para o arquivo.");
      corpo.nomeArquivo = arquivo.name;
    } else if (!link.trim()) {
      return setErro("Cole o link do arquivo.");
    }
    setOcupado(true);
    try {
      if (modo === "arquivo") corpo.arquivo = await lerComoDataUri(arquivo!);
      else corpo.url = link.trim();
      await post(corpo);
      setAviso(`"${nome.trim()}" adicionado à galeria.`);
      limparForm();
      setAberto(false);
      await carregar();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  }

  async function salvarEdicao(id: number) {
    setErro("");
    setOcupado(true);
    try {
      await post({ acao: "editar", arquivoId: id, ...ed });
      setEditando(null);
      await carregar();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  }

  async function excluir(a: Arquivo) {
    if (!window.confirm(`Excluir "${a.nome}" da galeria? A IA deixa de mandar este arquivo.`)) return;
    setErro("");
    try {
      await post({ acao: "excluir", arquivoId: a.id });
      await carregar();
    } catch (e: any) {
      setErro(e.message);
    }
  }

  async function testar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!pergunta.trim()) return;
    setErro("");
    setTestando(true);
    setTeste(null);
    try {
      setTeste(await post({ acao: "testar", mensagem: pergunta }));
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setTestando(false);
    }
  }

  if (!d) {
    return (
      <div className="bloco-agente">
        <div className="bloco-titulo">Arquivos que a IA pode enviar</div>
        {erro ? <div className="msg err">{erro}</div> : <p className="hint">Carregando…</p>}
      </div>
    );
  }

  const modelosLivres = MODELOS.filter(
    (m) => !d.arquivos.some((a) => a.nome.trim().toLowerCase() === m.nome.toLowerCase())
  );
  const cheia = d.arquivos.length >= d.maxArquivos;

  return (
    <div className="bloco-agente galeria">
      <div className="galeria-topo">
        <div className="ferramenta-txt">
          <b>Arquivos que a IA pode enviar</b>
          <small>
            {d.ligado
              ? "Ligado: a IA manda o arquivo quando a situação descrita acontecer na conversa."
              : "Desligado: a IA não manda nenhum arquivo. Teste abaixo antes de ligar."}
          </small>
        </div>
        <button
          type="button"
          className={`switch ${d.ligado ? "on" : ""}`}
          onClick={ligar}
          aria-label="A IA pode enviar arquivos"
          aria-pressed={d.ligado}
        >
          <span className="dot" />
        </button>
      </div>

      {d.provedor === "meta" && (
        <div className="msg warn">
          Neste número (API oficial da Meta) o envio automático ainda não funciona. Ele funciona nos
          números conectados pela Evolution.
        </div>
      )}

      {d.arquivos.length > 0 && (
        <ul className="galeria-lista">
          {d.arquivos.map((a) => (
            <li key={a.id} className="galeria-item">
              <a
                className="galeria-thumb"
                href={`/api/galeria/${a.id}`}
                target="_blank"
                rel="noreferrer"
                aria-label={`Abrir ${a.nome}`}
              >
                {a.tipo === "imagem" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/galeria/${a.id}`} alt="" loading="lazy" />
                ) : (
                  <Icon name="file-text" size={22} />
                )}
              </a>

              {editando === a.id ? (
                <div className="galeria-info galeria-edicao">
                  <input
                    aria-label="Nome"
                    value={ed.nome}
                    maxLength={60}
                    onChange={(e) => setEd({ ...ed, nome: e.target.value })}
                  />
                  <textarea
                    aria-label="Quando a IA deve enviar"
                    rows={2}
                    maxLength={300}
                    value={ed.quando}
                    onChange={(e) => setEd({ ...ed, quando: e.target.value })}
                  />
                  <input
                    aria-label="Legenda"
                    placeholder="Legenda (opcional)"
                    maxLength={300}
                    value={ed.legenda}
                    onChange={(e) => setEd({ ...ed, legenda: e.target.value })}
                  />
                  <div className="galeria-acoes">
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => salvarEdicao(a.id)} disabled={ocupado}>
                      Salvar
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditando(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="galeria-info">
                  <b>{a.nome}</b>
                  <small>{a.quando}</small>
                  <small className="galeria-meta">
                    {a.tipo === "imagem" ? "Imagem" : "PDF"} · {tamanhoLegivel(a.tamanho)}
                    {a.legenda ? ` · legenda: ${a.legenda}` : ""}
                  </small>
                  <div className="galeria-acoes">
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => {
                        setEditando(a.id);
                        setEd({ nome: a.nome, quando: a.quando, legenda: a.legenda || "" });
                      }}
                    >
                      Editar
                    </button>
                    <button type="button" className="btn-link perigo" onClick={() => excluir(a)}>
                      Excluir
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!aberto ? (
        !cheia && (
          <div className="galeria-modelos">
            {d.arquivos.length === 0 && <p className="hint">Nenhum arquivo ainda. Comece por um destes:</p>}
            {modelosLivres.map((m) => (
              <button
                key={m.nome}
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  limparForm();
                  setNome(m.nome);
                  setQuando(m.quando);
                  setAberto(true);
                }}
              >
                <Icon name="plus" size={14} /> {m.nome}
              </button>
            ))}
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => {
                limparForm();
                setAberto(true);
              }}
            >
              <Icon name="plus" size={14} /> Outro arquivo
            </button>
          </div>
        )
      ) : (
        <form className="galeria-form" onSubmit={adicionar}>
          <div className="grid2">
            <div className="field">
              <label htmlFor="gal-nome">Nome</label>
              <input id="gal-nome" value={nome} maxLength={60} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="gal-legenda">Legenda (opcional)</label>
              <input
                id="gal-legenda"
                value={legenda}
                maxLength={300}
                placeholder="Texto que vai junto com o arquivo"
                onChange={(e) => setLegenda(e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="gal-quando">Quando a IA deve enviar</label>
            <textarea
              id="gal-quando"
              rows={2}
              maxLength={300}
              value={quando}
              onChange={(e) => setQuando(e.target.value)}
            />
            <small className="hint">Descreva a situação como você explicaria para alguém da equipe.</small>
          </div>
          <div className="field">
            <div className="seg" role="group" aria-label="Origem do arquivo">
              <button type="button" className={modo === "arquivo" ? "ativo" : ""} onClick={() => setModo("arquivo")}>
                Enviar arquivo
              </button>
              <button type="button" className={modo === "link" ? "ativo" : ""} onClick={() => setModo("link")}>
                Usar um link
              </button>
            </div>
          </div>
          {modo === "arquivo" ? (
            <div className="field">
              <label htmlFor="gal-arquivo">Arquivo</label>
              <input
                id="gal-arquivo"
                type="file"
                accept={ACEITOS}
                onChange={(e) => setArquivo(e.target.files?.[0] || null)}
              />
              <small className="hint">JPG, PNG ou PDF de até 3 MB. PDF maior: comprima ou use um link.</small>
            </div>
          ) : (
            <div className="field">
              <label htmlFor="gal-link">Link do arquivo</label>
              <input
                id="gal-link"
                type="url"
                inputMode="url"
                placeholder="https://site-da-campanha.com.br/plano-de-governo.pdf"
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
              <small className="hint">Link direto, terminando em .pdf, .jpg ou .png, aberto para qualquer pessoa.</small>
            </div>
          )}
          <div className="galeria-acoes">
            <button type="submit" className="btn btn-primary" disabled={ocupado}>
              {ocupado ? "Salvando…" : "Adicionar à galeria"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                limparForm();
                setAberto(false);
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {d.arquivos.length > 0 && (
        <div className="galeria-teste">
          <div className="bloco-titulo">Testar</div>
          <form className="galeria-teste-form" onSubmit={testar}>
            <input
              aria-label="Mensagem do eleitor"
              placeholder='Mensagem do eleitor, ex.: "me manda seu santinho"'
              value={pergunta}
              maxLength={500}
              onChange={(e) => setPergunta(e.target.value)}
            />
            <button type="submit" className="btn" disabled={testando || !pergunta.trim()}>
              {testando ? "Testando…" : "Testar"}
            </button>
          </form>
          {teste && (
            <div className="galeria-resultado">
              {teste.texto && <p>{teste.texto}</p>}
              {teste.arquivo ? (
                <span className="txt-ok com-icone">
                  <Icon name="check" size={14} /> Mandaria: {teste.arquivo.nome}
                </span>
              ) : (
                <span className="muted">Não mandaria nenhum arquivo.</span>
              )}
            </div>
          )}
          <small className="hint">O teste não manda nada para ninguém.</small>
        </div>
      )}

      {erro && <div className="msg err">{erro}</div>}
      {aviso && <div className="msg ok">{aviso}</div>}
    </div>
  );
}
