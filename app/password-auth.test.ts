import test from "node:test";
import assert from "node:assert/strict";
import {
  createSessionValue,
  passwordMatches,
  readCookie,
  safeReturnPath,
  verifySessionValue,
} from "./password-auth.ts";

test("sem senha configurada ninguém entra", async () => {
  delete process.env.APP_PASSWORD;
  delete process.env.APP_SESSION_SECRET;
  assert.equal(await passwordMatches(""), false);
  assert.equal(await passwordMatches("qualquer"), false);
  assert.equal(await verifySessionValue("9999999999999.abc"), false);
});

test("senha correta cria sessão válida; sessão expira e não aceita adulteração", async () => {
  process.env.APP_PASSWORD = "filamento-123";
  assert.equal(await passwordMatches("filamento-123"), true);
  assert.equal(await passwordMatches("filamento-124"), false);
  const now = Date.now(), value = await createSessionValue(now);
  assert.equal(await verifySessionValue(value, now), true);
  assert.equal(await verifySessionValue(value, now + 31 * 24 * 3600 * 1000), false);
  const [expires, signature] = value.split(".");
  assert.equal(await verifySessionValue(`${Number(expires) + 1}.${signature}`, now), false);
  process.env.APP_PASSWORD = "outra-senha";
  assert.equal(await verifySessionValue(value, now), false, "trocar a senha encerra sessões");
  delete process.env.APP_PASSWORD;
});

test("lê cookie e só aceita retorno interno", () => {
  assert.equal(readCookie("a=1; gestao3d_sessao=x%2Ey; b=2", "gestao3d_sessao"), "x.y");
  assert.equal(readCookie(null, "gestao3d_sessao"), undefined);
  assert.equal(safeReturnPath("/pedidos/PV-00001"), "/pedidos/PV-00001");
  assert.equal(safeReturnPath("//site-mal.com"), "/");
  assert.equal(safeReturnPath("https://site-mal.com"), "/");
  assert.equal(safeReturnPath("/\\site-mal.com"), "/");
  assert.equal(safeReturnPath("/entrar"), "/");
});
