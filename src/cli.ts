#!/usr/bin/env node

import { existsSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const VERSION = "0.0.2"

const LOGO = `                                                                                    
                                      @@@@@@@@@@                                
                            @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@                      
                       @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@                  
                   @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@               
                @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@             
               @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@           
              @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@         
       @@@@@@ @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@        
      @@@@@@@ @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@       
      @@@@@@@ @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@      
     @@@@@@@@ @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@     
      @@@@@@@  @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@    
      @@@@@@@@ @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@         @@@@@@@@@@@@@@@@    
      @@@@@@@@@  @@@@@@@@@@@@@@@@@@@@@@@@@@@  @@@@                   @@@@@@@@   
       @@@@@@@@@@ @@@@@@@@@@@@@@@@@@@@@@@  @@@@@@@@@@                      @@   
       @@@@@@@@@@  @@@@@@@@@@@@@@@@@@@@@ @@@@@@@@@@@@@@@@@@@@@        @@        
        @@@@@@@@     @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@        
         @@@             @@@@@@@@@@@@@@ @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@          
                             @@@@@@@@@@ @@@@@@@@@@@@@@@@@@@@@@@@@@@@            
                                   @@@   @@@@@@@@@@@@@@@@@@@@@@@                
                                                @@@@@@@@                                                                  
`

const HELP = `${LOGO}
  clawlet v${VERSION}
  Spend controls for AI agents + x402 payments over HTTP

  Usage:
    clawlet                Start the dashboard and API server
    clawlet start          Same as above
    clawlet mcp            Start the MCP server (stdio transport, for Claude Desktop)

  Options:
    --port <number>        Port for the dashboard server (default: 3000)
    --help, -h             Show this help message
    --version, -v          Show version number
`

function printMcpConfig(port: number) {
  const nodePath = process.execPath
  // Resolve the path to the MCP server entry point
  const __filename = fileURLToPath(import.meta.url)
  const mcpEntry = join(__filename, "..", "index.js")

  console.log(`
  To connect Claude Desktop, add this to your claude_desktop_config.json:

  {
    "mcpServers": {
      "clawlet": {
        "command": "${nodePath}",
        "args": ["${mcpEntry}"]
      }
    }
  }

  Config file location:
    macOS:   ~/Library/Application Support/Claude/claude_desktop_config.json
    Windows: %APPDATA%\\Claude\\claude_desktop_config.json
`)
}

function printBanner(port: number) {
  const stateFile = join(process.cwd(), ".clawlet", "state.json")
  const isFirstRun = !existsSync(stateFile)

  console.log(`
  ┌─────────────────────────────────────────┐
  │                                         │
  │   clawlet v${VERSION.padEnd(29)}│
  │   Spend controls for AI agents          │
  │                                         │
  │   Dashboard:  http://localhost:${String(port).padEnd(9)}│
  │   API:        http://localhost:${String(port).padEnd(9)}│
  │                                         │
  └─────────────────────────────────────────┘
`)

  if (isFirstRun) {
    console.log(`  First run detected — no wallet found.`)
    console.log(
      `  Open http://localhost:${port} to create your first wallet.\n`,
    )
  }

  printMcpConfig(port)
}

async function startDashboard(port: number) {
  process.env.PORT = String(port)
  const { main } = await import("./api.js")
  printBanner(port)
  await main({ silent: true })
}

async function startMcp() {
  // index.ts boots itself on import
  await import("./index.js")
}

// ── Parse args ────────────────────────────────────────────────

const args = process.argv.slice(2)

if (args.includes("--help") || args.includes("-h")) {
  console.log(HELP)
  process.exit(0)
}

if (args.includes("--version") || args.includes("-v")) {
  console.log(VERSION)
  process.exit(0)
}

const command = args.find((a) => !a.startsWith("-")) ?? "start"
const portIdx = args.indexOf("--port")
const port = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : 3000

if (isNaN(port) || port < 1 || port > 65535) {
  console.error("  Error: --port must be a number between 1 and 65535")
  process.exit(1)
}

switch (command) {
  case "start":
    startDashboard(port).catch((err) => {
      console.error("Fatal:", err)
      process.exit(1)
    })
    break

  case "mcp":
    startMcp().catch((err) => {
      console.error("Fatal:", err)
      process.exit(1)
    })
    break

  default:
    console.error(`  Unknown command: ${command}\n${HELP}`)
    process.exit(1)
}
