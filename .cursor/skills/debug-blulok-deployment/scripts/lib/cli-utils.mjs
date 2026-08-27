export function parseFlagArgs(argv, spec) {
  const args = argv.slice(2);
  const out = { ...spec.defaults, positional: [] };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      out.help = true;
      continue;
    }

    const flag = spec.flags?.[arg];
    if (flag) {
      if (flag.takesValue) {
        out[flag.key] = args[++i];
      } else {
        out[flag.key] = true;
      }
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    out.positional.push(arg);
  }

  return out;
}

export function printJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

export function printTable(rows, columns) {
  if (!rows?.length) {
    console.log('(no rows)');
    return;
  }
  const widths = columns.map((col) => {
    const headerLen = col.label.length;
    const dataLen = Math.max(...rows.map((r) => String(r[col.key] ?? '').length));
    return Math.min(Math.max(headerLen, dataLen), col.maxWidth ?? 48);
  });

  const header = columns.map((col, i) => col.label.padEnd(widths[i])).join('  ');
  console.log(header);
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));

  for (const row of rows) {
    console.log(
      columns
        .map((col, i) => {
          const raw = String(row[col.key] ?? '');
          const clipped = raw.length > widths[i] ? `${raw.slice(0, widths[i] - 1)}…` : raw;
          return clipped.padEnd(widths[i]);
        })
        .join('  '),
    );
  }
}

import { pathToFileURL } from 'node:url';

export function isMain(importMetaUrl) {
  return (
    process.argv[1] &&
    importMetaUrl &&
    pathToFileURL(process.argv[1]).href === importMetaUrl
  );
}
