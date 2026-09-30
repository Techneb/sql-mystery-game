"""ERD auto-layout, inline SVG. Stdlib only.

Tables without foreign keys come first, in reveal order, PER_ROW to a row. The linked tables follow as their own
block, layered by foreign-key depth (a parent sits in the row above its children), so every relationship line runs
in the gap between two rows and never crosses a table. Keys are drawn as icons (gold: primary, silver: foreign),
and each line carries its cardinality: a crow's foot and N on the many side, a bar and 1 on the one side.
"""
W, GAP, LAYER_H, ROW, HEAD = 170, 40, 60, 14, 16
PLAIN_H = 24   # between rows of tables without foreign keys: no line runs there
PER_ROW = 2   # a row wraps after this many tables, so the schema stays about one column wide (the site fits it to ~340 px)
KEY = ('<symbol id="erd-key" viewBox="0 0 16 10"><circle cx="4" cy="5" r="2.8"/>'
       '<path d="M7 5H15M12 5V8M14.5 5V7.5"/></symbol>')


def read_schema(conn):
    """-> (tables: {name: [(col, type, is_pk, fk_target or None)]}, fks: [(table, col, ref_table)])"""
    names = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
    tables, fks = {}, []
    for t in names:
        fk = {r[3]: r[2] for r in conn.execute("PRAGMA foreign_key_list(%s)" % t)}
        tables[t] = [(r[1], r[2], bool(r[5]), fk.get(r[1])) for r in conn.execute("PRAGMA table_info(%s)" % t)]
        fks += [(t, col, ref) for col, ref in fk.items()]
    return tables, fks


def layout(tables, fks, order=()):
    """-> {name: (layer, x, y, w, h)}. Layer -1 = no FK either way (placed first, in `order`, then by name);
    else 0 for a linked table referencing nothing, 1 + deepest referenced table otherwise (self-refs ignored).
    Within a layer, ordered by the mean x of the referenced tables, ties by name, wrapped every PER_ROW tables."""
    refs = {t: {ref for (tt, _, ref) in fks if tt == t and ref != t} for t in tables}
    linked = {t for (t, _, ref) in fks} | {ref for (_, _, ref) in fks}
    layer = {}

    def depth(t, seen=()):
        if t not in layer:
            layer[t] = 0 if not refs[t] else 1 + max(depth(r, seen + (t,)) for r in refs[t] if r not in seen)
        return layer[t]

    for t in tables:
        if t in linked:
            depth(t)
        else:
            layer[t] = -1
    rank = {t: i for i, t in enumerate(order)}
    rows = {}
    for t in tables:
        rows.setdefault(layer[t], []).append(t)
    pos, y = {}, 0
    for L in sorted(rows):
        def bary(t):
            if L < 0:
                return (rank.get(t, len(rank)), t)
            xs = [pos[r][1] for r in refs[t] if r in pos]
            return (sum(xs) / len(xs) if xs else 0, t)
        ordered = sorted(rows[L], key=bary)
        for k in range(0, len(ordered), PER_ROW):
            chunk = ordered[k:k + PER_ROW]
            for i, t in enumerate(chunk):
                pos[t] = (L, i * (W + GAP), y, W, HEAD + ROW * len(tables[t]))
            y += max(pos[t][4] for t in chunk) + (PLAIN_H if L < 0 else LAYER_H)
    return pos


def cardinality(conn, table, col):
    """'N' when several rows share a value of the foreign key (many-to-one), '1' when each value is unique."""
    n, d = conn.execute("SELECT COUNT(%s), COUNT(DISTINCT %s) FROM %s" % (col, col, table)).fetchone()
    return "1" if n and n == d else "N"


def fk_paths(tables, fks, pos):
    """-> [(table, col, ref, (sx, sy), (ex, ey), row_bottom)]: from the child's top edge to the parent's bottom edge.
    Several lines between the same two tables are spread sideways so each stays visible."""
    out, seen = [], {}
    for t, col, ref in fks:
        k = seen[(t, ref)] = seen.get((t, ref), -1) + 1
        n = sum(1 for (tt, _, rr) in fks if (tt, rr) == (t, ref))
        dx = (k - (n - 1) / 2) * 50
        _, x1, y1, w1, _ = pos[t]
        _, x2, y2, w2, h2 = pos[ref]
        lean = max(-40, min(40, (x1 + w1 / 2 - (x2 + w2 / 2)) / 4))   # leave the parent leaning towards the child,
        bottom = max(yy + hh for (_, _, yy, _, hh) in pos.values() if yy == y2)   # the parent's row, not just the parent
        out.append((t, col, ref, (x1 + w1 / 2 + dx, y1), (x2 + w2 / 2 + dx + lean, y2 + h2), bottom))   # so lines to two children do not share a start
    return out


def svg(conn, order=()):
    tables, fks = read_schema(conn)
    pos = layout(tables, fks, order)
    width = max(x + w for (_, x, _, w, _) in pos.values()) + 10
    height = max(y + h for (_, _, y, _, h) in pos.values()) + 10
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">' % (width, height, width, height),
           "<defs>%s</defs>" % KEY]
    for t, col, ref, (sx, sy), (ex, ey), bottom in fk_paths(tables, fks, pos):
        many = cardinality(conn, t, col) == "N"
        mid = (bottom + sy) / 2
        g = ['<g class="fk" data-from="%s.%s" data-to="%s">' % (t, col, ref),
             '<path d="M%g %g V%g C%g %g %g %g %g %g"/>' % (ex, ey, bottom, ex, mid, sx, mid, sx, sy),
             '<path d="M%g %g H%g"/>' % (ex - 6, ey + 5, ex + 6),                       # one: a bar under the parent
             '<text x="%g" y="%g">1</text>' % (ex + 5, ey + 12)]
        if many:                                                                        # many: a crow's foot on the child
            g.append('<path d="M%g %g L%g %g M%g %g L%g %g M%g %g V%g"/>'
                     % (sx, sy - 9, sx - 6, sy, sx, sy - 9, sx + 6, sy, sx, sy - 9, sy))
        else:
            g.append('<path d="M%g %g H%g"/>' % (sx - 6, sy - 5, sx + 6))
        g.append('<text x="%g" y="%g">%s</text>' % (sx + 6, sy - 9, "N" if many else "1"))
        out.append("".join(g) + "</g>")
    for t, cols in tables.items():
        _, x, y, w, h = pos[t]
        g = ['<g class="table" data-table="%s" transform="translate(%d,%d)">' % (t, x, y),
             '<rect width="%d" height="%d"/>' % (w, h), '<rect class="head" width="%d" height="%d"/>' % (w, HEAD),
             '<text class="tname" x="6" y="12">%s</text>' % t]
        for i, (c, typ, pk, ref) in enumerate(cols):
            base = HEAD + ROW * (i + 1)
            if pk or ref:
                g.append('<use href="#erd-key" class="key %s" x="4" y="%d" width="14" height="9"/>' % ("pk" if pk else "fk", base - 11))
            g.append('<text class="col" x="21" y="%d">%s</text>' % (base - 3, c))
        out.append("\n".join(g) + "</g>")
    return "\n".join(out) + "\n</svg>\n"
