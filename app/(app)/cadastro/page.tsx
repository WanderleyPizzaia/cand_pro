"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CATEGORIAS, FUNCOES, REGIOES } from "@/lib/opcoes";
import cidades from "@/data/sp-cidades.json";
import Icon from "../../components/Icon";

const VAZIO = {
  nome: "",
  categoria: "",
  funcao: "",
  funcao_outro: "",
  partido: "",
  cidade: "",
  regiao: "Auto",
  bairro: "",
  whatsapp: "",
  email: "",
  instagram: "",
  observacao: "",
  foto: "",
};

function CadastroForm() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("id");
  const [form, setForm] = useState(VAZIO);
  const [msg, setMsg] = useState<{ tipo: "ok" | "err"; texto: string } | null>(
    null
  );
  const [enviando, setEnviando] = useState(false);
  // Lista de cargos/funções configurável (fallback = FUNCOES fixas).
  const [funcoes, setFuncoes] = useState<string[]>([...FUNCOES]);

  useEffect(() => {
    fetch("/api/funcoes", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.funcoes?.length && setFuncoes(d.funcoes))
      .catch(() => {});
  }, []);

  // Modo edição: carrega o cadastro existente e prefill.
  useEffect(() => {
    if (!editId) return;
    fetch(`/api/pessoas?id=${editId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (!p) return;
        setForm({
          nome: p.nome || "",
          categoria: p.categoria || "",
          funcao: p.funcao || "",
          funcao_outro: p.funcao_outro || "",
          partido: p.partido || "",
          cidade: p.cidade || "",
          regiao: p.regiao || "Auto",
          bairro: p.bairro || "",
          whatsapp: p.whatsapp || "",
          email: p.email || "",
          instagram: p.instagram || "",
          observacao: p.observacao || "",
          foto: p.foto || "",
        });
      })
      .catch(() => {});
  }, [editId]);

  function set(campo: string, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  // Lê a imagem escolhida, redimensiona (máx 400px) e comprime para JPEG -
  // guardada como data URL no campo `foto`.
  function onFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 400;
        let { width, height } = img;
        if (width > height && width > max) {
          height = Math.round((height * max) / width);
          width = max;
        } else if (height > max) {
          width = Math.round((width * max) / height);
          height = max;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")?.drawImage(img, 0, 0, width, height);
        set("foto", canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!form.nome.trim()) {
      setMsg({ tipo: "err", texto: "Informe o nome." });
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch("/api/pessoas", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editId ? { id: Number(editId), ...form } : form),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.erro || "Erro ao salvar");
      if (editId) {
        setMsg({ tipo: "ok", texto: "Cadastro atualizado!" });
        setTimeout(() => router.push("/pessoas"), 700);
      } else {
        const aviso = data.cidadeReconhecida
          ? `Cadastro salvo! Região: ${data.regiao || "-"}.`
          : "Cadastro salvo! (cidade não reconhecida na base de SP, não vai aparecer no mapa)";
        setMsg({ tipo: "ok", texto: aviso });
        setForm(VAZIO);
      }
    } catch (err: any) {
      setMsg({ tipo: "err", texto: err.message });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <h1 className="page-title">
        <Icon name="user-plus" /> {editId ? "Editar Cadastro" : "Cadastrar Pessoa"}
      </h1>
      <p className="page-sub">
        Eleitores, lideranças e contatos. A cidade define automaticamente a
        posição no Mapa de Votos.
      </p>

      {msg && <div className={`msg ${msg.tipo}`}>{msg.texto}</div>}

      <form className="form-card" onSubmit={salvar}>
        <div className="foto-upload">
          <div className="foto-preview">
            {form.foto ? (
              <img src={form.foto} alt="Foto da pessoa" />
            ) : (
              <Icon name="user-plus" size={34} />
            )}
          </div>
          <div className="foto-acoes">
            <label className="btn btn-ghost" style={{ flex: "none" }}>
              <Icon name="upload" size={16} />{" "}
              {form.foto ? "Trocar foto" : "Subir foto"}
              <input
                type="file"
                accept="image/*"
                onChange={onFoto}
                style={{ display: "none" }}
              />
            </label>
            {form.foto && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ flex: "none" }}
                onClick={() => set("foto", "")}
              >
                Remover
              </button>
            )}
            <p className="foto-hint">
              Foto do eleitor/liderança. JPG ou PNG - otimizada automaticamente.
            </p>
          </div>
        </div>

        <div className="grid2">
          <div className="field">
            <label>
              Nome <span className="req">*</span>
            </label>
            <input
              placeholder="Nome completo"
              value={form.nome}
              onChange={(e) => set("nome", e.target.value)}
            />
          </div>

          <div className="field">
            <label>Categoria</label>
            <select
              value={form.categoria}
              onChange={(e) => set("categoria", e.target.value)}
            >
              <option value="">Selecione...</option>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Função / Cargo</label>
            <select
              value={form.funcao}
              onChange={(e) => set("funcao", e.target.value)}
            >
              <option value="">Selecione...</option>
              {funcoes.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            {form.funcao === "Outro" && (
              <input
                style={{ marginTop: 8 }}
                placeholder="Qual? (especifique o cargo)"
                value={form.funcao_outro}
                onChange={(e) => set("funcao_outro", e.target.value)}
              />
            )}
          </div>

          <div className="field">
            <label>Partido / Vínculo</label>
            <input
              placeholder="Ex: PT, PSD, Sem partido"
              value={form.partido}
              onChange={(e) => set("partido", e.target.value)}
            />
          </div>

          <div className="field">
            <label>Cidade</label>
            <input
              list="lista-cidades"
              placeholder="Comece a digitar..."
              value={form.cidade}
              onChange={(e) => set("cidade", e.target.value)}
            />
            <datalist id="lista-cidades">
              {(cidades as { nome: string }[]).map((c) => (
                <option key={c.nome} value={c.nome} />
              ))}
            </datalist>
          </div>

          <div className="field">
            <label>Região</label>
            <select
              value={form.regiao}
              onChange={(e) => set("regiao", e.target.value)}
            >
              <option value="Auto">Auto (pela cidade)</option>
              {REGIOES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Bairro</label>
            <input
              placeholder="Bairro ou zona"
              value={form.bairro}
              onChange={(e) => set("bairro", e.target.value)}
            />
          </div>

          <div className="field">
            <label>WhatsApp</label>
            <input
              placeholder="(11) 98765-4321"
              value={form.whatsapp}
              onChange={(e) => set("whatsapp", e.target.value)}
            />
          </div>

          <div className="field">
            <label>E-mail</label>
            <input
              placeholder="email@exemplo.com"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>

          <div className="field">
            <label>Instagram</label>
            <input
              placeholder="@usuario"
              value={form.instagram}
              onChange={(e) => set("instagram", e.target.value)}
            />
          </div>

          <div className="field full">
            <label>Observação inicial</label>
            <textarea
              placeholder="Contexto do contato, indicação, etc."
              value={form.observacao}
              onChange={(e) => set("observacao", e.target.value)}
            />
          </div>
        </div>

        <div className="actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => router.push("/pessoas")}
          >
            Ver cadastros
          </button>
          <button type="submit" className="btn btn-primary" disabled={enviando}>
            {enviando ? "Salvando..." : editId ? "Salvar alterações" : "Salvar"}
          </button>
        </div>
      </form>
    </>
  );
}

export default function CadastroPage() {
  return (
    <Suspense fallback={<div className="empty">Carregando…</div>}>
      <CadastroForm />
    </Suspense>
  );
}
