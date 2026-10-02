"""ERD auto-layout, inline SVG. Stdlib only.

Tables without foreign keys come first, in reveal order, PER_ROW to a row. The linked tables follow as their own
block, layered by foreign-key depth (a parent sits in the row above its children), so every relationship line runs
in the gap between two rows and never crosses a table. Keys are drawn as icons (gold: primary, silver: foreign),
and each line carries its cardinality: a dot at each end, with N on the many side and 1 on the one side.
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
            parent = any(t in refs[c] for c in tables if c != t)   # parents go last in their layer, next to their children,
            return (parent, sum(xs) / len(xs) if xs else 0, t)       # so fewer lines need the gutter
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
    """-> [dict(t, col, ref, start=(x, y) on the child's top edge, end=(x, y) on the parent's bottom edge, d=SVG path,
    points=the line sampled, for the test that keeps lines off tables)]. A child in the row just below its parent gets
    one soft S in the gap between the rows. A child further down runs in the gutter between the two columns: down
    out of the parent's row, across the gap, down the gutter, across the gap above the child, and in, corners rounded.
    Lines sharing a gutter or two tables are spread apart, and a parent's lines leave it at different points."""
    bands = {}
    for (_, _, y, _, h) in pos.values():
        bands[y] = max(bands.get(y, 0), y + h)
    tops = sorted(bands)
    gutter = W + GAP / 2
    long_edges = [(t, col, ref) for t, col, ref in fks if tops.index(pos[t][2]) > tops.index(pos[ref][2]) + 1]
    out, seen = [], {}
    for t, col, ref in fks:
        k = seen[(t, ref)] = seen.get((t, ref), -1) + 1
        n = sum(1 for (tt, _, rr) in fks if (tt, rr) == (t, ref))
        dx = (k - (n - 1) / 2) * 50
        _, x1, y1, w1, _ = pos[t]
        _, x2, y2, w2, h2 = pos[ref]
        lean = max(-40, min(40, (x1 + w1 / 2 - (x2 + w2 / 2)) / 4))   # leave the parent leaning towards the child
        sx, sy = x1 + w1 / 2 + dx, y1
        ex, ey = x2 + w2 / 2 + dx + lean, y2 + h2
        i, j = tops.index(y2), tops.index(y1)
        if j == i + 1:   # the next row: one S in the gap
            c1, c2 = curve_controls(ey, bands[y2], sy)
            d = "M%g %g C%g %g %g %g %g %g" % (ex, ey, ex, c1, sx, c2, sx, sy)
            pts = [((1 - u) ** 3 * ex + 3 * (1 - u) ** 2 * u * ex + 3 * (1 - u) * u * u * sx + u ** 3 * sx,
                    (1 - u) ** 3 * ey + 3 * (1 - u) ** 2 * u * c1 + 3 * (1 - u) * u * u * c2 + u ** 3 * sy)
                   for u in [m / 40 for m in range(1, 40)]]
        else:            # further down: through the gutter, each line in its own lane
            lane = long_edges.index((t, col, ref)) - (len(long_edges) - 1) / 2
            gx = gutter + lane * 6
            g1 = (bands[y2] + tops[i + 1]) / 2 + lane * 3
            g2 = (bands[tops[j - 1]] + y1) / 2 + lane * 3
            corners = [(ex, ey), (ex, g1), (gx, g1), (gx, g2), (sx, g2), (sx, sy)]
            d = rounded(corners, 6)
            pts = [(ax + (bx - ax) * m / 20, ay + (by - ay) * m / 20)
                   for (ax, ay), (bx, by) in zip(corners, corners[1:]) for m in range(21)][1:-1]
        out.append(dict(t=t, col=col, ref=ref, start=(sx, sy), end=(ex, ey), d=d, points=pts))
    return out


def rounded(points, r):
    """An orthogonal polyline as an SVG path, each corner rounded by r (less where a leg is shorter)."""
    d = "M%g %g" % points[0]
    for (ax, ay), (bx, by), (cx, cy) in zip(points, points[1:], points[2:]):
        r1 = min(r, (abs(bx - ax) + abs(by - ay)) / 2, (abs(cx - bx) + abs(cy - by)) / 2)
        sgn = lambda v: (v > 0) - (v < 0)
        px, py = bx - sgn(bx - ax) * r1, by - sgn(by - ay) * r1
        qx, qy = bx + sgn(cx - bx) * r1, by + sgn(cy - by) * r1
        d += " L%g %g Q%g %g %g %g" % (px, py, bx, by, qx, qy)
    return d + " L%g %g" % points[-1]


def curve_controls(ey, bottom, sy):
    """One soft S from the parent's bottom edge to the child's top edge. Both control points sit below the parent's
    row (bottom), so the curve leaves the parent straight down and only swings sideways in the gap between rows."""
    return bottom + (sy - bottom) * 0.62, bottom + (sy - bottom) * 0.38


def svg(conn, order=()):
    tables, fks = read_schema(conn)
    pos = layout(tables, fks, order)
    width = max(x + w for (_, x, _, w, _) in pos.values()) + 10
    height = max(y + h for (_, _, y, _, h) in pos.values()) + 10
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">' % (width, height, width, height),
           "<defs>%s</defs>" % KEY]
    for e in fk_paths(tables, fks, pos):
        t, col, ref, (sx, sy), (ex, ey) = e["t"], e["col"], e["ref"], e["start"], e["end"]
        many = cardinality(conn, t, col) == "N"
        g = ['<g class="fk" data-from="%s.%s" data-to="%s">' % (t, col, ref),
             '<path class="rel" d="%s"/>' % e["d"],
             '<circle cx="%g" cy="%g" r="2.6"/>' % (ex, ey + 1),                   # a dot at each end,
             '<circle cx="%g" cy="%g" r="2.6"/>' % (sx, sy - 1),                   # the cardinality written beside it
             '<text x="%g" y="%g">1</text>' % (ex + 5, ey + 11),
             '<text x="%g" y="%g">%s</text>' % (sx + 5, sy - 4, "N" if many else "1")]
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
