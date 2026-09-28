// ============================================================
// Leitura de CSV para a importação de contatos. Sem banco: roda no navegador
// (que lê o arquivo e manda em partes) e no servidor.
// ============================================================

// Texto do arquivo como veio do Excel/Google: UTF-8 (com ou sem BOM), UTF-16
// ("Texto Unicode") ou Windows-1252, que é o "CSV" padrão do Excel em
// português. Decide linha a linha: planilha colada de fontes diferentes tem
// linhas em UTF-8 e linhas em 1252, e decidir pelo arquivo inteiro estragava
// as outras (o "Nome" do cabeçalho virava "ï»¿Nome" e sumia).
export function decodificarArquivo(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b);
  const inicio = b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? 3 : 0;
  const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  try {
    return utf8.decode(b.subarray(inicio));
  } catch {
    // Tem byte que não é UTF-8: segue linha a linha.
  }
  const w1252 = new TextDecoder("windows-1252");
  let texto = "";
  for (let i = inicio; i < b.length; ) {
    const nl = b.indexOf(0x0a, i);
    const fim = nl === -1 ? b.length : nl + 1;
    const pedaco = b.subarray(i, fim);
    try {
      texto += utf8.decode(pedaco);
    } catch {
      texto += w1252.decode(pedaco);
    }
    i = fim;
  }
  return texto;
}

// Arquivo do Excel que não é CSV (.xlsx é um zip; .xls, um OLE): o texto
// lido seria lixo e a coluna "nome" nunca apareceria.
export function planilhaNaoCSV(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf.slice(0, 4));
  return (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) ||
    (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0);
}

// Delimitador pelas primeiras linhas: o que se repete com a mesma contagem no
// maior número delas (uma linha de título no topo não decide mais nada).
// Aceita a linha "sep=;" que o Excel às vezes grava.
export function detectarDelimitador(texto: string): string {
  const amostra = texto.slice(0, 20000).split(/\r\n|\n|\r/).filter((l) => l.trim()).slice(0, 30);
  const sep = amostra[0]?.match(/^\s*"?sep=(.)"?\s*$/i);
  if (sep) return sep[1];
  let melhor = { d: ",", nota: 0 };
  for (const d of [";", ",", "\t", "|"]) {
    const freq = new Map<number, number>();
    for (const l of amostra) {
      const n = l.split(d).length - 1;
      if (n > 0) freq.set(n, (freq.get(n) || 0) + 1);
    }
    const nota = freq.size ? Math.max(...Array.from(freq.values())) : 0;
    if (nota > melhor.nota) melhor = { d, nota };
  }
  return melhor.d;
}

// Um campo entre aspas legítimo (observação com quebra de linha) tem poucas
// linhas. Passou disto, é uma aspa que abriu e nunca fechou engolindo o resto
// do arquivo.
const LIMITE_QUEBRAS = 20;

// Uma passada do leitor. `literais` = posições de aspas tratadas como texto.
// Devolve as linhas ou, se achar um campo entre aspas que engoliu linhas
// demais, a posição da aspa que o abriu.
function passada(
  texto: string,
  delim: string,
  literais: Set<number>
): { linhas: string[][]; fuga: number | null } {
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let entreAspas = false;
  let campoComecou = false;
  let abertura = -1;
  let quebras = 0;
  const fechaLinha = () => {
    linha.push(campo);
    linhas.push(linha);
    linha = [];
    campo = "";
    campoComecou = false;
  };
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (entreAspas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          entreAspas = false;
          if (quebras >= LIMITE_QUEBRAS) return { linhas, fuga: abertura };
        }
      } else {
        if (ch === "\n") quebras++;
        campo += ch;
      }
      continue;
    }
    if (ch === '"' && !campoComecou && !literais.has(i)) {
      entreAspas = true;
      campoComecou = true;
      abertura = i;
      quebras = 0;
    } else if (ch === delim) {
      linha.push(campo);
      campo = "";
      campoComecou = false;
    } else if (ch === "\n") {
      fechaLinha();
    } else if (ch === "\r") {
      // "\r" sozinho (arquivo antigo de Mac) também quebra a linha.
      if (texto[i + 1] !== "\n") fechaLinha();
    } else {
      campo += ch;
      campoComecou = true;
    }
  }
  // Terminou o arquivo com aspa aberta que atravessou linhas: mesma fuga.
  if (entreAspas && quebras > 0) return { linhas, fuga: abertura };
  if (campo.length > 0 || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  return { linhas: linhas.filter((l) => l.some((c) => c.trim())), fuga: null };
}

// Leitor de CSV (RFC 4180, tolerante), com as correções que a planilha real
// precisa:
//  - aspa no meio do texto (ANTONIO "TONHO) é literal;
//  - aspa que abre um campo e não fecha ("ZEZINHO) vira texto comum, em vez
//    de engolir o resto do arquivo; `aspasSoltas` diz em que linhas estavam;
//  - remove NUL (U+0000), que o Postgres recusa.
export function lerCSV(texto: string, delim: string): { linhas: string[][]; aspasSoltas: number[] } {
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
  texto = texto.replace(/\u0000/g, "");
  const literais = new Set<number>();
  const aspasSoltas: number[] = [];
  for (let tentativa = 0; tentativa < 50; tentativa++) {
    const r = passada(texto, delim, literais);
    if (r.fuga === null) return { linhas: r.linhas, aspasSoltas };
    literais.add(r.fuga);
    aspasSoltas.push(texto.slice(0, r.fuga).split(/\r\n|\n|\r/).length);
  }
  // Arquivo com aspas soltas demais: lê cada linha sozinha (aspa nunca atravessa linha).
  const porLinha = texto
    .split(/\r\n|\n|\r/)
    .filter((l) => l.trim())
    .map((l) => passada(l, delim, new Set()).linhas[0] || []);
  return { linhas: porLinha, aspasSoltas };
}

export function parseCSV(texto: string, delim: string): string[][] {
  return lerCSV(texto, delim).linhas;
}

// "Nome Completo:", "E-mail", "Phone 1 - Value" -> "nome completo", "e mail",
// "phone 1 value". Tira também o BOM, inteiro ou já estragado ("ï»¿").
function normalizar(s: string): string {
  return s
    .replace(/^(﻿|ï»¿)+/, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[_\-.:*#()/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Cabeçalhos aceitos -> campo interno. Inclui os do Google Contatos (em
// inglês mesmo com a conta em português) e do Outlook. "sobrenome" e
// "nome_meio" se juntam ao nome.
const ALIAS: Record<string, string> = {};
const campo = (c: string, nomes: string[]) => nomes.forEach((n) => (ALIAS[n] = c));
campo("nome", [
  "nome", "nomes", "nome completo", "nome do eleitor", "nome eleitor", "nome do contato", "nome contato",
  "nome da pessoa", "nome do apoiador", "nome e sobrenome", "primeiro nome", "eleitor", "apoiador",
  "name", "full name", "first name", "given name", "display name", "contact name",
]);
campo("nome_meio", ["nome do meio", "middle name", "additional name"]);
campo("sobrenome", ["sobrenome", "ultimo nome", "last name", "family name", "surname"]);
// Mais de uma coluna de telefone: WhatsApp > celular > telefone (fixo não recebe).
campo("whatsapp", ["whatsapp", "whats", "whats app", "zap", "whatsapp 1", "numero whatsapp", "numero do whatsapp"]);
campo("whatsapp:celular", ["celular", "celular 1", "telefone celular", "numero do celular", "numero celular", "mobile", "mobile phone"]);
campo("whatsapp:telefone", [
  "telefone", "telefones", "telefone 1", "tel", "fone", "numero de telefone",
  "phone", "phone number", "phone 1 value", "telefone 1 valor",
]);
campo("email", ["email", "e mail", "emails", "endereco de email", "endereco de e mail", "email address", "e mail 1 value", "email 1 value"]);
campo("cidade", ["cidade", "municipio", "city"]);
campo("bairro", ["bairro", "neighborhood"]);
campo("categoria", ["categoria", "grupo"]);
campo("funcao", ["funcao", "cargo"]);
campo("partido", ["partido"]);
campo("instagram", ["instagram", "insta"]);
campo("observacao", ["observacao", "observacoes", "obs", "notas", "anotacoes", "notes"]);

// Sem nenhum cabeçalho exato de nome/telefone, aceita o que claramente é um.
// "Contato" e "Número" só aqui: podem ser o nome ou o número da casa.
const PARECE: [string, RegExp, RegExp?][] = [
  ["nome", /^nome\b|\bname\b|^contato$/, /\b(mae|pai|responsavel|social|fantasia|last|family|middle|nick|file|prefix|suffix|phonetic|yomi)\b|sobrenome/],
  ["whatsapp:telefone", /whats|celular|telefone|\bfone\b|phone|mobile|^numero$|^contato$/, /\b(type|tipo|label)\b/],
];
const eDoCampo = (m: string, c: string) => m === c || m.split(":")[0] === c.split(":")[0];

export function mapearCabecalho(cabecalho: string[]): string[] {
  const norm = cabecalho.map(normalizar);
  const mapa = norm.map((h) => ALIAS[h] ?? "");
  for (const [c, sim, nao] of PARECE) {
    if (mapa.some((m) => eDoCampo(m, c))) continue;
    norm.forEach((h, i) => {
      if (!mapa[i] && sim.test(h) && !(nao && nao.test(h))) mapa[i] = c;
    });
  }
  return mapa;
}

// Linha do cabeçalho: a primeira (entre as 20 do topo) que tem a coluna do
// nome. Pula título, linha em branco e o "sep=;" do Excel. -1 se não achar.
export function acharCabecalho(linhas: string[][]): number {
  const ate = Math.min(linhas.length, 20);
  for (let i = 0; i < ate; i++) if (mapearCabecalho(linhas[i]).includes("nome")) return i;
  return -1;
}

// Campos de uma linha. Coluna repetida (Telefone vazio + Celular preenchido)
// fica com o primeiro valor preenchido; nome do meio e sobrenome entram no nome.
export function registroDaLinha(campos: string[], linha: string[]): Record<string, string> {
  const reg: Record<string, string> = {};
  campos.forEach((c, i) => {
    let v = (linha[i] ?? "").trim();
    // Google Contatos põe vários números na mesma célula: "a ::: b".
    if (c.startsWith("whatsapp")) v = v.split(":::")[0].trim();
    if (c && v && !reg[c]) reg[c] = v;
  });
  reg.whatsapp = reg.whatsapp || reg["whatsapp:celular"] || reg["whatsapp:telefone"] || "";
  delete reg["whatsapp:celular"];
  delete reg["whatsapp:telefone"];
  const partes = [reg.nome, reg.nome_meio, reg.sobrenome].filter(Boolean) as string[];
  const nome = partes.filter((p, i) => i === 0 || !partes[0].toLowerCase().includes(p.toLowerCase())).join(" ");
  if (nome) reg.nome = nome;
  delete reg.nome_meio;
  delete reg.sobrenome;
  return reg;
}
