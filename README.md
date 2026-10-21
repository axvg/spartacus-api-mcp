# spartacus-api-mcp

MCP (Model Context Protocol) server for SAP Spartacus, the composable storefront. It answers what
an API looks like in the version a project has installed, so an AI assistant writes imports and
calls that compile instead of ones it remembers from another release.

It reads the `.d.ts` files under `node_modules/@spartacus` with the TypeScript compiler. It runs
locally, reads only, talks to no backend and needs no credential.

## Features

- **Symbol search**: find classes, interfaces, enums, types, functions, constants and namespaces by
  name, filtered by kind or package.
- **Public import path**: the specifier to import from, for example `@spartacus/cart/base/root`,
  taken from the `exports` map of each package, not the physical file. A name the package does not
  export says `exported: false`, carries no specifier, and names the alias it is published under,
  so a generated import never uses a name that does not exist.
- **Exact signatures**: the whole declaration as the compiler sees it, with no truncation.
- **Members**: ask for one member and get its complete declaration, parameters and return type
  included. Only members declared on the type match, never the parameters of its methods.
- **Re-export aliases**: names published through `export { X as Y }` and `export type { X as Y }`
  resolve to the declaration they rename, and carry `aliasOf`.
- **JSDoc**: the documentation the Spartacus authors wrote travels with the declaration, for the
  symbol and for each member, `@param` and `@returns` included.
- **Usage examples**: where the storefront already uses a symbol, with the file, the line, the
  import that file uses and the surrounding code. They compile against the installed version.
- **Installed versions**: every answer states the package version the project runs. The index
  rebuilds itself when those versions change.

## Installation

```bash
git clone https://github.com/axvg/spartacus-api-mcp.git
cd spartacus-api-mcp
npm install
```

## Configuration

Add the server to the `.mcp.json` of a Spartacus project:

```json
{
  "mcpServers": {
    "spartacus-api": {
      "type": "stdio",
      "command": "node",
      "args": ["../spartacus-api-mcp/index.js"]
    }
  }
}
```

The storefront to read is resolved in this order:

| Source | Example | Notes |
|---|---|---|
| First argument | `node index.js /srv/storefront` | Wins over the rest. |
| `SPARTACUS_REPO` | `SPARTACUS_REPO=/srv/storefront` | For clients that pass no arguments. |
| Working directory | - | Default. Works when the client starts the server at the project root. |

The path is the root of the storefront, the folder that holds `node_modules`, not the
`node_modules/@spartacus` folder itself.

## Tools

| Tool | Returns |
|---|---|
| `spartacus_search_symbols` | Symbols matching a name, with kind, package, version, import specifier, file and line. Filters by `kind` and `package`. |
| `spartacus_get_signature` | The declaration of one symbol with its JSDoc. `member` answers with the matching members instead, each one complete and with its own JSDoc. |
| `spartacus_find_examples` | Where the storefront already uses the symbol: file, line, the import that file uses and the code around it. Takes `limit` and `dir`. |
| `spartacus_list_packages` | The installed `@spartacus` packages and their versions. |

`spartacus_get_signature` with `name: OrderHistory`:

```json
{
  "name": "OrderHistory",
  "kind": "interface",
  "package": "@spartacus/order",
  "version": "221121.11.0",
  "exported": true,
  "import": "@spartacus/order/root",
  "file": "node_modules/@spartacus/order/types/spartacus-order-root.d.ts",
  "line": 57,
  "signature": "interface OrderHistory {\n    code?: string;\n    ...\n}"
}
```

With `name: ActiveCartFacade` and `member: addEntry`:

```json
{
  "name": "addEntry",
  "doc": "Add entry to active cart\n@param productCode\n@param quantity\n@param pickupStore",
  "signature": "abstract addEntry(productCode: string, quantity: number, pickupStore?: string): void;"
}
```

`spartacus_find_examples` with `name: ActiveCartFacade`:

```json
{
  "file": "src/app/common-components/product-card/product-card.component.ts",
  "line": 26,
  "import": "import { ActiveCartFacade, CartUiEventAddToCart } from '@spartacus/cart/base/root'",
  "snippet": "logger = inject(LoggerService);\nactiveCartService = inject(ActiveCartFacade);\nmodalService = inject(LaunchDialogService);"
}
```

## Layout

```
index.js       argument parsing, --self-check, start
src/parser.js  walks the .d.ts files with the TypeScript compiler and builds the index
src/query.js   search, signature and package lookups, index refresh
src/usage.js   scans the storefront source for real uses of a symbol
src/tools.js   the four tool definitions
src/server.js  MCP server and request handlers
test/          fixtures and node:test suite
```

## Tests

```bash
npm test                                    # fixtures, no storefront needed
node index.js /path/to/storefront --self-check   # against a real installation
```

The suite runs on synthetic `.d.ts` fixtures and covers declarations with and without the `declare`
keyword, both alias forms, overloads, members and a brace inside a string. The self check builds the
index of a real storefront and prints the symbol count. Without `node_modules/@spartacus` it prints
SKIP and exits with 0, so it does not break a pipeline with no storefront installed.

## Limits

- It reads `<package>/types/**/*.d.ts`. A package that ships its types elsewhere is not indexed.
- It does not resolve inheritance. Members a class gets from its parent are in the parent's
  declaration, not in the answer.
- Exports declared inside a `declare namespace` block are not read, so a symbol published only
  that way reports `exported: false`.
- Aliases resolve inside one file. `export { X } from './other'` is not followed.
- Examples come from the storefront being read. A symbol the project has never used returns none.
- It does not list extension points. Which service to replace or which config to set is not in the
  answer.

## License

MIT
