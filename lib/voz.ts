import { getConfig } from "./config";

// Voz do agente (ElevenLabs). Fica DESLIGADA até existir:
//  - config global "ELEVENLABS_API_KEY", e
//  - config "VOZ:<agenteId>" = {"voice_id":"...","modo":"audio"} (modo "off" desliga).
// Sem isso, `vozDoAgente` retorna null e o responder segue só com texto.

// modo: "sempre" = responde sempre em áudio; "quando_audio" = só quando o
// eleitor manda áudio (texto continua respondendo em texto).
export type VozAgente = { voiceId: string; modo: "sempre" | "quando_audio" };

export async function vozDoAgente(agenteId: number): Promise<VozAgente | null> {
  const raw = await getConfig("VOZ:" + agenteId);
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (o && o.voice_id && o.modo && o.modo !== "off") {
      const modo = o.modo === "sempre" ? "sempre" : "quando_audio";
      return { voiceId: String(o.voice_id), modo };
    }
  } catch {
    /* config inválida = voz desligada */
  }
  return null;
}

// Sintetiza `texto` na voz clonada (mp3) e devolve base64 puro para a Evolution.
export async function sintetizarVoz(
  texto: string,
  voiceId: string,
  apiKey: string
): Promise<{ ok: boolean; base64?: string; erro?: string }> {
  if (!apiKey || !voiceId) return { ok: false, erro: "ElevenLabs não configurada" };
  // Limpa marcações e limita o tamanho (custo/estabilidade).
  const limpo = (texto || "").replace(/[*_#`>~]/g, "").trim().slice(0, 2500);
  if (!limpo) return { ok: false, erro: "Texto vazio" };
  try {
    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json", accept: "audio/mpeg" },
        body: JSON.stringify({
          text: limpo,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.0, use_speaker_boost: true },
        }),
      }
    );
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return { ok: false, erro: `ElevenLabs ${r.status}: ${t.slice(0, 180)}` };
    }
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length) return { ok: false, erro: "Áudio vazio" };
    return { ok: true, base64: buf.toString("base64") };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}
