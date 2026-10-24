// Lê peso de filamento e tempo de impressão de arquivos de fatiadores, no navegador.
//
// - G-code de texto: PrusaSlicer, SuperSlicer, OrcaSlicer, Bambu Studio, Cura e Simplify3D
//   (os dados ficam em comentários no começo ou no fim do arquivo; arquivos grandes são lidos só nessas pontas).
// - 3MF fatiado do Bambu Studio e do OrcaSlicer (Metadata/slice_info.config dentro do ZIP), um resultado por prato.
// G-code binário (.bgcode) e 3MF sem fatiar não trazem esses dados de forma legível.

export type SlicedFilament = { type?: string; color?: string; grams?: number };
export type SliceInfo = { source: string; plate?: number; seconds?: number; totalGrams?: number; filaments: SlicedFilament[] };

const PLA_DENSITY = 1.24,
  DIAMETER_MM = 1.75;
const round2 = (value: number) => Math.round(value * 100) / 100;
const numbers = (value: string) =>
  value
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map(Number)
    .filter((x) => Number.isFinite(x));

/** "1d 2h 3m 4s", "2h 33m", "45m 10s" ou só segundos → segundos. */
export function parseDuration(value: string) {
  const text = value.trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text));
  let total = 0,
    found = false;
  for (const [, n, unit] of text.matchAll(/(\d+(?:\.\d+)?)\s*(d|h|m|s|days?|hours?|minutes?|seconds?)\b/gi)) {
    const u = unit.toLowerCase()[0];
    total += Number(n) * (u === "d" ? 86400 : u === "h" ? 3600 : u === "m" ? 60 : 1);
    found = true;
  }
  return found ? Math.round(total) : undefined;
}

/** Comprimento de filamento de 1,75 mm → gramas, pela densidade (PLA quando não informada). */
export const metersToGrams = (meters: number, density = PLA_DENSITY) =>
  round2(((meters * 1000 * Math.PI * (DIAMETER_MM / 2) ** 2) / 1000) * density);

export function parseGcodeText(text: string, source = "G-code"): SliceInfo | undefined {
  const get = (pattern: RegExp) => text.match(pattern)?.[1]?.trim();
  const types =
    get(/^;\s*filament_type\s*=\s*(.+)$/im)
      ?.split(";")
      .map((x) => x.trim())
      .filter(Boolean) || [];
  const colors =
    get(/^;\s*filament_colou?r\s*=\s*(.+)$/im)
      ?.split(";")
      .map((x) => x.trim())
      .filter(Boolean) || [];
  const densities = numbers(get(/^;\s*filament_density\s*=\s*(.+)$/im) || "");

  // Peso por filamento (Prusa, Orca, Bambu) e total
  let perFilament = numbers(get(/^;\s*filament used \[g\]\s*=\s*(.+)$/im) || "");
  let total = Number(get(/^;\s*total filament (?:used|weight) \[g\]\s*[=:]\s*([\d.]+)/im)) || undefined;
  // Simplify3D
  total ??= Number(get(/^;\s*Plastic weights?:\s*([\d.]+)\s*g/im)) || undefined;
  // Cura: só comprimento em metros
  if (!perFilament.length && !total) {
    const meters = numbers((get(/^;\s*Filament used:\s*(.+)$/im) || "").replace(/m\b/g, ""));
    if (meters.length) perFilament = meters.map((m, i) => metersToGrams(m, densities[i] || PLA_DENSITY));
  }
  if (!total && perFilament.length) total = round2(perFilament.reduce((a, b) => a + b, 0));

  // Tempo: total estimado (Bambu/Orca) > modo normal (Prusa) > ;TIME: (Cura) > Build time (Simplify3D)
  const timeText =
    get(/total estimated time:\s*([^;\n]+)/i) ||
    get(/^;\s*estimated printing time \(normal mode\)\s*=\s*(.+)$/im) ||
    get(/^;\s*estimated printing time\s*=\s*(.+)$/im) ||
    get(/^;\s*TIME:\s*(\d+)/m) ||
    get(/^;\s*Build time:\s*(.+)$/im);
  const seconds = timeText ? parseDuration(timeText) : undefined;
  if (!total && !seconds) return undefined;

  const count = Math.max(perFilament.length, types.length > 1 ? types.length : 0, 1);
  const filaments: SlicedFilament[] = Array.from({ length: count }, (_, i) => ({
    type: types[i] || types[0],
    color: colors[i],
    grams: perFilament[i],
  })).filter((f, i) => count === 1 || (f.grams ?? 0) > 0 || i === 0);
  if (filaments.length === 1 && filaments[0].grams === undefined) filaments[0].grams = total;
  return { source, seconds, totalGrams: total, filaments };
}

/** Bambu Studio / OrcaSlicer: Metadata/slice_info.config, um <plate> por prato fatiado. */
export function parseSliceInfo(xml: string, source = "3MF"): SliceInfo[] {
  const plates: SliceInfo[] = [];
  for (const [, body] of xml.matchAll(/<plate>([\s\S]*?)<\/plate>/g)) {
    const meta = (key: string) => body.match(new RegExp(`<metadata\\s+key="${key}"\\s+value="([^"]*)"`))?.[1];
    const filaments: SlicedFilament[] = [...body.matchAll(/<filament\s+([^>]*?)\/?>/g)].map(([, attrs]) => {
      const attr = (name: string) => attrs.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
      return { type: attr("type"), color: attr("color"), grams: Number(attr("used_g")) || undefined };
    });
    const weight = Number(meta("weight")) || round2(filaments.reduce((a, f) => a + (f.grams || 0), 0)) || undefined;
    const seconds = Number(meta("prediction")) || undefined;
    if (!weight && !seconds) continue;
    plates.push({
      source,
      plate: Number(meta("index")) || plates.length + 1,
      seconds,
      totalGrams: weight,
      filaments: filaments.length ? filaments : [{ grams: weight }],
    });
  }
  return plates;
}

// ---------------------------------------------------------------- ZIP (3MF)

async function inflate(data: Uint8Array, method: number) {
  if (method === 0) return data;
  if (method !== 8) throw new Error("Compressão do 3MF não suportada");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Lista e extrai arquivos de um ZIP lendo só o diretório central e o arquivo pedido. */
export async function readZipEntries(file: Blob) {
  const tailSize = Math.min(file.size, 65_557),
    tail = new DataView(await file.slice(file.size - tailSize).arrayBuffer());
  let eocd = -1;
  for (let i = tailSize - 22; i >= 0; i--)
    if (tail.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error("O arquivo não é um 3MF válido");
  const count = tail.getUint16(eocd + 10, true),
    size = tail.getUint32(eocd + 12, true),
    offset = tail.getUint32(eocd + 16, true);
  const dir = new DataView(await file.slice(offset, offset + size).arrayBuffer()),
    decoder = new TextDecoder();
  const entries: { name: string; method: number; compressedSize: number; localOffset: number }[] = [];
  for (let p = 0, i = 0; i < count && p + 46 <= dir.byteLength; i++) {
    if (dir.getUint32(p, true) !== 0x02014b50) break;
    const method = dir.getUint16(p + 10, true),
      compressedSize = dir.getUint32(p + 20, true),
      nameLength = dir.getUint16(p + 28, true),
      extraLength = dir.getUint16(p + 30, true),
      commentLength = dir.getUint16(p + 32, true),
      localOffset = dir.getUint32(p + 42, true);
    entries.push({
      name: decoder.decode(new Uint8Array(dir.buffer, dir.byteOffset + p + 46, nameLength)),
      method,
      compressedSize,
      localOffset,
    });
    p += 46 + nameLength + extraLength + commentLength;
  }
  const read = async (entry: (typeof entries)[number], limit = Infinity) => {
    const header = new DataView(await file.slice(entry.localOffset, entry.localOffset + 30).arrayBuffer());
    const start = entry.localOffset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
    if (entry.method === 0 && limit < entry.compressedSize)
      return new Uint8Array(await file.slice(start, start + limit).arrayBuffer());
    return inflate(new Uint8Array(await file.slice(start, start + entry.compressedSize).arrayBuffer()), entry.method);
  };
  return {
    entries,
    read: async (name: string, limit?: number) => {
      const entry = entries.find((e) => e.name.toLowerCase() === name.toLowerCase());
      return entry ? decoder.decode(await read(entry, limit)) : undefined;
    },
  };
}

// ---------------------------------------------------------------- entrada

const HEAD = 300_000,
  TAIL = 600_000;

/** Lê um arquivo do fatiador e devolve um resultado por prato (G-code tem um só). */
export async function readSlicerFile(file: Blob & { name: string }): Promise<SliceInfo[]> {
  const name = file.name.toLowerCase();
  const magic = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (name.endsWith(".bgcode") || String.fromCharCode(...magic) === "GCDE")
    throw new Error(
      "G-code binário não é lido. No PrusaSlicer, desmarque “G-code binário” nas configurações da impressora e exporte de novo.",
    );
  if (magic[0] === 0x50 && magic[1] === 0x4b) {
    const zip = await readZipEntries(file);
    const info = await zip.read("Metadata/slice_info.config");
    const plates = info ? parseSliceInfo(info, file.name) : [];
    if (plates.length) return plates;
    const gcodes = zip.entries.filter((e) => /\.gcode$/i.test(e.name));
    for (const entry of gcodes) {
      const text = await zip.read(entry.name);
      const parsed =
        text && parseGcodeText(text.length > HEAD + TAIL ? text.slice(0, HEAD) + "\n" + text.slice(-TAIL) : text, file.name);
      if (parsed) plates.push({ ...parsed, plate: plates.length + 1 });
    }
    if (plates.length) return plates;
    throw new Error(
      "Este 3MF ainda não foi fatiado. No Bambu Studio ou OrcaSlicer, fatie o prato e use “Exportar arquivo de projeto fatiado”; ou envie o G-code.",
    );
  }
  const text =
    file.size > HEAD + TAIL
      ? (await file.slice(0, HEAD).text()) + "\n" + (await file.slice(file.size - TAIL).text())
      : await file.text();
  const parsed = parseGcodeText(text, file.name);
  if (!parsed)
    throw new Error(
      "Não encontrei peso nem tempo neste arquivo. Envie o G-code exportado pelo fatiador (PrusaSlicer, OrcaSlicer, Bambu Studio ou Cura).",
    );
  return [parsed];
}
