# Day-Chunk Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute `best_window` and `lowest_productivity_label` for the day rollup chunk from that day's session facts, instead of the hardcoded `None`s left by Phase 1.6b.

**Architecture:** Two small pure selection helpers (`pick_best`/`pick_lowest`) plus a part-of-day bucket and local-time formatters are added to `ai/indexer.rs`; `aggregate_day` wires them into the `DayChunkInput` it already builds. Selection is kept separate from timezone-dependent formatting so the selection logic is unit-testable independent of the test runner's timezone.

**Tech Stack:** Rust, chrono.

## Global Constraints

- Component: `desktop-app-v3/src-tauri`. Paths relative to repo root. Tests: `cargo test --lib <filter>` from `desktop-app-v3/src-tauri`.
- Only sessions with a `productivity` score (`SessionFacts.productivity: Option<i32>`) are considered for both fields.
- **best_window**: highest `productivity` (tie → larger `actual_min`), rendered as local-time `"HH:MM-HH:MM"` (`end_time` absent → `"HH:MM-??"`). `None` if no scored session.
- **lowest_productivity_label**: requires **≥2** scored sessions; lowest `productivity` (tie → smaller `actual_min`); local part-of-day of its start: `hour < 12 → "morning"`, `12 ≤ hour < 17 → "afternoon"`, `hour ≥ 17 → "evening"`. `None` if fewer than 2 scored.
- Timestamps are RFC 3339 (stored from `DateTime<Utc>`); convert to **local** before formatting. Unparseable → that field degrades to `None`, never panics.
- No `unwrap` in non-test production code.

## Reference — current code

`SessionFacts` (in `store/ai.rs`):
```rust
pub struct SessionFacts {
    pub session_id: String,
    pub date: String,
    pub start_time: String,      // RFC 3339
    pub end_time: Option<String>,// RFC 3339
    pub planned_min: i32,
    pub actual_min: Option<i32>,
    pub productivity: Option<i32>,
    pub top_apps: Vec<(String, i32)>,
    pub created_at: String,
}
```
`aggregate_day` in `ai/indexer.rs` currently ends with:
```rust
    Some(DayChunkInput {
        date,
        session_count,
        total_focus_minutes,
        best_window: None,
        top_apps,
        lowest_productivity_label: None,
    })
```
`indexer.rs` already imports `SessionFacts`, `DayChunkInput`, `HashMap`. chrono is referenced via full paths elsewhere in the file.

---

### Task 1: Selection + formatting helpers

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/ai/indexer.rs`

**Interfaces:**
- Produces:
  - `pub fn part_of_day(hour: u32) -> &'static str`
  - `pub fn pick_best(facts: &[SessionFacts]) -> Option<&SessionFacts>`
  - `pub fn pick_lowest(facts: &[SessionFacts]) -> Option<&SessionFacts>`
  - `pub fn format_window(f: &SessionFacts) -> Option<String>`
  - `pub fn local_part_of_day(f: &SessionFacts) -> Option<String>`

- [ ] **Step 1: Write the failing tests**

Add to the `#[cfg(test)] mod tests` in `indexer.rs`. (A `facts_row(id, date, actual, top)` helper already exists from 1.6b but fixes `productivity: Some(70)`; add the `scored_fact` builder below for controlling productivity/times.)

```rust
    fn scored_fact(
        id: &str,
        productivity: Option<i32>,
        actual: Option<i32>,
        start: &str,
        end: Option<&str>,
    ) -> SessionFacts {
        SessionFacts {
            session_id: id.into(),
            date: "2026-06-23".into(),
            start_time: start.into(),
            end_time: end.map(|s| s.into()),
            planned_min: 60,
            actual_min: actual,
            productivity,
            top_apps: vec![("Code".into(), actual.unwrap_or(0))],
            created_at: start.into(),
        }
    }

    #[test]
    fn part_of_day_buckets() {
        assert_eq!(part_of_day(0), "morning");
        assert_eq!(part_of_day(9), "morning");
        assert_eq!(part_of_day(11), "morning");
        assert_eq!(part_of_day(12), "afternoon");
        assert_eq!(part_of_day(16), "afternoon");
        assert_eq!(part_of_day(17), "evening");
        assert_eq!(part_of_day(21), "evening");
    }

    #[test]
    fn pick_best_takes_highest_productivity_then_longer_focus() {
        let facts = vec![
            scored_fact("a", Some(60), Some(40), "2026-06-23T09:00:00+00:00", Some("2026-06-23T09:40:00+00:00")),
            scored_fact("b", Some(90), Some(20), "2026-06-23T11:00:00+00:00", Some("2026-06-23T11:20:00+00:00")),
            scored_fact("c", Some(90), Some(55), "2026-06-23T13:00:00+00:00", Some("2026-06-23T13:55:00+00:00")),
            scored_fact("d", None, Some(99), "2026-06-23T15:00:00+00:00", None),
        ];
        // 'c' and 'b' tie at 90; 'c' wins on larger actual_min (55 > 20).
        assert_eq!(pick_best(&facts).unwrap().session_id, "c");
    }

    #[test]
    fn pick_best_none_when_no_scores() {
        let facts = vec![scored_fact("a", None, Some(40), "2026-06-23T09:00:00+00:00", None)];
        assert!(pick_best(&facts).is_none());
    }

    #[test]
    fn pick_lowest_takes_lowest_and_needs_two_scored() {
        let one = vec![scored_fact("a", Some(30), Some(40), "2026-06-23T09:00:00+00:00", None)];
        assert!(pick_lowest(&one).is_none(), "single scored session has no contrast");

        let many = vec![
            scored_fact("a", Some(80), Some(40), "2026-06-23T09:00:00+00:00", None),
            scored_fact("b", Some(30), Some(25), "2026-06-23T14:00:00+00:00", None),
            scored_fact("c", Some(30), Some(10), "2026-06-23T16:00:00+00:00", None),
            scored_fact("d", None, Some(99), "2026-06-23T18:00:00+00:00", None),
        ];
        // 'b' and 'c' tie at 30; 'c' wins (smaller actual_min 10 < 25).
        assert_eq!(pick_lowest(&many).unwrap().session_id, "c");
    }

    #[test]
    fn format_window_shape_and_missing_end() {
        let with_end = scored_fact("a", Some(80), Some(55), "2026-06-23T09:00:00+00:00", Some("2026-06-23T09:55:00+00:00"));
        let w = format_window(&with_end).unwrap();
        // Local time varies by runner TZ; assert the SHAPE "HH:MM-HH:MM".
        let bytes = w.as_bytes();
        assert_eq!(w.len(), 11, "expected HH:MM-HH:MM, got {w}");
        assert_eq!(bytes[2], b':');
        assert_eq!(bytes[5], b'-');
        assert_eq!(bytes[8], b':');

        let no_end = scored_fact("a", Some(80), Some(55), "2026-06-23T09:00:00+00:00", None);
        assert!(format_window(&no_end).unwrap().ends_with("-??"));

        let bad = scored_fact("a", Some(80), Some(55), "not-a-timestamp", None);
        assert!(format_window(&bad).is_none());
    }

    #[test]
    fn local_part_of_day_none_on_bad_timestamp() {
        let bad = scored_fact("a", Some(80), Some(55), "nonsense", None);
        assert!(local_part_of_day(&bad).is_none());
        // Good timestamp yields one of the three buckets (exact one is TZ-dependent).
        let good = scored_fact("a", Some(80), Some(55), "2026-06-23T09:00:00+00:00", None);
        let label = local_part_of_day(&good).unwrap();
        assert!(["morning", "afternoon", "evening"].contains(&label.as_str()), "got {label}");
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cargo test --lib ai::indexer 2>&1 | tail -20`
Expected: FAIL — `cannot find function part_of_day` / `pick_best` / etc.

- [ ] **Step 3: Implement the helpers**

Add to `indexer.rs` (above the `aggregate_day` function). chrono is used via full paths to match the file's style:

```rust
/// Part-of-day bucket for a local hour: <12 morning, 12-16 afternoon, >=17 evening.
pub fn part_of_day(hour: u32) -> &'static str {
    if hour < 12 {
        "morning"
    } else if hour < 17 {
        "afternoon"
    } else {
        "evening"
    }
}

/// The highest-productivity scored session (tie -> larger actual_min). None when
/// no session carries a productivity score.
pub fn pick_best(facts: &[SessionFacts]) -> Option<&SessionFacts> {
    facts
        .iter()
        .filter(|f| f.productivity.is_some())
        .max_by(|a, b| {
            a.productivity
                .cmp(&b.productivity)
                .then_with(|| a.actual_min.unwrap_or(0).cmp(&b.actual_min.unwrap_or(0)))
        })
}

/// The lowest-productivity scored session (tie -> smaller actual_min). Requires
/// at least two scored sessions, so a lone session is never both "best" and
/// "lowest".
pub fn pick_lowest(facts: &[SessionFacts]) -> Option<&SessionFacts> {
    let scored: Vec<&SessionFacts> = facts.iter().filter(|f| f.productivity.is_some()).collect();
    if scored.len() < 2 {
        return None;
    }
    scored.into_iter().min_by(|a, b| {
        a.productivity
            .cmp(&b.productivity)
            .then_with(|| a.actual_min.unwrap_or(0).cmp(&b.actual_min.unwrap_or(0)))
    })
}

/// Parse an RFC 3339 timestamp into local time. None if unparseable.
fn to_local(ts: &str) -> Option<chrono::DateTime<chrono::Local>> {
    chrono::DateTime::parse_from_rfc3339(ts)
        .ok()
        .map(|dt| dt.with_timezone(&chrono::Local))
}

/// Local clock span "HH:MM-HH:MM" (end absent -> "HH:MM-??"). None if the start
/// time can't be parsed.
pub fn format_window(f: &SessionFacts) -> Option<String> {
    let start = to_local(&f.start_time)?;
    let start_s = start.format("%H:%M").to_string();
    let end_s = f
        .end_time
        .as_deref()
        .and_then(to_local)
        .map(|e| e.format("%H:%M").to_string())
        .unwrap_or_else(|| "??".to_string());
    Some(format!("{start_s}-{end_s}"))
}

/// Local part-of-day bucket of the session's start. None if start unparseable.
pub fn local_part_of_day(f: &SessionFacts) -> Option<String> {
    use chrono::Timelike;
    let start = to_local(&f.start_time)?;
    Some(part_of_day(start.hour()).to_string())
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cargo test --lib ai::indexer 2>&1 | tail -20`
Expected: PASS — the 6 new tests plus existing indexer tests green.

- [ ] **Step 5: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/indexer.rs
git commit -m "feat(desktop-v3): day best_window/lowest selection + formatting helpers"
```

---

### Task 2: Wire into `aggregate_day`

**Files:**
- Modify: `desktop-app-v3/src-tauri/src/ai/indexer.rs`

**Interfaces:**
- Consumes: `pick_best`, `pick_lowest`, `format_window`, `local_part_of_day` (Task 1).

- [ ] **Step 1: Write the failing integration test**

Add to the `#[cfg(test)] mod tests` in `indexer.rs` (uses the `scored_fact` helper from Task 1):

```rust
    #[test]
    fn aggregate_day_fills_best_window_and_lowest_label() {
        let date = chrono::NaiveDate::from_ymd_opt(2026, 6, 23).unwrap();
        let facts = vec![
            scored_fact("a", Some(50), Some(40), "2026-06-23T09:00:00+00:00", Some("2026-06-23T09:40:00+00:00")),
            scored_fact("b", Some(90), Some(55), "2026-06-23T11:00:00+00:00", Some("2026-06-23T11:55:00+00:00")),
            scored_fact("c", Some(20), Some(25), "2026-06-23T14:00:00+00:00", Some("2026-06-23T14:25:00+00:00")),
        ];
        let day = aggregate_day(date, &facts).expect("non-empty");
        // best is 'b' (prod 90) -> a window string of shape HH:MM-HH:MM.
        let bw = day.best_window.expect("best_window set");
        assert_eq!(bw.len(), 11, "expected HH:MM-HH:MM, got {bw}");
        // lowest is 'c' (prod 20) -> a part-of-day bucket.
        let label = day.lowest_productivity_label.expect("lowest label set");
        assert!(["morning", "afternoon", "evening"].contains(&label.as_str()), "got {label}");
    }

    #[test]
    fn aggregate_day_lowest_none_with_one_scored_session() {
        let date = chrono::NaiveDate::from_ymd_opt(2026, 6, 23).unwrap();
        let facts = vec![
            scored_fact("a", Some(80), Some(40), "2026-06-23T09:00:00+00:00", Some("2026-06-23T09:40:00+00:00")),
            scored_fact("b", None, Some(30), "2026-06-23T11:00:00+00:00", None),
        ];
        let day = aggregate_day(date, &facts).expect("non-empty");
        assert!(day.best_window.is_some(), "one scored session still yields best_window");
        assert!(day.lowest_productivity_label.is_none(), "needs >=2 scored for a lowest label");
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cargo test --lib ai::indexer 2>&1 | tail -20`
Expected: FAIL — `best_window`/`lowest_productivity_label` are still `None`, so the `expect`/assertions fail.

- [ ] **Step 3: Wire the helpers into `aggregate_day`**

In `desktop-app-v3/src-tauri/src/ai/indexer.rs`, replace the `DayChunkInput` literal at the end of `aggregate_day`:

```rust
    Some(DayChunkInput {
        date,
        session_count,
        total_focus_minutes,
        best_window: None,
        top_apps,
        lowest_productivity_label: None,
    })
```

with:

```rust
    Some(DayChunkInput {
        date,
        session_count,
        total_focus_minutes,
        best_window: pick_best(facts).and_then(format_window),
        top_apps,
        lowest_productivity_label: pick_lowest(facts).and_then(local_part_of_day),
    })
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cargo test --lib ai::indexer 2>&1 | tail -20`
Expected: PASS — the 2 new integration tests plus all earlier indexer tests green.

- [ ] **Step 5: Verify the full suite + no new warnings**

Run: `cargo test --lib 2>&1 | tail -5` then `cargo build --lib 2>&1 | grep -iE "warning.*indexer" || echo "no indexer warnings"`
Expected: all lib tests pass; no new warnings from `indexer.rs`.

- [ ] **Step 6: Commit**

```bash
git add desktop-app-v3/src-tauri/src/ai/indexer.rs
git commit -m "feat(desktop-v3): fill day best_window + lowest_productivity_label"
```

---

## Manual Verification

`aggregate_day` is exercised by `run_day_rollup` (scheduler). To see the enriched text end-to-end: with Local AI `ready`, complete ≥2 focus sessions today with productivity scores, then trigger the day rollup (per the 1.6b manual-verification steps — nudge the rollup date to today in a dev build). The indexed `[Day]` chunk text should now include `Best window HH:MM-HH:MM.` and `Lowest productivity: <part-of-day>.`. Revert any dev-only change.

---

## Self-Review Notes

- **Spec coverage:** `best_window` definition + tie-break ✓ (Task 1 `pick_best` + `format_window`); `lowest_productivity_label` + ≥2 requirement + tie-break ✓ (`pick_lowest` + `local_part_of_day`); local-time conversion ✓ (`to_local`); part-of-day buckets ✓ (`part_of_day`); wiring ✓ (Task 2); graceful `None` on no-scores/unparseable ✓ (filters + `?`).
- **Type consistency:** `pick_best`/`pick_lowest(&[SessionFacts]) -> Option<&SessionFacts>`; `format_window`/`local_part_of_day(&SessionFacts) -> Option<String>`; `part_of_day(u32) -> &'static str` — used consistently in Task 2 wiring.
- **Out of scope (unchanged):** `render_session_chunk` UTC quirk, backfill, frontend/schema/scheduler.
