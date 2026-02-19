# Contributing to Clawlet

Thanks for your interest in contributing. Here's how to get started.

## Setup

```bash
git clone https://github.com/clawletxyz/clawlet.git
cd clawlet
npm install
npm run demo:seed   # populate the dashboard with sample data
npm run dev         # starts API + dashboard with hot reload
```

Open `http://localhost:3000` to see the dashboard.

To test the full x402 payment loop with the mock server:

```bash
npm run demo        # starts API + dashboard + mock x402 server
```

## Project Structure

```
src/           Core library — MCP server, REST API, rules engine, x402, adapters
dashboard/     React + Vite monitoring UI
demo/          Mock x402 server, seed script, integration test
```

## Making Changes

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `npm run build` to make sure everything compiles
4. Test locally with `npm run demo` to verify the full loop
5. Open a pull request

## Code Style

- TypeScript strict mode
- Follow existing patterns in the codebase
- No additional linting tools needed — just match what's there

## Areas We'd Love Help With

- New wallet adapter integrations
- Dashboard UX improvements
- Documentation and examples
- Testing and edge cases in the x402 flow

## Questions?

Open an issue on [GitHub](https://github.com/clawletxyz/clawlet/issues).
