import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { tools } from './tools.js';

export async function startServer(catalog) {
  const server = new Server(
    { name: 'spartacus-api-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = request.params.arguments || {};
    let payload;
    if (request.params.name === 'spartacus_search_symbols') payload = catalog.searchSymbols(args);
    else if (request.params.name === 'spartacus_get_signature') payload = catalog.getSignature(args);
    else if (request.params.name === 'spartacus_list_packages') payload = catalog.listPackages();
    else payload = { error: `unknown tool ${request.params.name}` };
    return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
  });

  await server.connect(new StdioServerTransport());
}
