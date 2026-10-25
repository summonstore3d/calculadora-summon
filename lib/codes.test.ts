import test from "node:test";
import assert from "node:assert/strict";
import {channelPrice,nextSequence} from "./summon.ts";

test("códigos seguem o maior número usado, mesmo após exclusões", () => {
  assert.equal(nextSequence(["PRD-0001","PRD-0003"],"PRD-",4),"PRD-0004");
  assert.equal(nextSequence(["prd-0009","SKU-LIVRE"],"PRD-",4),"PRD-0010");
  assert.equal(nextSequence([],"PV-",5),"PV-00001");
  assert.equal(nextSequence(["LT-20261023-1","LT-20261023-2","LT-20261022-7"],"LT-20261023-",1),"LT-20261023-3");
});

test("preço sugerido acompanha o canal", () => {
  const product={snapshot:{directPrice:42.2,shopeePrice:59,mlPrice:51.5}} as any;
  assert.equal(channelPrice(product,"direct"),42.2);
  assert.equal(channelPrice(product,"shopee"),59);
  assert.equal(channelPrice(product,"ml"),51.5);
  assert.equal(channelPrice(product,"other"),42.2);
  assert.equal(channelPrice({snapshot:{directPrice:30,shopeePrice:0,mlPrice:0}} as any,"shopee"),30);
});
