#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const require = createRequire(import.meta.url);
const schema = require("@uniswap/token-lists/src/tokenlist.schema.json");
const tokenList = JSON.parse(readFileSync(new URL("../tokenlist.json", import.meta.url), "utf8"));

const ajv = new Ajv({ allErrors: true, verbose: true });
addFormats(ajv);
const validate = ajv.compile(schema);
const ok = validate(tokenList);

if (!ok) {
  console.error("VALIDATION FAILED");
  for (const err of validate.errors ?? []) {
    console.error(` - ${err.instancePath || "/"} ${err.message} (keyword: ${err.keyword})`);
  }
  process.exit(1);
}
console.log("OK — tokenlist.json conforms to Uniswap schema");
console.log(`  tokens: ${tokenList.tokens.length}`);
console.log(`  chainIds: ${[...new Set(tokenList.tokens.map(t => t.chainId))].join(", ")}`);
