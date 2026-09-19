"""ERD auto-layout: layered by foreign-key depth, barycentre ordering, inline SVG. Stdlib only."""
W, GAP, LAYER_H, ROW = 170, 40, 60, 14


def read_schema(conn):
    """-> (tables: {name: [(col, type, is_pk, fk_target or None)]}, fks: [(table, col, ref_table)])"""
    names = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
    tables, fks = {}, []
    for t in names:
        fk = {r[3]: r[2] for r in conn.execute("PRAGMA foreign_key_list(%s)" % t)}
        tables[t] = [(r[1], r[2], bool(r[5]), fk.get(r[1])) for r in conn.execute("PRAGMA table_info(%s)" % t)]
        fks += [(t, col, ref) for col, ref in fk.items()]
    return tables, fks


def layout(tables, fks, override=None):
    """-> {name: (layer, x, y, w, h)}. Layer 0 = no FK; else 1 + deepest referenced table (self-refs ignored).
    Within a layer, ordered by the mean x of the referenced tables, ties by name. override = {name: (x, y)}."""
    refs = {t: {ref for (tt, _, ref) in fks if tt == t and ref != t} for t in tables}
    layer = {}

    def depth(t, seen=()):
        if t not in layer:
            layer[t] = 0 if not refs[t] else 1 + max(depth(r, seen + (t,)) for r in refs[t] if r not in seen)
        return layer[t]

    for t in tables:
        depth(t)
    rows = {}
    for t in tables:
        rows.setdefault(layer[t], []).append(t)
    pos, y = {}, 0
    for L in sorted(rows):
        def bary(t):
            xs = [pos[r][1] for r in refs[t] if r in pos]
            return (sum(xs) / len(xs) if xs else 0, t)
        for i, t in enumerate(sorted(rows[L], key=bary)):
            pos[t] = (L, i * (W + GAP), y, W, 16 + ROW * len(tables[t]))
        y += max(pos[t][4] for t in rows[L]) + LAYER_H
    for t, (x, yy) in (override or {}).items():
        pos[t] = (pos[t][0], x, yy, W, pos[t][4])
    return pos


def svg(conn, override=None):
    tables, fks = read_schema(conn)
    pos = layout(tables, fks, override)
    width = max(x + w for (_, x, _, w, _) in pos.values()) + 10
    height = max(y + h for (_, _, y, _, h) in pos.values()) + 10
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">' % (width, height, width, height)]
    for t, col, ref in fks:
        _, x1, y1, w1, h1 = pos[t]
        _, x2, y2, w2, h2 = pos[ref]
        row = [c[0] for c in tables[t]].index(col)
        sx, sy = x1 + w1 / 2, y1 + 16 + ROW * row + ROW / 2
        ex, ey = x2 + w2 / 2, y2 + h2
        out.append('<path class="fk" data-from="%s.%s" data-to="%s" d="M%d %d C%d %d %d %d %d %d"/>'
                   % (t, col, ref, sx, sy, sx, sy - 40, ex, ey + 40, ex, ey))
    for t, cols in tables.items():
        _, x, y, w, h = pos[t]
        g = ['<g class="table" data-table="%s" transform="translate(%d,%d)">' % (t, x, y),
             '<rect width="%d" height="%d"/>' % (w, h), '<rect class="head" width="%d" height="16"/>' % w,
             '<text class="tname" x="6" y="12">%s</text>' % t]
        for i, (c, typ, pk, ref) in enumerate(cols):
            label = ("*" if pk else "") + c + (" -> " + ref if ref else "")
            g.append('<text class="col" x="6" y="%d">%s</text>' % (16 + ROW * (i + 1) - 3, label))
        out.append("\n".join(g) + "</g>")
    return "\n".join(out) + "\n</svg>\n"
