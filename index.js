// -----------------------------------------------------------------------------
// Entry point of the Local AI external integration.
//
// An AI provider (manifest `type: "ai"`): once an administrator selects it in
// Settings, Artificial Intelligence, every AI request of the Gladys instance —
// the chat and its tool calls, the intent router, the scene `ai.ask` action,
// the weekly digest — is answered by a model running at home, on Ollama or any
// OpenAI-compatible server (LM Studio, llama.cpp, LocalAI, vLLM...).
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them; the hostname of the first one is also the default
// address of Ollama (the host of Gladys).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

logger.info(`Starting the Local AI integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
