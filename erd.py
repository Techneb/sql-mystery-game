"""ERD auto-layout, inline SVG. Stdlib only.

Rows follow the order the chapters reveal the tables, PER_ROW to a row, so the tables shown so far are always the
top rows. A parent revealed later than its child sits below it, and that line runs upward. Every relationship line
runs in the gaps between rows and the gutters beside and between the columns, never crosses a table and never
overlaps another line. Keys are drawn as icons (gold: primary, silver: foreign),
and each line carries its cardinality: a dot at each end, with N on the many side and 1 on the one side.
"""
import itertools

W, GAP, LAYER_H, ROW, HEAD = 170, 56, 60, 14, 16
MARGIN = 28   # a lane down each outer side, for lines that stay in their column
PER_ROW = 2   # a row wraps after this many tables, so the schema stays about one column wide (the site fits it to its 340-440 px column)
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


def layout(tables, fks, chapters=()):
    """-> {name: (row, x, y, w, h)}. Rows follow reveal order: `chapters` lists the tables each chapter reveals, and
    each chapter's tables are appended after the rows of earlier chapters (tables no chapter reveals come last, by
    name), so the tables shown up to any chapter are always the top rows and never move. Within a chapter a parent
    comes before its child. A table takes a free slot of the last row unless a table it is linked to sits there (a
    line never joins two tables of one row); in a new row it goes in its placed parent's column, else on the left."""
    refs = {t: {ref for (tt, _, ref) in fks if tt == t and ref != t} for t in tables}
    linked = lambda a, b: a in refs[b] or b in refs[a]
    groups = [[t for t in ch if t in tables] for ch in chapters]
    done = {t for ch in groups for t in ch}
    groups.append(sorted(t for t in tables if t not in done))
    rows, col = [], {}
    for ch in groups:
        todo = list(ch)
        while todo:   # a parent before its child: take the first table whose parents in this chapter are placed
            t = next((t for t in todo if not refs[t] & set(todo)), todo[0])
            todo.remove(t)
            want = [col[r] for r in sorted(refs[t]) if r in col]
            free = [i for i in range(PER_ROW) if rows and rows[-1][i] is None]
            if want and want[0] in free:
                free = [want[0]]
            if not free or any(o and linked(o, t) for o in rows[-1]):
                rows.append([None] * PER_ROW)
                free = [want[0] if want else 0]
            rows[-1][free[0]] = t
            col[t] = free[0]
    pos, y = {}, 0
    for k, row in enumerate(rows):
        for i, t in enumerate(row):
            if t:
                pos[t] = (k, MARGIN + i * (W + GAP), y, W, HEAD + ROW * len(tables[t]))
        y += max(pos[t][4] for t in row if t) + LAYER_H
    return pos


def cardinality(conn, table, col):
    """'N' when several rows share a value of the foreign key (many-to-one), '1' when each value is unique."""
    n, d = conn.execute("SELECT COUNT(%s), COUNT(DISTINCT %s) FROM %s" % (col, col, table)).fetchone()
    return "1" if n and n == d else "N"


def fk_paths(tables, fks, pos):
    """-> [dict(t, col, ref, start=(x, y) on the child's edge, end=(x, y) on the parent's edge, d=SVG path,
    segments=[((x1, y1), (x2, y2)), ...] the straight legs, points=the line sampled)].
    Every line is straight legs joined by smooth rounded turns, and no two lines share a leg: each leaves its parent
    from its own point (right half of the bottom edge) and enters its child at its own point (left half of the top
    edge), runs across each gap between rows in its own lane and, when the child is further down, down its own lane
    in a gutter: its column's outer side when it stays in its column, the middle (or either outer side, whichever
    crosses less) when it changes column. A child revealed before its parent sits above it, and its line is the
    mirror image: it leaves the parent's top edge, runs up, and enters the child's bottom edge. Exits, entries and
    gap lanes are ordered by where each line heads, every lane order in each gutter is tried, then any two are
    swapped while fewer lines cross."""
    bands = {}
    for (_, _, y, _, h) in pos.values():
        bands[y] = max(bands.get(y, 0), y + h)
    tops = sorted(bands)
    row = lambda t: tops.index(pos[t][2])
    edges = list(fks)
    up = {e: row(e[0]) < row(e[2]) for e in edges}   # the child sits above its parent (revealed first)
    ga = {e: row(e[2]) - up[e] for e in edges}         # the gap beside the parent: below it, or above it when up
    gb = {e: row(e[0]) - (not up[e]) for e in edges}   # the gap beside the child: above it, or below it when up
    orders = {}   # every list whose order is free: exits per parent edge, entries per child edge, lanes per gap, the gutter
    for e in edges:
        orders.setdefault(("exit", e[2], up[e]), []).append(e)
        orders.setdefault(("entry", e[0], up[e]), []).append(e)
    right = max(x + w for (_, x, _, w, _) in pos.values())
    col = lambda t: int(pos[t][1] > MARGIN)
    centre = {"left": MARGIN / 2, "mid": MARGIN + W + GAP / 2, "right": right + MARGIN / 2}
    width = {"left": MARGIN, "mid": GAP, "right": MARGIN}
    long_edges = [e for e in edges if ga[e] != gb[e]]
    side = {e: "mid" if col(e[0]) != col(e[2]) else ("left", "right")[col(e[0])] for e in long_edges}
    for e in edges:   # which gaps each line crosses horizontally (gap g lies between row g and row g + 1)
        orders.setdefault(("gap", ga[e]), []).append(e)
        if gb[e] != ga[e]:
            orders.setdefault(("gap", gb[e]), []).append(e)

    def route():
        x = {}
        for (kind, t, _), es in [(k, v) for k, v in orders.items() if k[0] in ("exit", "entry")]:
            _, tx, _, w, _ = pos[t]
            for k, e in enumerate(es):   # distinct points along an edge: right half for exits, left half for entries
                f = (k + 1) / (len(es) + 1)
                x[(kind, e)] = tx + w * (0.55 + 0.35 * f) if kind == "exit" else tx + w * (0.1 + 0.35 * f)
        lane_y = {}
        for key, es in orders.items():
            if key[0] == "gap":
                g = key[1]
                top, bottom = bands[tops[g]], tops[g + 1]
                step = min(7, (bottom - top - 16) / len(es))
                for k, e in enumerate(es):
                    lane_y[(e, g)] = (top + bottom) / 2 + (k - (len(es) - 1) / 2) * step
        lane_x = {}
        for g in centre:
            es = orders[("gutter", g)]
            step = min(8, (width[g] - 12) / max(len(es), 1))
            lane_x.update({e: centre[g] + (k - (len(es) - 1) / 2) * step for k, e in enumerate(es)})
        out = []
        for e in edges:
            t, _, ref = e
            ex, ey = x[("exit", e)], pos[ref][2] + (0 if up[e] else pos[ref][4])   # bottom edge, or top when up
            sx, sy = x[("entry", e)], pos[t][2] + (pos[t][4] if up[e] else 0)      # top edge, or bottom when up
            if ga[e] == gb[e]:
                y = lane_y[(e, ga[e])]
                corners = [(ex, ey), (ex, y), (sx, y), (sx, sy)]
            else:
                y1, y2, gx = lane_y[(e, ga[e])], lane_y[(e, gb[e])], lane_x[e]
                corners = [(ex, ey), (ex, y1), (gx, y1), (gx, y2), (sx, y2), (sx, sy)]
            out.append((e, corners))
        return out

    def tidy():   # given the gutter order, order exits, entries and lanes the way that keeps lines apart
        gx = {e: (centre[side[e]], k) for g in centre for k, e in enumerate(orders[("gutter", g)])}
        mid = lambda t: pos[t][1] + pos[t][3] / 2
        for key, es in orders.items():
            if key[0] == "exit":     # exits in the order of where each line heads
                es.sort(key=lambda e: gx[e] if e in gx else (mid(e[0]), 0))
        xs = {e: c[0][0] for e, c in route()}
        for key, es in orders.items():
            if key[0] == "entry":    # entries in the order of where each line comes from
                es.sort(key=lambda e: gx[e] if e in gx else (xs[e], 0))
        paths = dict(route())
        for key, es in orders.items():
            if key[0] == "gap":      # leftward lines: the one starting further left runs higher;
                def lane(e):                             # rightward: the one starting further right; rightward first
                    c = paths[e]                         # (an upward line mirrors it)
                    a, b = (c[1][0], c[2][0]) if ga[e] == key[1] else (c[-3][0], c[-2][0])
                    return ((1, a) if b > a else (0, -a)) if up[e] else ((0, -a) if b > a else (1, a))
                es.sort(key=lane)

    best = None
    switch = [e for e in long_edges if side[e] == "mid"]
    for sides in itertools.product(*[centre] * len(switch)):   # a line that changes column may also go round a side
        side.update(zip(switch, sides))
        for g in centre:   # a line that stays in its column runs down that column's outer side, else down the middle
            orders[("gutter", g)] = [e for e in long_edges if side[e] == g]
        gutters = [orders[("gutter", g)] for g in centre]
        tries = itertools.product(*[itertools.permutations(es) for es in gutters])
        for perms in itertools.islice(tries, 5040):   # every order of the lanes in each gutter (capped)
            for es, perm in zip(gutters, perms):
                es[:] = perm
            tidy()
            c = crossings(route())
            if best is None or c < best[0] or c == best[0] and sides.count("mid") > best[2].count("mid"):
                best = (c, {k: list(v) for k, v in orders.items()}, sides)
    side.update(zip(switch, best[2]))
    for k, v in best[1].items():
        orders[k][:] = v
    best = best[0]
    improved = True
    while improved and best:   # then polish: swap any two, keep it if fewer lines cross
        improved = False
        for es in orders.values():
            for a in range(len(es)):
                for b in range(a + 1, len(es)):
                    es[a], es[b] = es[b], es[a]
                    c = crossings(route())
                    if c < best:
                        best, improved = c, True
                    else:
                        es[a], es[b] = es[b], es[a]
    out = []
    for (t, col, ref), corners in route():
        legs = list(zip(corners, corners[1:]))
        pts = [(ax + (bx - ax) * m / 20, ay + (by - ay) * m / 20) for (ax, ay), (bx, by) in legs for m in range(21)][1:-1]
        out.append(dict(t=t, col=col, ref=ref, start=corners[-1], end=corners[0], d=rounded(corners, 8), segments=legs,
                        points=pts))
    return out


def crossings(routes):
    """How many times two lines meet: a horizontal leg of one across a vertical leg of another (touching counts), and
    100 for two legs running along each other."""
    legs = [(n, (min(ax, bx), min(ay, by), max(ax, bx), max(ay, by)))
            for n, (_, corners) in enumerate(routes) for (ax, ay), (bx, by) in zip(corners, corners[1:])
            if (ax, ay) != (bx, by)]
    hits = 0
    for k, (n1, (x1, y1, X1, Y1)) in enumerate(legs):
        for n2, (x2, y2, X2, Y2) in legs[k + 1:]:
            if n1 == n2:
                continue
            if x1 == X1 and y2 == Y2:     # vertical meets horizontal
                hits += x2 - 1 <= x1 <= X2 + 1 and y1 - 1 <= y2 <= Y1 + 1
            elif y1 == Y1 and x2 == X2:   # horizontal meets vertical
                hits += x1 - 1 <= x2 <= X1 + 1 and y2 - 1 <= y1 <= Y2 + 1
            elif x1 == X1 == x2 == X2 and min(Y1, Y2) > max(y1, y2) or y1 == Y1 == y2 == Y2 and min(X1, X2) > max(x1, x2):
                hits += 100
    return hits


def rounded(points, r):
    """An orthogonal polyline as an SVG path: straight legs, each turn a smooth quarter curve of radius r (less where
    a leg is too short)."""
    d = "M%g %g" % points[0]
    sgn = lambda v: (v > 0) - (v < 0)
    for (ax, ay), (bx, by), (cx, cy) in zip(points, points[1:], points[2:]):
        r1 = min(r, (abs(bx - ax) + abs(by - ay)) / 2, (abs(cx - bx) + abs(cy - by)) / 2)
        px, py = bx - sgn(bx - ax) * r1, by - sgn(by - ay) * r1
        qx, qy = bx + sgn(cx - bx) * r1, by + sgn(cy - by) * r1
        d += " L%g %g Q%g %g %g %g" % (px, py, bx, by, qx, qy)
    return d + " L%g %g" % points[-1]


def svg(conn, chapters=()):
    tables, fks = read_schema(conn)
    pos = layout(tables, fks, chapters)
    width = max(x + w for (_, x, _, w, _) in pos.values()) + MARGIN
    height = max(y + h for (_, _, y, _, h) in pos.values()) + 10
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">' % (width, height, width, height),
           "<defs>%s</defs>" % KEY]
    for e in fk_paths(tables, fks, pos):
        t, col, ref, (sx, sy), (ex, ey) = e["t"], e["col"], e["ref"], e["start"], e["end"]
        many = cardinality(conn, t, col) == "N"
        u = -1 if sy < ey else 1   # an upward line leaves its parent's top edge and enters its child's bottom edge
        g = ['<g class="fk" data-from="%s.%s" data-to="%s">' % (t, col, ref),
             '<path class="rel" d="%s"/>' % e["d"],
             '<circle cx="%g" cy="%g" r="2.6"/>' % (ex, ey + u),                   # a dot at each end,
             '<circle cx="%g" cy="%g" r="2.6"/>' % (sx, sy - u),                   # the cardinality written beside it
             '<text x="%g" y="%g">1</text>' % (ex + 5, ey + (11 if u > 0 else -4)),
             '<text x="%g" y="%g">%s</text>' % (sx + 5, sy - (4 if u > 0 else -11), "N" if many else "1")]
        out.append("".join(g) + "</g>")
    for t, cols in tables.items():
        _, x, y, w, h = pos[t]
        g = ['<g class="table" data-table="%s" transform="translate(%d,%d)">' % (t, x, y),
             '<rect width="%d" height="%d" rx="4"/>' % (w, h),   # the header follows the frame's rounded top corners
             '<path class="head" d="M0 %d V4 A4 4 0 0 1 4 0 H%d A4 4 0 0 1 %d 4 V%d Z"/>' % (HEAD, w - 4, w, HEAD),
             '<text class="tname" x="6" y="12">%s</text>' % t]
        for i, (c, typ, pk, ref) in enumerate(cols):
            base = HEAD + ROW * (i + 1)
            if pk or ref:
                g.append('<use href="#erd-key" class="key %s" x="4" y="%d" width="14" height="9"/>' % ("pk" if pk else "fk", base - 11))
            g.append('<text class="col" x="21" y="%d">%s</text>' % (base - 3, c))
        out.append("\n".join(g) + "</g>")
    return "\n".join(out) + "\n</svg>\n"
