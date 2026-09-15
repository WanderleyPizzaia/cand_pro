import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";

// Formatos que a Meta Cloud API aceita para áudio (não precisa converter).
const META_OK = /(ogg|opus|mpeg|mp3|aac|amr|mp4|m4a)/i;

// Converte um áudio (base64) para OGG/Opus mono, formato que a Meta aceita.
// O Chrome grava em WebM — que a Meta recusa — então convertemos no servidor.
// Retorna { base64, mime } convertido, ou null se não foi possível converter.
export async function paraOggOpus(
  base64: string,
  mime: string
): Promise<{ base64: string; mime: string } | null> {
  // Já é um formato aceito pela Meta: não mexe.
  if (META_OK.test(mime) && !/webm/i.test(mime)) return { base64, mime };

  let ffPath: string;
  try {
    // ffmpeg-static exporta o caminho do binário estático.
    ffPath = (await import("ffmpeg-static")).default as unknown as string;
  } catch {
    return null;
  }
  if (!ffPath) return null;

  const dir = os.tmpdir();
  const inFile = path.join(dir, `au_${randomUUID()}.in`);
  const outFile = path.join(dir, `au_${randomUUID()}.ogg`);
  try {
    await fs.writeFile(inFile, Buffer.from(base64, "base64"));
    await new Promise<void>((resolve, reject) => {
      const ff = spawn(ffPath, [
        "-hide_banner",
        "-loglevel", "error",
        "-y",
        "-i", inFile,
        "-c:a", "libopus",
        "-b:a", "32k",
        "-ar", "48000",
        "-ac", "1",
        "-f", "ogg",
        outFile,
      ]);
      let err = "";
      ff.stderr.on("data", (d) => (err += d.toString()));
      ff.on("error", reject);
      ff.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(err.slice(0, 300) || `ffmpeg saiu ${code}`))
      );
    });
    const buf = await fs.readFile(outFile);
    return { base64: buf.toString("base64"), mime: "audio/ogg" };
  } catch {
    return null;
  } finally {
    fs.unlink(inFile).catch(() => {});
    fs.unlink(outFile).catch(() => {});
  }
}
