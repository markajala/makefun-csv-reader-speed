/** Fast CSV parser matching csv-reader 1.0.0 output exactly. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0;
  let line = 1;
  const len = text.length;
  if (len > 0 && text.charCodeAt(0) === 0xFEFF) pos = 1;

  let recordLine = 1;
  let recordRow = null;

  function error(code, extra) {
    const err = { code, line: recordLine, row: recordRow };
    if (extra !== undefined) err[Object.keys(extra)[0]] = Object.values(extra)[0];
    errors.push(err);
  }

  function at(i) {
    return i < len ? text[i] : '';
  }

  // Read unquoted field using indexOf for speed
  function readUnquoted(value) {
    let added = 0;
    while (pos < len) {
      const c = text[pos];
      if (c === ',') {
        pos++;
        return { value, ended: 'comma', added };
      }
      if (c === '\n') {
        pos++;
        line++;
        return { value, ended: 'line break', added };
      }
      if (c === '\r') {
        if (pos + 1 < len && text[pos + 1] === '\n') {
          pos += 2;
          line++;
          return { value, ended: 'line break', added };
        }
        error('stray_cr');
        pos++;
        continue;
      }
      // Fast path: find next special character
      let next = pos;
      while (next < len) {
        const ch = text[next];
        if (ch === ',' || ch === '\n' || ch === '\r') break;
        next++;
      }
      if (next > pos) {
        value += text.slice(pos, next);
        added += next - pos;
        pos = next;
      }
    }
    return { value, ended: 'end', added };
  }

  // Read quoted field
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    pos++; // skip opening quote
    let closed = false;

    while (pos < len) {
      const c = text[pos];
      if (c === '"') {
        if (pos + 1 < len && text[pos + 1] === '"') {
          value += '"';
          pos += 2;
          continue;
        }
        pos++;
        closed = true;
        break;
      }
      if (c === '\r') {
        value += '\n';
        line++;
        pos += (pos + 1 < len && text[pos + 1] === '\n') ? 2 : 1;
        continue;
      }
      if (c === '\n') line++;
      // Fast path for regular characters
      let next = pos;
      while (next < len) {
        const ch = text[next];
        if (ch === '"' || ch === '\r' || ch === '\n') break;
        next++;
      }
      if (next > pos) {
        value += text.slice(pos, next);
        pos = next;
      } else {
        value += c;
        pos++;
      }
    }

    if (!closed) {
      // Unterminated quote: treat quote as literal, re-read as unquoted
      pos = open + 1;
      line = openLine;
      error('unterminated_quote');
      return readUnquoted('"');
    }

    if (pos >= len) return { value, ended: 'end' };
    const c = text[pos];
    if (c === ',') {
      pos++;
      return { value, ended: 'comma' };
    }
    if (c === '\n') {
      pos++;
      line++;
      return { value, ended: 'line break' };
    }
    if (c === '\r' && pos + 1 < len && text[pos + 1] === '\n') {
      pos += 2;
      line++;
      return { value, ended: 'line break' };
    }
    // Quote junk: append what follows up to comma or line break
    const junk = readUnquoted(value);
    if (junk.added > 0) error('quote_junk');
    return junk;
  }

  while (true) {
    // Skip empty lines (only line breaks)
    while (pos < len) {
      if (text[pos] === '\n') {
        pos++;
        line++;
      } else if (text[pos] === '\r' && pos + 1 < len && text[pos + 1] === '\n') {
        pos += 2;
        line++;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let field;
    let quoted;

    do {
      quoted = text[pos] === '"';
      field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
    } while (field.ended === 'comma');

    // Skip record if only empty unquoted field (line with only stray CRs)
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      error('short_row', { fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      error('long_row', { extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}