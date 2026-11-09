# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- AI provider for Gladys 5.3: the assistant (chat and tool calls, intent router, scene `ai.ask`, weekly digest) runs
  on a local model served by Ollama or any OpenAI-compatible server (LM Studio, llama.cpp, LocalAI, vLLM).
- A chat model and an optional router model, answered within the delays of Gladys (18 s for the router).
- Ollama through its native API: context window (16384 tokens by default) and keep-alive set from Gladys, model
  capabilities checked (a model without tool calling gets a clear error), images turned into a note for a model
  without vision, no thinking for the router.
- Connection status naming the server, the models and the models in memory; "Test the models" and "List the models"
  actions.
- Scene triggers "the assistant fails" (with a kind filter) and "the assistant answers again"; scene actions "load
  the model in memory" and "free the memory" (Ollama).
- "Local AI" dashboard widget: server, models, memory taken, last answer time, failure, load and unload buttons.
- Documentation in English, French, German and Spanish, with the choice of a model for your machine.
