import test from "node:test";
import assert from "node:assert/strict";
import {localDay,localMonth} from "./summon.ts";

test("dia e mês seguem o horário de Brasília", () => {
  // 23/10 às 22h em Brasília = 24/10 01h em UTC
  assert.equal(localDay("2026-10-24T01:00:00.000Z"), "2026-10-23");
  // 31/10 às 21h30 em Brasília ainda é outubro
  assert.equal(localMonth("2026-11-01T00:30:00.000Z"), "2026-10");
  assert.equal(localDay(new Date("2026-10-23T15:00:00.000Z")), "2026-10-23");
});

test("datas só com o dia passam sem conversão e vazio continua vazio", () => {
  assert.equal(localDay("2026-10-23"), "2026-10-23");
  assert.equal(localMonth("2026-10-01"), "2026-10");
  assert.equal(localDay(undefined), "");
  assert.equal(localMonth(""), "");
  assert.equal(localDay("não é data"), "");
});
