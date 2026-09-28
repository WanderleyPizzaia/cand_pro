// ============================================================
// Leitura de CSV para a importação de contatos. Sem banco: roda no navegador
// (que lê o arquivo e manda em partes) e no servidor.
// ============================================================

// Texto do arquivo como veio do Excel/Google: UTF-8 (com ou sem BOM), UTF-16
// ("Texto Unicode") ou Windows-1252, que é o "CSV" padrão do Excel em
// português. Lido como UTF-8, o 1252 vira "Jo�o": aí decodifica de novo.
export function decodificarArquivo(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b);
  const utf8 = new TextDecoder("utf-8").decode(b);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(b) : utf8;
}

// Delimitador pela 1ª linha: ";" (Excel em português) ou ",".
export function detectarDelimitador(texto: string): ";" | "," {
  const primeira = texto.split(/\r?\n/, 1)[0] || "";
  return (primeira.match(/;/g)?.length ?? 0) > (primeira.match(/,/g)?.length ?? 0) ? ";" : ",";
}

// Parser de CSV (RFC 4180, tolerante). Aspa só abre campo entre aspas quando
// é o 1º caractere do campo; no meio do texto (ANTONIO "TONHO) é literal.
// Antes, uma aspa sem par engolia todas as linhas seguintes num campo só.
// Remove NUL (U+0000), que o Postgres recusa e derrubava o lote inteiro.
export function parseCSV(texto: string, delim: string): string[][] {
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
  texto = texto.replace(/\u0000/g, "");
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let entreAspas = false;
  let campoComecou = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (entreAspas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else entreAspas = false;
      } else campo += ch;
      continue;
    }
    if (ch === '"' && !campoComecou) {
      entreAspas = true;
      campoComecou = true;
    } else if (ch === delim) {
      linha.push(campo);
      campo = "";
      campoComecou = false;
    } else if (ch === "\n") {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
      campoComecou = false;
    } else if (ch !== "\r") {
      campo += ch;
      campoComecou = true;
    }
  }
  if (campo.length > 0 || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((c) => c.trim()));
}

function normalizar(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Cabeçalhos aceitos -> campo interno.
const ALIAS: Record<string, string> = {
  nome: "nome",
  categoria: "categoria",
  grupo: "categoria",
  funcao: "funcao",
  partido: "partido",
  cidade: "cidade",
  municipio: "cidade",
  bairro: "bairro",
  whatsapp: "whatsapp",
  whats: "whatsapp",
  telefone: "whatsapp",
  celular: "whatsapp",
  email: "email",
  "e-mail": "email",
  instagram: "instagram",
  insta: "instagram",
  observacao: "observacao",
  obs: "observacao",
};

export function mapearCabecalho(cabecalho: string[]): string[] {
  return cabecalho.map((h) => ALIAS[normalizar(h)] ?? "");
}
