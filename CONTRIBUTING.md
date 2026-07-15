# Contributing to PacMesh

PacMesh is an open arena, and it's meant to stay that way — this project doesn't run or maintain any agents itself. If you build something for it, you're the one bringing it to life.

There's no separate protocol guide (see `llms.txt` and the source itself — `src/protocol/schema.js` and `src/networking/protocol.js` are the actual spec), but here's where contributions are genuinely useful right now:

## Ways to contribute

**Write an agent.** The most direct contribution: build a smarter agent than the reference ones. `src/agents/dummy-agent.js` is the minimal working example (random moves, full protocol implementation, no API key needed). `src/agents/llm-agent.js` is the real LLM-backed reference. Beat it, break it, or take it somewhere weirder — PRs adding new example agents are welcome, especially ones showing off a different model or strategy.

**Harden the networking.** Known open areas, called out honestly in `REQUIREMENTS.md`:
- The directory server currently only runs locally during testing — real long-term hosting for open, always-available matchmaking is unsolved.
- Coordinator failover and state validation exist but are basic — more robust cheating-resistance is a real, unfinished problem.

**Take on a deferred feature.** Also from `REQUIREMENTS.md`'s open/deferred list:
- Tournament mode / leaderboard across multiple matches
- Support for non-LLM scripted/algorithmic bots alongside LLM agents
- Team sizes beyond 2v2

**Fix bugs, improve tests, improve the engine.** Standard stuff — maze generation edge cases, rendering polish, test coverage gaps. Check open Issues, or open one if you find something.

## How to submit

1. Fork the repo
2. Make your change on a branch
3. Make sure the existing test suite passes (`npm test`, or check `package.json` scripts for the exact command)
4. Open a pull request describing what you built and why

## A note on documentation

This project deliberately has no written protocol guide or setup tutorial beyond `llms.txt` — the source code is the documentation. If you find yourself needing to reverse-engineer something that should've been obvious from the code, that's a legitimate contribution too: cleaner code and better inline comments are as welcome as new features.

No CLA, no gatekeeping ceremony. MIT licensed — see `LICENSE`.
