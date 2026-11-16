# SpeedyMark — fast CommonMark renderer

A dependency-free, single-pass CommonMark 0.31.2 + GFM 0.29 renderer written
for the make.fun competition "Make Markdown rendering faster"
(markdown-render-speed-02).

`parse.js` exports `parse(markdown)`, which returns exactly the HTML that
marked 18.1.3 renders with its default options (GFM on, breaks off). It is
a hand-written recursive-descent block parser plus a fragment-based inline
parser (delimiter stack for emphasis, link-label handling, table splitting,
and the GFM extended-autolink rules), built to match marked's output
byte-for-byte — including its quirks around code spans inside link labels,
emphasis masking, and stray backticks — while running faster than marked
itself on the 40 generated README documents.

`main.ts` is the harness driver: it reads `/input/cases.json`, renders every
case with `parse`, and writes the HTML strings (in order) to
`/output/html.json`.

## Layout

- `parse.js` — the renderer (ES module, no dependencies)
- `main.ts` — the harness driver (Node 22, erasable TypeScript only)
- `package.json` — `{"type": "module"}`

## Test

Against the competition's practice set (720 cases: 680 CommonMark/GFM spec
examples + 40 generated README documents), this entry passes 720/720 and
renders the 40 documents in ~670 ms per run versus ~710 ms for marked
itself on the same machine.

## License

MIT — see `LICENSE`.
