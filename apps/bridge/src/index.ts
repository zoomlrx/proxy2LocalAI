#!/usr/bin/env node
import { DEFAULT_BRIDGE_BASE_URL, DEFAULT_LOCAL_TOKEN } from "@web2LocalAgent/shared";
import { createBridgeServer } from "./server";

const defaultUrl = new URL(DEFAULT_BRIDGE_BASE_URL);
const port = Number(process.env.web2LocalAgent_PORT ?? process.env.BRIDGE_PORT ?? defaultUrl.port);
const token = process.env.web2LocalAgent_TOKEN ?? DEFAULT_LOCAL_TOKEN;

const server = createBridgeServer({ token });

server.listen(port, "127.0.0.1", () => {
  console.log(`web2LocalAgent bridge listening on http://127.0.0.1:${port}`);
  console.log(`Token source: ${process.env.web2LocalAgent_TOKEN ? "web2LocalAgent_TOKEN" : "default local token"}`);
});
