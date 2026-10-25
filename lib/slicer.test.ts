import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { metersToGrams, parseDuration, parseGcodeText, parseSliceInfo, readSlicerFile } from "./slicer.ts";

test("durações em vários formatos", () => {
  assert.equal(parseDuration("1h 2m 3s"), 3723);
  assert.equal(parseDuration("1d 2h 3m 4s"), 93784);
  assert.equal(parseDuration("45m 10s"), 2710);
  assert.equal(parseDuration("5422"), 5422);
  assert.equal(parseDuration("1 hour 30 minutes"), 5400);
});

test("PrusaSlicer com duas cores", () => {
  const text = `G1 X10\n; filament used [mm] = 1234.5, 200.1\n; filament used [g] = 3.69, 0.62\n; total filament used [g] = 4.31\n; estimated printing time (normal mode) = 1h 2m 3s\n; estimated printing time (silent mode) = 1h 9m 3s\n; filament_type = PLA;PETG\n; filament_colour = #FF8000;#FFFFFF\n`;
  const r = parseGcodeText(text)!;
  assert.equal(r.seconds, 3723);
  assert.equal(r.totalGrams, 4.31);
  assert.deepEqual(r.filaments, [{ type: "PLA", color: "#FF8000", grams: 3.69 }, { type: "PETG", color: "#FFFFFF", grams: 0.62 }]);
});

test("Bambu Studio / OrcaSlicer: tempo total no cabeçalho e peso total", () => {
  const text = `; HEADER_BLOCK_START\n; BambuStudio 01.09.00.70\n; model printing time: 2h 30m 15s; total estimated time: 2h 36m 52s\n; total layer number: 120\n; total filament length [mm] : 15230.55\n; total filament weight [g] : 45.67\n; filament_density: 1.24\n; HEADER_BLOCK_END\n; filament_type = PLA\n`;
  const r = parseGcodeText(text)!;
  assert.equal(r.seconds, 9412);
  assert.equal(r.totalGrams, 45.67);
  assert.equal(r.filaments[0].grams, 45.67);
  assert.equal(r.filaments[0].type, "PLA");
});

test("Cura: segundos e metros convertidos em gramas", () => {
  const r = parseGcodeText(`;FLAVOR:Marlin\n;TIME:5422\n;Filament used: 4.56789m\n;Layer height: 0.2\n`)!;
  assert.equal(r.seconds, 5422);
  assert.equal(r.totalGrams, metersToGrams(4.56789));
  assert.ok(r.totalGrams! > 13 && r.totalGrams! < 14, "≈ 13,6 g de PLA");
});

test("Simplify3D e arquivo sem dados", () => {
  const r = parseGcodeText(`;   Build time: 1 hour 2 minutes\n;   Plastic weight: 12.34g (0.03lb)\n`)!;
  assert.equal(r.seconds, 3720);
  assert.equal(r.totalGrams, 12.34);
  assert.equal(parseGcodeText("G28\nG1 X0 Y0\n"), undefined);
});

test("slice_info.config com dois pratos", () => {
  const xml = `<?xml version="1.0"?><config><plate><metadata key="index" value="1"/><metadata key="prediction" value="5432"/><metadata key="weight" value="12.34"/><filament id="1" type="PLA" color="#FFFFFF" used_m="4.12" used_g="12.34"/></plate><plate><metadata key="index" value="2"/><metadata key="prediction" value="600"/><metadata key="weight" value="3.5"/><filament id="1" type="PETG" color="#000000" used_m="1" used_g="2.5"/><filament id="2" type="PLA" color="#FF0000" used_m="0.3" used_g="1.0"/></plate></config>`;
  const plates = parseSliceInfo(xml);
  assert.equal(plates.length, 2);
  assert.deepEqual([plates[0].plate, plates[0].seconds, plates[0].totalGrams], [1, 5432, 12.34]);
  assert.equal(plates[1].filaments.length, 2);
});

// ZIP mínimo em memória, para testar a leitura do 3MF sem arquivo real
function zip(files: Record<string, string>) {
  const locals: Buffer[] = [], centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content), data = deflateRawSync(raw), nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data); centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const dir = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}
const fileOf = (bytes: Buffer | string, name: string) => Object.assign(new Blob([typeof bytes === "string" ? bytes : new Uint8Array(bytes)]), { name });

test("3MF fatiado é lido pelo slice_info; 3MF sem fatiar explica o que fazer", async () => {
  const sliced = zip({ "3D/3dmodel.model": "<model/>", "Metadata/slice_info.config": `<config><plate><metadata key="index" value="1"/><metadata key="prediction" value="3600"/><metadata key="weight" value="20.5"/><filament id="1" type="PLA" color="#00FF00" used_g="20.5"/></plate></config>` });
  const plates = await readSlicerFile(fileOf(sliced, "suporte.3mf"));
  assert.equal(plates[0].totalGrams, 20.5);
  assert.equal(plates[0].seconds, 3600);
  await assert.rejects(readSlicerFile(fileOf(zip({ "3D/3dmodel.model": "<model/>" }), "modelo.3mf")), /ainda não foi fatiado/);
});

test("G-code grande: lê só começo e fim", async () => {
  const middle = "G1 X1 Y1 E0.01\n".repeat(80_000);
  const text = `; total estimated time: 1h 0m 0s\n${middle}; filament used [g] = 33.3\n`;
  const [r] = await readSlicerFile(fileOf(text, "peca.gcode"));
  assert.equal(r.seconds, 3600);
  assert.equal(r.totalGrams, 33.3);
  await assert.rejects(readSlicerFile(fileOf("GCDE....", "peca.bgcode")), /binário/);
});
