export const tools = [
  {
    name: 'spartacus_search_symbols',
    description:
      'Search @spartacus declarations by name in the .d.ts files of node_modules. Returns name, kind, package, version, the public import specifier, file and line.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Part of the symbol name' },
        kind: {
          type: 'string',
          description: 'Filter by kind (class, interface, enum, function, type, const)',
        },
        package: { type: 'string', description: 'Filter by package, for example cart' },
        limit: { type: 'number', description: 'Maximum results, default 30' },
      },
      required: ['query'],
    },
  },
  {
    name: 'spartacus_get_signature',
    description:
      'Return the full declaration of a @spartacus symbol with the public import specifier to use, the package, the file, the line and the version that the repository runs.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Exact symbol name' },
        package: { type: 'string', description: 'Filter by package when the name repeats' },
        member: {
          type: 'string',
          description:
            'Return only the declaration of the members whose name matches this text, each one complete',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'spartacus_find_examples',
    description:
      'Find where the storefront already uses a @spartacus symbol. Returns the file, the line, the import specifier that file uses and the surrounding code. The examples compile against the installed version.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Exact symbol name' },
        limit: { type: 'number', description: 'Maximum results, default 10' },
        dir: { type: 'string', description: 'Directory to scan, relative to the repository, default src' },
      },
      required: ['name'],
    },
  },
  {
    name: 'spartacus_list_packages',
    description:
      'List the installed @spartacus packages with the version that the repository runs.',
    inputSchema: { type: 'object', properties: {} },
  },
];
