//! Pure functions mapping Session / ActivityLog / Reflection rows → chunk text
//! ready to embed. No DB or network I/O — input is rows, output is strings.

use chrono::{DateTime, Utc};

/// Subset of the Session table we need to render a per-session chunk.
/// Defined locally so the corpus module doesn't depend on the API types.
#[derive(Debug, Clone)]
pub struct SessionChunkInput {
    pub id: String,
    pub start_time: DateTime<Utc>,
    pub end_time: Option<DateTime<Utc>>,
    pub planned_duration: i32,
    pub actual_duration: Option<i32>,
    pub project_name: Option<String>,
    pub productivity_score: Option<i32>,
    pub top_apps: Vec<(String, i32)>,
}

/// Render one session into the chunk text used by the embedder + LLM.
/// Format anchored by `golden_session_chunk` test — change with care.
pub fn render_session_chunk(s: &SessionChunkInput) -> String {
    let date = s.start_time.format("%a %Y-%m-%d");
    let start = s.start_time.format("%H:%M");
    let end = s
        .end_time
        .map(|e| e.format("%H:%M").to_string())
        .unwrap_or_else(|| "??".to_string());

    let actual = s
        .actual_duration
        .map(|m| m.to_string())
        .unwrap_or_else(|| "?".into());

    let project = s
        .project_name
        .as_deref()
        .map(|n| format!(" Project: {n}."))
        .unwrap_or_default();

    let prod = s
        .productivity_score
        .map(|p| format!(" Productivity {p}/100."))
        .unwrap_or_default();

    let apps = if s.top_apps.is_empty() {
        String::new()
    } else {
        let parts: Vec<String> = s
            .top_apps
            .iter()
            .take(5)
            .map(|(n, m)| format!("{n} {m}m"))
            .collect();
        format!(" Top apps: {}.", parts.join(", "))
    };

    format!(
        "[Session] {date} {start}-{end} ({planned}min planned, {actual}min actual).{project}{prod}{apps}",
        planned = s.planned_duration,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn sample_input() -> SessionChunkInput {
        SessionChunkInput {
            id: "sid-1".into(),
            start_time: Utc.with_ymd_and_hms(2026, 5, 12, 9, 30, 0).unwrap(),
            end_time: Some(Utc.with_ymd_and_hms(2026, 5, 12, 10, 57, 0).unwrap()),
            planned_duration: 90,
            actual_duration: Some(87),
            project_name: Some("AuthRefactor".into()),
            productivity_score: Some(80),
            top_apps: vec![
                ("VSCode".into(), 65),
                ("Slack".into(), 12),
                ("Chrome".into(), 10),
            ],
        }
    }

    #[test]
    fn golden_session_chunk() {
        let chunk = render_session_chunk(&sample_input());
        let expected = "[Session] Tue 2026-05-12 09:30-10:57 (90min planned, 87min actual). \
                        Project: AuthRefactor. Productivity 80/100. \
                        Top apps: VSCode 65m, Slack 12m, Chrome 10m.";
        assert_eq!(chunk, expected);
    }

    #[test]
    fn chunk_omits_optional_fields_when_missing() {
        let mut s = sample_input();
        s.project_name = None;
        s.productivity_score = None;
        s.top_apps.clear();
        let chunk = render_session_chunk(&s);
        assert!(chunk.contains("[Session]"));
        assert!(!chunk.contains("Project:"));
        assert!(!chunk.contains("Productivity"));
        assert!(!chunk.contains("Top apps:"));
    }
}
