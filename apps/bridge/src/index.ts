#!/usr/bin/env node
import { DEFAULT_BRIDGE_BASE_URL, DEFAULT_LOCAL_TOKEN } from "@proxy2localai/shared";
import { createBridgeServer } from "./server";

const defaultUrl = new URL(DEFAULT_BRIDGE_BASE_URL);
const port = Number(process.env.PROXY2LOCALAI_PORT ?? process.env.BRIDGE_PORT ?? defaultUrl.port);
const token = process.env.PROXY2LOCALAI_TOKEN ?? DEFAULT_LOCAL_TOKEN;

const server = createBridgeServer({ token });

server.listen(port, "127.0.0.1", () => {
  console.log(`Proxy2LocalAI bridge listening on http://127.0.0.1:${port}`);
  console.log(`Token source: ${process.env.PROXY2LOCALAI_TOKEN ? "PROXY2LOCALAI_TOKEN" : "default local token"}`);
});
