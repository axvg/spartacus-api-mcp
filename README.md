# spartacus-api-mcp

Reads the `.d.ts` files under `node_modules/@spartacus` and returns the declaration of a symbol
with its package, version, file and line. It runs locally, reads only, and needs no credential.

SAP Spartacus ships a release every few weeks and the public docs are not split per release. The
installed types are the only source that matches the code a project builds against, so this server
reads those instead of the published documentation.

## Install

```bash
git clone https://github.com/axvg/spartacus-api-mcp
cd spartacus-api-mcp
npm install
```

## Configure

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

The server looks for `node_modules/@spartacus` in this order: the first argument, the
`SPARTACUS_REPO` variable, the working directory. Pass the path when the client starts the server
from somewhere else:

```json
"args": ["../spartacus-api-mcp/index.js", "/path/to/your/storefront"]
```

## Tools

| Tool | Returns |
|---|---|
| `spartacus_search_symbols` | Symbols matching a name. Filters by kind and package. |
| `spartacus_get_signature` | The declaration of one symbol, with package, version, file and line. `member` narrows it to the matching lines. |
| `spartacus_list_packages` | The installed `@spartacus` packages and their versions. |

`spartacus_get_signature` with `name: ActiveCartFacade` answers:

```json
{
  "name": "ActiveCartFacade",
  "kind": "class",
  "package": "@spartacus/cart",
  "version": "221121.11.0",
  "file": "node_modules/@spartacus/cart/types/spartacus-cart-base-root.d.ts",
  "line": 717,
  "signature": "declare abstract class ActiveCartFacade { ... }"
}
```

## Re-export aliases

Bundled `.d.ts` files publish many symbols under another name:

```ts
export { es as cartBaseTranslationsEs };
```

The index holds each alias as its own entry, with `aliasOf` set to the name it renames. Without it,
a lookup for `cartBaseTranslationsEs` answers "not found" while the symbol is there.

## Layout

```
index.js       argument parsing, --self-check, start
src/parser.js  reads the .d.ts files and builds the index
src/query.js   search, signature and package lookups
src/tools.js   the three tool definitions
src/server.js  MCP server and request handlers
```

## Self check

```bash
node index.js /path/to/your/storefront --self-check
```

It builds the index and checks three cases: a class, a re-export alias and a name that does not
exist. It prints the symbol count and exits with 1 on failure. Without `node_modules/@spartacus` it
prints SKIP and exits with 0, so it does not break a pipeline that has no storefront installed.

## Limits

- It reads `<package>/types/**/*.d.ts` only. Symbols declared elsewhere in a package are missing
  from the index.
- It parses declarations with a regular expression, not with the TypeScript compiler. It finds
  classes, interfaces, enums, functions, types, constants and namespaces. It does not resolve
  generics, inheritance chains or references.
- Aliases resolve inside one file. `export { X } from './other'` is not followed.
- It never writes to the project it reads.

## License

MIT
