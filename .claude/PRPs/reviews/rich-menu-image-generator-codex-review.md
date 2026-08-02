No files were changed.

## Findings

### 1. SEVERITY: HIGH — The font guard can approve the wrong Thai font

Document/section: [Phase-1 plan — Task 2, `assertThaiFontActive`](/D:/genAI/jsk-app/.claude/PRPs/plans/rich-menu-image-generator-phase1.plan.md:307)

> “(3) กัน `check()` ที่คืน true เพราะ ‘ไม่มี face ไหน match เลย’”

The proposed comparison:

```ts
w1 = width using Noto stack
w2 = width using nonexistent font + monospace
```

does not prove Noto Sans Thai is active. If Noto fails, `w1` can use Leelawadee UI, Thonburi, Tahoma, or another system Thai fallback. Its width will usually differ from monospace, so the guard passes while using the wrong font.

The underlying correction is valid: the CSS Font Loading specification explicitly says `check()` returns `true` when no specified face exists. But the proposed third layer does not close that hole. [CSS Font Loading Level 3](https://www.w3.org/TR/css-font-loading/)

Concrete fix:

```ts
const faces = await document.fonts.load(
  `700 100px "Noto Sans Thai"`,
  sample,
);

if (faces.length === 0 || faces.some((face) => face.status !== 'loaded')) {
  throw new Error('ไม่พบหรือโหลดฟอนต์ Noto Sans Thai ไม่สำเร็จ');
}
```

Keep the full runtime stack for drawing, but verify the canonical first family separately. Treat width probes only as secondary diagnostics.

---

### 2. SEVERITY: HIGH — `truncateToWidth` discards an entire Thai word when one glyph would suffice

Document/section: [Phase-1 plan — Task 3, `truncateToWidth`](/D:/genAI/jsk-app/.claude/PRPs/plans/rich-menu-image-generator-phase1.plan.md:418)

> `let units = toBreakableUnits(segmentText(line));`

`segmentText()` returns word-level units. A Thai line without spaces is commonly one word unit. If the line fits but `line + …` exceeds the width by one glyph, the loop removes the whole word and returns only `…`.

This directly undermines REV 2 correction #8, which correctly required overwide words to be split into graphemes.

Concrete fix: truncate using safe grapheme units, not word units:

```ts
const graphemes = splitGraphemes(line);
let units = toBreakableUnits(
  graphemes.map((text) => ({ text, isWordLike: true })),
);

if (measure(ELLIPSIS) > maxWidthPx) return '';

while (
  units.length > 0 &&
  measure(units.join('').trimEnd() + ELLIPSIS) > maxWidthPx
) {
  units.pop();
}

return units.join('').trimEnd() + ELLIPSIS;
```

Add a test where a one-word Thai line fits, `line + …` does not, and the result must contain a nonempty prefix plus `…`.

---

### 3. SEVERITY: HIGH — `fitTextToBox` does not resolve vertical overflow

Document/section: [Phase-1 plan — Task 3, `fitTextToBox`](/D:/genAI/jsk-app/.claude/PRPs/plans/rich-menu-image-generator-phase1.plan.md:427)

> `if (!fits(fontSizePx, lines)) { lines = lines.slice(0, MAX_LINES); ... }`

`fits()` can fail because:

- there are too many lines;
- a line is too wide; or
- the block is too tall.

The recovery always slices to two lines and adds an ellipsis. That does not fix a height failure. For a shallow box, it returns vertically overflowing lines; `ctx.clip()` merely hides them. It can also add `…` to a complete one-line label when nothing was omitted.

Concrete fix:

```ts
const maxLinesByHeight =
  availH < ascent + descent
    ? 0
    : Math.floor((availH - ascent - descent) / lineHeight) + 1;

const visibleLineCount = Math.min(MAX_LINES, maxLinesByHeight);

if (visibleLineCount === 0) {
  return { fontSizePx, lines: [], didTruncate: text.length > 0 };
}

const omittedLines = lines.length > visibleLineCount;
lines = lines.slice(0, visibleLineCount);

if (omittedLines) {
  lines.at(-1)! = truncateToWidth(lines.at(-1)!, availW, measure);
}
```

Then reassert width and height postconditions before returning.

---

### 4. SEVERITY: HIGH — Phase 1 deletes its only real-browser verification

Document/section: [Phase-1 plan — Task 7](/D:/genAI/jsk-app/.claude/PRPs/plans/rich-menu-image-generator-phase1.plan.md:662)

> “Task 7 (optional): dev harness”  
> “ต้องลบทิ้งก่อน commit”

The jsdom limitation is real: this repository’s jsdom 25.0.1 returns `null` from `canvas.getContext('2d')` without `canvas`. But making the browser harness optional and deleting it leaves no regression coverage for:

- actual font activation;
- Canvas font parsing;
- browser text metrics;
- Thai shaping;
- baseline positioning;
- PNG production and dimensions;
- clipping and file size.

Injected fake measures can all remain green while the actual feature is broken. The runtime guard does not mitigate layout, rendering, PNG, or browser-specific defects—and its font detection is itself defective.

Concrete fix: make Task 7 mandatory and durable. Since Playwright is already installed, retain a browser smoke test that checks:

- Noto face loaded;
- returned MIME is `image/png`;
- dimensions are 2500×1686 and 2500×843;
- representative Thai output contains non-background pixels;
- long-label output stays within each area;
- generated size is ≤1 MB.

The claim that text-layout logic is unit-testable is fair; “100% testable” for the feature is not.

---

### 5. SEVERITY: HIGH — The confirmation requirement is scoped to a page that never publishes

Document/section: [PRD — Core Capabilities and Phase 4](/D:/genAI/jsk-app/.claude/PRPs/prds/rich-menu-image-generator.prd.md:152)

> “หน้ายืนยันก่อน publish … frontend ล้วน”

Phase 4 points to:

> `new/page.tsx:330-331`

Those lines only upload the image. The new page optionally calls `/sync`; it never calls `/publish`. The actual publish handler is on the rich-menu list page. An engineer following the document cannot implement the confirmation at the cited integration point.

Concrete fix: explicitly add `frontend/app/admin/rich-menus/page.tsx` to Phase 4 and intercept its publish handler. Specify whether confirmation applies to all menus or only generated images.

If this is meant as a real control rather than UX friction, frontend-only enforcement is bypassable through the API. For a government deployment, record publish actor/time and enforce any mandatory policy server-side.

---

### 6. SEVERITY: MEDIUM — The “never fetched” font correction is false in this repository

Documents/sections:

- [PRD — Technical Risks](/D:/genAI/jsk-app/.claude/PRPs/prds/rich-menu-image-generator.prd.md:214)
- [Plan — Task 2 Gotcha #2](/D:/genAI/jsk-app/.claude/PRPs/plans/rich-menu-image-generator-phase1.plan.md:334)

> “ไฟล์ไทยจะไม่ถูก request”  
> “ฟอนต์ไทยไม่เคยถูกโหลด”

The specification does confirm that omitted `text` defaults to one U+0020 space, so that particular `load()` call selects the Latin face rather than the Thai unicode-range. [CSS Font Loading Level 3](https://www.w3.org/TR/css-font-loading/)

But [layout.tsx](/D:/genAI/jsk-app/frontend/app/layout.tsx:6) sets `preload: true`. The generated `next-font-manifest.json` lists the Thai WOFF2 for the rich-menu route, and generated HTML contains a font preload for it. Therefore the Thai file may be fetched independently.

Concrete corrected wording:

> Omitting `text` means this `FontFaceSet.load()` call neither selects nor waits for the Thai face. Next.js preload may fetch it, but preload is not a readiness guarantee. Always pass Thai sample text.

---

### 7. SEVERITY: MEDIUM — The claimed exact CSS custom-property value is build-dependent

Document/section: [Phase-1 plan — “ข้อเท็จจริงที่ยืนยัน…”](/D:/genAI/jsk-app/.claude/PRPs/plans/rich-menu-image-generator-phase1.plan.md:51)

> `--font-noto-thai: 'Noto Sans Thai', 'Noto Sans Thai Fallback', system-ui, sans-serif`

The current dev artifact matches this. The current production artifact instead contains:

```css
--font-noto-thai: "Noto Sans Thai", system-ui, sans-serif
```

with no synthetic `Noto Sans Thai Fallback`. Source [layout.tsx](/D:/genAI/jsk-app/frontend/app/layout.tsx:6) requests `system-ui` and `sans-serif`; it does not guarantee Next’s internal synthetic fallback name.

Also, the family list alone is not a complete `ctx.font` value. It is valid as the family component of:

```ts
ctx.font = `700 100px ${family}`;
```

The planned implementation does this correctly, but the prose “assign เข้า `ctx.font` ได้ตรง ๆ” is misleading.

Concrete fix:

- Treat the runtime CSS custom property as opaque.
- Do not unit-test one exact generated stack.
- Use `'Noto Sans Thai', system-ui, sans-serif` only when the property is absent.
- Test syntactic acceptance of both current dev and production values.

---

### 8. SEVERITY: MEDIUM — The seven test invariants contradict intentional truncation

Document/section: [Phase-1 plan — Task 5](/D:/genAI/jsk-app/.claude/PRPs/plans/rich-menu-image-generator-phase1.plan.md:618)

> “join(lines) … = input”  
> “เซตของ grapheme ใน output = เซตใน input”  
> “เมื่อ `didTruncate === true`…”

Final fitted output that truncates necessarily removes input graphemes and adds `…`. Invariants 1 and 4 therefore cannot hold together with invariants 6–7.

A set comparison also cannot detect order or duplication: `กกข` and `กข` have the same set.

“Terminates in `< N` rounds” is unspecified and cannot be observed without a counter seam.

Concrete fix:

- Test `wrapText` separately for exact ordered grapheme preservation.
- For `fitTextToBox`, assert output is an ordered prefix of input plus optional `…`.
- Define the iteration bound:

```ts
Math.ceil(Math.max(0, startFontSizePx - MIN_FONT_SIZE_PX) / FONT_STEP_PX) + 1
```

- Instrument measure/wrap calls or expose an iteration counter in tests.

---

### 9. SEVERITY: MEDIUM — `toBreakableUnits` is not specified enough to implement deterministically

Document/section: [Phase-1 plan — Task 3, `toBreakableUnits`](/D:/genAI/jsk-app/.claude/PRPs/plans/rich-menu-image-generator-phase1.plan.md:402)

> “ถ้าหน่วยก่อนหน้าจบด้วยสระหน้า หรือหน่วยนี้ห้ามขึ้นต้นบรรทัด → ผนวกเข้ากับหน่วยก่อนหน้า”

The leading-vowel premise is correct: local Node segmentation gives `"เก" → ["เ","ก"]`, consistent with Unicode grapheme segmentation. [UAX #29](https://unicode.org/reports/tr29/)

But the rule cannot prevent a prohibited character from starting a line when it is the first unit—for example labels beginning with `ๆ`, `.`, a combining mark, or whitespace after `\n`. The plan also does not define whether re-splitting an overwide grouped unit reruns grouping, which can recreate the same overwide unit.

Concrete fix: provide full pseudocode and define malformed-leading behavior explicitly—reject, strip, or allow with a validation error. Trim each explicit-newline paragraph and specify that overwide word units are converted once into safe visual clusters before greedy wrapping.

---

### 10. SEVERITY: MEDIUM — Empty and degenerate inputs have no defined result

Document/section: [Phase-1 plan — Tasks 3 and 5](/D:/genAI/jsk-app/.claude/PRPs/plans/rich-menu-image-generator-phase1.plan.md:343)

The fixtures explicitly include `empty` and `spacesOnly`, but the plan does not say whether `wrapText('')` returns `[]` or `['']`.

If it returns `[]`:

```ts
(lines.length - 1) * lineHeight
```

starts with `-lineHeight`, and the truncation branch writes `lines[-1]`.

Concrete fix:

```ts
if (text.length === 0) {
  return { fontSizePx, lines: [], didTruncate: false };
}
```

Validate finite positive box dimensions and nonnegative available width/height before wrapping.

---

### 11. SEVERITY: MEDIUM — The font-metric fallback mishandles `NaN`

Document/section: [Phase-1 plan — Task 4](/D:/genAI/jsk-app/.claude/PRPs/plans/rich-menu-image-generator-phase1.plan.md:513)

> `const ascent = m.fontBoundingBoxAscent ?? size * 1.061`

`??` handles only `null` and `undefined`, not `NaN`. If a browser exposes the property but returns a non-finite value, `ascent`, `blockH`, and baseline coordinates become `NaN`.

Concrete fix:

```ts
const rawAscent = m.fontBoundingBoxAscent;
const ascent =
  Number.isFinite(rawAscent) && rawAscent >= 0
    ? rawAscent
    : size * 1.061;
```

Apply the same check to descent.

The block-height and baseline formulas themselves are geometrically correct. `fontBoundingBox*` is coherent for uniform cross-cell placement; `actualBoundingBox*` measures the particular string’s ink. [HTML Canvas specification](https://html.spec.whatwg.org/multipage/canvas.html)

---

### 12. SEVERITY: MEDIUM — Two supposedly decided layout constants remain undecided

Document/section: [Phase-1 plan — Notes](/D:/genAI/jsk-app/.claude/PRPs/plans/rich-menu-image-generator-phase1.plan.md:773)

> “ยังไม่ตัดสินใจ … ค่าที่แน่นอนของ `AREA_PADDING_RATIO` และ `initialFontSize`”

But Task 3 already fixes:

> `AREA_PADDING_RATIO = 0.12`

and never specifies the `initialFontSize()` formula. An engineer cannot implement the plan in one pass without choosing behavior.

Concrete fix: either mark 0.12 provisional or declare it decided, and specify `initialFontSize`, for example:

```ts
export function initialFontSize(box: RichMenuBounds): number {
  const innerMin = Math.min(box.width, box.height) *
    (1 - 2 * AREA_PADDING_RATIO);

  return Math.max(
    MIN_FONT_SIZE_PX,
    Math.floor(innerMin * 0.28),
  );
}
```

The exact coefficient needs browser-harness validation, but it must be fixed in the plan before implementation.

---

### 13. SEVERITY: MEDIUM — The 96px arithmetic is right; the usability conclusion is unproven

Documents/sections:

- [PRD — Technical Risks](/D:/genAI/jsk-app/.claude/PRPs/prds/rich-menu-image-generator.prd.md:219)
- [Plan — Task 3](/D:/genAI/jsk-app/.claude/PRPs/plans/rich-menu-image-generator-phase1.plan.md:474)

> “96px … ≈ 15 CSS px”  
> “MAX_LINES = 2”

The arithmetic is correct:

```text
96 × 390 / 2500 = 14.98
28 × 390 / 2500 = 4.37
```

For an 833×843 cell:

```text
pad = round(0.12 × 833) = 100
available = 633×643
two-line block ≈ 295px
```

But this arithmetic does not validate readability across supported phone widths or LINE’s actual displayed width. At 320 CSS px, 96 image pixels become about 12.3 CSS px.

`MAX_LINES = 2` is not imposed by height. At 96px, three lines occupy roughly 445px and four about 595px—both fit within 643px using the plan’s metrics. Two lines may be a legitimate content-policy decision, but it is not a geometric necessity.

Concrete fix: describe these as provisional product constraints and validate them on the smallest supported LINE viewport with Thai users. Do not state that they guarantee “ทุกป้ายอ่านออก”; truncation means some content is deliberately absent.

---

### 14. SEVERITY: MEDIUM — PRD summaries retain stale pre-REV3 scope

Document/section: [PRD — Phase 1 Goal](/D:/genAI/jsk-app/.claude/PRPs/prds/rich-menu-image-generator.prd.md:245)

> “pure function ที่รับ `{ areas, labels, colors }` แล้วคืน `Blob`”

This contradicts both REV 2 correction #7 and the plan:

- `label` now belongs inside each area;
- only text-layout helpers are pure;
- Canvas rendering and `Blob` creation are browser-stateful.

Additional stale summaries:

- Phase table says Phase 2 includes a color picker, while Phase Details says logic-only.
- Phase 4’s table omits confirmation.
- MVP Scope omits the declared Musts for contrast blocking, truncation warning, and confirmation.

Concrete wording:

> Phase 1 provides pure text-layout helpers plus `renderRichMenuImage(options: { width, height, areas: { bounds, label }[], colors }): Promise<Blob>`.

Then synchronize the phase table and MVP list with the detailed phase descriptions.

---

### 15. SEVERITY: MEDIUM — The product validation and guardrail metrics are not operational

Document/section: [PRD — Success Metrics](/D:/genAI/jsk-app/.claude/PRPs/prds/rich-menu-image-generator.prd.md:89)

The usability test is falsifiable in principle, but:

- the hypothesis says “สร้างและแก้” while the test covers creation only;
- “ไม่มีทักษะกราฟิก” is undefined;
- “หน้าตาไม่ผ่าน” has no rubric;
- no fixed task/menu content is specified.

The tap-rate guardrail does not define:

- numerator and denominator;
- comparator menu;
- how the 14-day window starts when `RichMenu` has no `published_at`;
- how suppressed/insufficient LINE insight data is treated.

Concrete fix: preregister participant criteria, one fixed menu task, and objective pass conditions. Define tap rate and mark insufficient insight data as inconclusive, or add publish telemetry.

The plan also admits the feature should stop if usage is below one menu/month, yet allows implementation before checking that gate. Either close the product evidence first or explicitly call Phase 1 a disposable, budgeted technical spike that is not merged until the gate passes.

---

### 16. SEVERITY: LOW — Citation quality is mostly good, with two important exceptions

All aggressively spot-checked repository-local citations point to the claimed code, including:

- upload endpoint and absent dimension validation;
- 11 templates and bounds;
- upload FormData;
- Canvas/toBlob pattern;
- image-size warning;
- size resolver;
- Vitest configuration;
- logger and test patterns.

Exceptions:

1. `new/page.tsx:330-331` is accurate for upload but is wrongly used as the implementation location for confirmation-before-publish.
2. Bare external citations such as `src/tools/createRichMenu.ts:257-338` are not repository-verifiable and are not pinned to a commit.

Concrete fix: replace external bare paths with commit-pinned GitHub links.

## REV 3/REV 2 corrections confirmed correct

- PRD REV2 #2: draft-to-upload time and repeat-image metrics cannot be reconstructed from the current model.
- PRD REV2 #4: image-resize has five general presets and is not direct evidence of rich-menu user pain.
- PRD REV2 #5: `/upload` does not validate image dimensions.
- PRD REV2 #6: the correct template path includes `.items[]`.
- PRD REV2 #8: `image-utils.ts` has no post-`toBlob` size enforcement.
- PRD REV2 #9: credential support is multi-provider, not evidence of multitenancy.
- PRD REV2 #12 / REV3 #1 arithmetic: 28px projects to about 4.4px and 96px to about 15px at a 390/2500 scale.
- Plan REV2 #1 core correction: Next’s visible family is not a hashed family name, and stripping only the outer quotes corrupts the stack.
- Plan REV2 #4–5: 1.35 is below the stated 1.511-em font box; font-level metrics are preferable for uniform grid alignment.
- Plan REV2 #6: default grapheme segmentation separates Thai leading vowels; regrouping is necessary.
- Plan REV2 #7: an `Intl.Segmenter` fallback cannot itself depend on `Intl.Segmenter`.
- Plan REV2 #8: placing an overwide unit unchanged does not solve overflow.
- Plan REV2 #9 core correction: ellipsis must be included in the measured width.
- Plan REV2 #10: placing `label` inside the area removes the parallel-array mismatch.
- Plan REV2 #11: curried `MeasureTextFn` consistently binds font size.
- Plan REV2 #12: `Math.max(MIN, size - step)` correctly prevents stepping below the minimum.
- Plan REV2 #13: `(n-1)×lineHeight + ascent + descent` is the correct block-height formula.
- Plan REV2 #15: `import type` is erased and does not pull React into runtime output.
- Plan REV2 #16: underscore-prefixed App Router folders are private, and the admin layout already supplies the auth gate.
- Plan REV2 #17: the corrected local citation ranges are accurate.
- Plan REV2 #18: native Cairo/Pango/node-gyp portability is the relevant concern for adding `canvas`.
- Plan REV2 #19: the file count is seven when the temporary harness is included.
- The jsdom claim is correct: this project’s `getContext('2d')` returns `null` without `canvas`.

Not confirmed:

- REV3’s statement that the office has no mandatory approval policy cannot be established from repository evidence.
- The exact generated font stack and “Thai file is never fetched” claims are false/overstated as described above.

## Verdict

**NEEDS REWORK**

Confidence that an engineer could implement Phase 1 correctly in one pass without questions: **4/10**.

The architecture is salvageable, but the font proof, truncation path, vertical-fit recovery, browser verification, empty-input behavior, and `initialFontSize` contract must be corrected before implementation.