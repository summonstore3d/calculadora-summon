import test from "node:test";
import assert from "node:assert/strict";
import { auditPayload } from "./state-repository.ts";
import { emptyState, type AppState } from "../lib/summon.ts";

const withMaterial: AppState = {
  ...emptyState,
  materials: [{ id: "m1", brand: "F3D", type: "PLA", color: "Preto", unit: "kg", location: "", stockGrams: 800, averageCost: 95, minimumGrams: 250, status: "active" }],
};

test("importação de backup guarda o estado anterior na auditoria", () => {
  const payload = JSON.parse(auditPayload("backup-import", 12, withMaterial));
  assert.equal(payload.version, 12);
  assert.equal(payload.counts.materials, 1);
  assert.equal(payload.previousState.materials[0].stockGrams, 800);
});

test("outras ações registram só a versão", () => {
  assert.deepEqual(JSON.parse(auditPayload("purchase-create", 3, withMaterial)), { version: 3 });
});

test("estado grande demais registra só as contagens", () => {
  const big: AppState = { ...withMaterial, movements: Array.from({ length: 6000 }, (_, index) => ({ id: `mv${index}`, entity: "material" as const, entityId: "m1", kind: "purchase", quantity: 1000, balanceAfter: 1000, note: "x".repeat(100), createdAt: "2026-10-23T12:00:00.000Z" })) };
  const payload = JSON.parse(auditPayload("backup-import", 5, big));
  assert.equal(payload.previousState, undefined);
  assert.ok(payload.previousStateOmitted > 900_000);
  assert.equal(payload.counts.movements, 6000);
});
