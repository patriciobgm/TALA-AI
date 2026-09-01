import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import {
  Add,
  DownloadOutlined,
  LockOutlined,
  RefreshOutlined,
} from "@mui/icons-material";
import { api } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { StatusChip } from "../components/StatusChip";
import { downloadText } from "../utils/download";
import { useUrlView } from "../utils/useUrlView";

type Evidence = {
  generated_at: string;
  algorithm_version: string;
  record_counts: Record<string, number>;
  metrics: {
    diagnostic_to_mastery: {
      paired_learners: number;
      average_improvement: number | null;
      improved_count: number;
      by_competency: {
        competency_id: number;
        competency_code: string;
        competency: string;
        subject: string;
        paired_learners: number;
        diagnostic_average: number;
        mastery_average: number;
        average_improvement: number;
      }[];
    };
    recovery_adherence: {
      plans: number;
      assigned_activities: number;
      completed_activities: number;
      completion_rate: number | null;
      overdue_activities: number;
      completed_plan_average_hours: number | null;
    };
    recommendations: {
      algorithm_version: string;
      reviewed: number;
      accepted: number;
      dismissed: number;
      acceptance_rate: number | null;
      override_rate: number | null;
      outcomes: Record<
        string,
        {
          assigned: number;
          completed: number;
          completion_rate: number | null;
          average_practice_score: number | null;
        }
      >;
    };
    tala_quality: {
      assistant_messages: number;
      system_grounding_rate: number | null;
      human_evaluated: number;
      grounding_accuracy: number | null;
      hallucination_rate: number | null;
      incorrect_answer_leakage_rate: number | null;
    };
    usability: {
      role: string;
      sessions: number;
      task_completion_rate: number | null;
      average_duration_seconds: number | null;
      average_errors: number | null;
      average_sus_score: number | null;
    }[];
    consent_and_eligibility: {
      total_requests: number;
      statuses: Record<string, number>;
      approval_rate: number | null;
      awaiting_response: number;
    };
  };
};
type Snapshot = {
  id: number;
  name: string;
  dataset_version: string;
  algorithm_version: string;
  checksum_sha256: string;
  frozen_by: string;
  frozen_at: string;
  record_counts: Record<string, number>;
  metrics: Evidence["metrics"];
  notes: string;
};
type Usability = {
  id: number;
  participant_code: string;
  participant_role: string;
  task_name: string;
  outcome: string;
  duration_seconds: number | null;
  error_count: number;
  sus_score: string | null;
  recorded_at: string;
};
type TalaReviewCandidate = {
  id: number;
  student: string;
  competency: string;
  content: string;
  source_citations: { label?: string; title?: string }[];
  grounding_status: string;
  provider: string;
  model: string;
  created_at: string;
};
const percent = (value: number | null) =>
  value === null ? "Not enough data" : `${value.toFixed(1)}%`;
const evaluationSections = ["evidence", "snapshots", "usability", "tala"] as const;

export function ResearchEvidencePage() {
  const [section, setSection] = useUrlView(evaluationSections, "evidence");
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [usability, setUsability] = useState<Usability[]>([]);
  const [talaQueue, setTalaQueue] = useState<TalaReviewCandidate[]>([]);
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [usabilityOpen, setUsabilityOpen] = useState(false);
  const [reviewing, setReviewing] = useState<TalaReviewCandidate | null>(null);
  const [freezeForm, setFreezeForm] = useState({
    name: "",
    dataset_version: "",
    notes: "",
  });
  const [usabilityForm, setUsabilityForm] = useState({
    participant_code: "",
    participant_role: "student",
    task_name: "",
    outcome: "completed",
    duration_seconds: "",
    error_count: "0",
    sus_score: "",
    notes: "",
  });
  const [reviewForm, setReviewForm] = useState({
    grounding_accurate: true,
    hallucination_detected: false,
    incorrect_answer_leakage: false,
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(
    () =>
      Promise.all([
        api<Evidence>("/research/evidence/"),
        api<Snapshot[]>("/research/snapshots/"),
        api<Usability[]>("/research/usability-evaluations/"),
        api<TalaReviewCandidate[]>(
          "/research/ai-evaluations/?queue=unreviewed",
        ),
      ])
        .then(([current, frozen, sessions, candidates]) => {
          setEvidence(current);
          setSnapshots(frozen);
          setUsability(sessions);
          setTalaQueue(candidates);
        })
        .catch((reason) => setError(reason.message)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const freeze = async () => {
    setBusy(true);
    setError("");
    try {
      await api("/research/snapshots/", {
        method: "POST",
        body: JSON.stringify(freezeForm),
      });
      setFreezeOpen(false);
      setMessage(
        "Evidence package frozen. Its checksum will identify this exact evaluation dataset.",
      );
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to freeze this evidence package.",
      );
    } finally {
      setBusy(false);
    }
  };
  const addUsability = async () => {
    setBusy(true);
    setError("");
    try {
      await api("/research/usability-evaluations/", {
        method: "POST",
        body: JSON.stringify({
          ...usabilityForm,
          duration_seconds: usabilityForm.duration_seconds || null,
          error_count: Number(usabilityForm.error_count),
          sus_score: usabilityForm.sus_score || null,
        }),
      });
      setUsabilityOpen(false);
      setMessage("Usability observation recorded.");
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to record this usability observation.",
      );
    } finally {
      setBusy(false);
    }
  };
  const saveReview = async () => {
    if (!reviewing) return;
    setBusy(true);
    setError("");
    try {
      await api("/research/ai-evaluations/", {
        method: "POST",
        body: JSON.stringify({ message: reviewing.id, ...reviewForm }),
      });
      setReviewing(null);
      setMessage("TALA quality review recorded.");
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to save this quality review.",
      );
    } finally {
      setBusy(false);
    }
  };
  const exportCurrent = () =>
    evidence &&
    downloadText(
      `tala-evidence-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(evidence, null, 2),
      "application/json",
    );
  const action =
    section === "evidence" ? (
      <Stack direction="row" gap={1}>
        <Button
          variant="outlined"
          startIcon={<RefreshOutlined />}
          onClick={() => void load()}
        >
          Refresh
        </Button>
        <Button
          variant="outlined"
          startIcon={<DownloadOutlined />}
          onClick={exportCurrent}
          disabled={!evidence}
        >
          Export JSON
        </Button>
        <Button
          variant="contained"
          startIcon={<LockOutlined />}
          onClick={() => setFreezeOpen(true)}
        >
          Freeze Snapshot
        </Button>
      </Stack>
    ) : section === "usability" ? (
      <Button
        variant="contained"
        startIcon={<Add />}
        onClick={() => setUsabilityOpen(true)}
      >
        Record Observation
      </Button>
    ) : undefined;
  return (
    <>
      <PageHeader
        title="Program Evaluation"
        description="Monitor learning outcomes, AI quality, usability, and consent records for ongoing improvement and formal evaluation."
        action={action}
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}
      {message && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage("")}>
          {message}
        </Alert>
      )}
      <Card sx={{ mb: 3 }}>
        <Tabs
          value={section}
          onChange={(_, value) => setSection(value)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab value="evidence" label="Current Evidence" />
          <Tab value="snapshots" label="Frozen Snapshots" />
          <Tab value="usability" label="Usability Study" />
          <Tab
            value="tala"
            label={`TALA Quality Review (${talaQueue.length})`}
          />
        </Tabs>
      </Card>
      {section === "evidence" && evidence && (
        <Stack gap={3}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "1fr 1fr",
                xl: "repeat(4, 1fr)",
              },
              gap: 2,
            }}
          >
            {[
              [
                "Score Improvement",
                evidence.metrics.diagnostic_to_mastery.average_improvement ===
                null
                  ? "No paired results"
                  : `+${evidence.metrics.diagnostic_to_mastery.average_improvement.toFixed(1)} points`,
                `${evidence.metrics.diagnostic_to_mastery.paired_learners} paired learner-competency records`,
              ],
              [
                "Recovery Adherence",
                percent(evidence.metrics.recovery_adherence.completion_rate),
                `${evidence.metrics.recovery_adherence.overdue_activities} overdue activities`,
              ],
              [
                "Recommendation Acceptance",
                percent(evidence.metrics.recommendations.acceptance_rate),
                `${evidence.metrics.recommendations.reviewed} teacher decisions`,
              ],
              [
                "Consent Approval",
                percent(evidence.metrics.consent_and_eligibility.approval_rate),
                `${evidence.metrics.consent_and_eligibility.awaiting_response} awaiting response`,
              ],
            ].map(([label, value, detail]) => (
              <Card key={label} variant="outlined" sx={{ p: 2.5 }}>
                <Typography variant="caption" color="text.secondary">
                  {label}
                </Typography>
                <Typography sx={{ fontSize: 24, fontWeight: 750, mt: 0.5 }}>
                  {value}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {detail}
                </Typography>
              </Card>
            ))}
          </Box>
          <Card>
            <Box sx={{ p: 2.5 }}>
              <Typography variant="h2">
                Diagnostic-to-Mastery Outcomes
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.5 }}
              >
                Only paired diagnostic and mastery evidence for the same learner
                and competency is included.
              </Typography>
            </Box>
            <Divider />
            <Stack divider={<Divider />}>
              {evidence.metrics.diagnostic_to_mastery.by_competency.map(
                (row) => (
                  <Box
                    key={row.competency_id}
                    sx={{
                      px: 2.5,
                      py: 1.75,
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "1fr 1fr",
                        md: "minmax(240px, 1fr) repeat(4, 120px)",
                      },
                      gap: 2,
                      alignItems: "center",
                    }}
                  >
                    <Box>
                      <Typography variant="body2" fontWeight={700}>
                        {row.competency}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {row.subject} · {row.competency_code}
                      </Typography>
                    </Box>
                    <Metric label="Paired" value={row.paired_learners} />
                    <Metric
                      label="Diagnostic"
                      value={`${row.diagnostic_average}%`}
                    />
                    <Metric label="Mastery" value={`${row.mastery_average}%`} />
                    <Metric
                      label="Change"
                      value={`${row.average_improvement >= 0 ? "+" : ""}${row.average_improvement}`}
                    />
                  </Box>
                ),
              )}
            </Stack>
            {!evidence.metrics.diagnostic_to_mastery.by_competency.length && (
              <Empty text="Paired diagnostic and mastery results will appear after learners complete both stages." />
            )}
          </Card>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
              gap: 3,
            }}
          >
            <Card>
              <Section
                title="Recommendation Outcome Loop"
                description={`Frozen algorithm: ${evidence.algorithm_version}`}
              />
              {Object.entries(evidence.metrics.recommendations.outcomes).map(
                ([key, row]) => (
                  <Box
                    key={key}
                    sx={{
                      px: 2.5,
                      py: 1.75,
                      borderTop: "1px solid",
                      borderColor: "divider",
                    }}
                  >
                    <Typography
                      variant="body2"
                      fontWeight={700}
                      sx={{ textTransform: "capitalize" }}
                    >
                      {key} resources
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {row.completed} of {row.assigned} completed ·{" "}
                      {percent(row.completion_rate)} · Average practice score{" "}
                      {row.average_practice_score ?? "—"}%
                    </Typography>
                  </Box>
                ),
              )}
            </Card>
            <Card>
              <Section
                title="TALA Quality Evaluation"
                description="Automated grounding metadata and independent human review must be reported separately."
              />
              <Stack divider={<Divider />}>
                {[
                  [
                    "System grounding rate",
                    percent(
                      evidence.metrics.tala_quality.system_grounding_rate,
                    ),
                  ],
                  [
                    "Human grounding accuracy",
                    percent(evidence.metrics.tala_quality.grounding_accuracy),
                  ],
                  [
                    "Hallucination rate",
                    percent(evidence.metrics.tala_quality.hallucination_rate),
                  ],
                  [
                    "Incorrect-answer leakage",
                    percent(
                      evidence.metrics.tala_quality
                        .incorrect_answer_leakage_rate,
                    ),
                  ],
                ].map(([label, value]) => (
                  <Box
                    key={label}
                    sx={{
                      px: 2.5,
                      py: 1.5,
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <Typography variant="body2">{label}</Typography>
                    <Typography variant="body2" fontWeight={700}>
                      {value}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Card>
          </Box>
        </Stack>
      )}
      {section === "snapshots" && (
        <Card>
          <Section
            title="Frozen Evaluation Datasets"
            description="A checksum proves that metrics and record counts were not silently changed after freezing."
          />
          <Stack divider={<Divider />}>
            {snapshots.map((row) => (
              <Box
                key={row.id}
                sx={{
                  px: 2.5,
                  py: 2,
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    md: "minmax(240px, 1fr) 150px 190px",
                  },
                  gap: 2,
                }}
              >
                <Box>
                  <Typography variant="body2" fontWeight={700}>
                    {row.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Dataset {row.dataset_version} · {row.algorithm_version}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      display: "block",
                      mt: 0.5,
                      fontFamily: "monospace",
                      overflowWrap: "anywhere",
                    }}
                  >
                    SHA-256 {row.checksum_sha256}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Frozen By
                  </Typography>
                  <Typography variant="body2">{row.frozen_by}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Frozen At
                  </Typography>
                  <Typography variant="body2">
                    {new Date(row.frozen_at).toLocaleString()}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Stack>
          {!snapshots.length && (
            <Empty text="No evidence package has been frozen yet." />
          )}
        </Card>
      )}
      {section === "usability" && (
        <Card>
          <Section
            title="Task Observations"
            description="Use anonymous participant codes. Do not place student names in study records."
          />
          <Stack divider={<Divider />}>
            {usability.map((row) => (
              <Box
                key={row.id}
                sx={{
                  px: 2.5,
                  py: 1.75,
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr 1fr",
                    md: "120px minmax(220px, 1fr) 120px 120px 100px",
                  },
                  gap: 2,
                  alignItems: "center",
                }}
              >
                <Typography variant="body2" fontWeight={700}>
                  {row.participant_code}
                </Typography>
                <Box>
                  <Typography variant="body2">{row.task_name}</Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ textTransform: "capitalize" }}
                  >
                    {row.participant_role}
                  </Typography>
                </Box>
                <StatusChip label={row.outcome} />
                <Metric
                  label="Duration"
                  value={
                    row.duration_seconds === null
                      ? "—"
                      : `${row.duration_seconds}s`
                  }
                />
                <Metric label="SUS" value={row.sus_score ?? "—"} />
              </Box>
            ))}
          </Stack>
          {!usability.length && (
            <Empty text="No usability observations have been recorded." />
          )}
        </Card>
      )}
      {section === "tala" && (
        <Card>
          <Section
            title="Blinded TALA Response Review"
            description="Review a documented sample against its cited approved sources. Automated grounding status is context, not proof of accuracy."
          />
          <Stack divider={<Divider />}>
            {talaQueue.map((row) => (
              <Box
                key={row.id}
                sx={{
                  px: 2.5,
                  py: 2,
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) auto" },
                  gap: 2,
                  alignItems: "start",
                }}
              >
                <Box>
                  <Typography variant="body2" fontWeight={700}>
                    {row.competency}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Learner: {row.student} ·{" "}
                    {new Date(row.created_at).toLocaleString()} ·{" "}
                    {row.grounding_status}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ mt: 1, whiteSpace: "pre-line" }}
                  >
                    {row.content}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mt: 1 }}
                  >
                    {row.source_citations.length} cited source
                    {row.source_citations.length === 1 ? "" : "s"}
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  onClick={() => {
                    setReviewForm({
                      grounding_accurate: true,
                      hallucination_detected: false,
                      incorrect_answer_leakage: false,
                      notes: "",
                    });
                    setReviewing(row);
                  }}
                >
                  Review Response
                </Button>
              </Box>
            ))}
          </Stack>
          {!talaQueue.length && (
            <Empty text="Every available TALA response has been reviewed." />
          )}
        </Card>
      )}
      <Dialog
        component="form"
        open={freezeOpen}
        onClose={() => setFreezeOpen(false)}
        onSubmit={(event) => {
          event.preventDefault();
          void freeze();
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Freeze Evidence Snapshot</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ pt: 1 }}>
            <Alert severity="info">
              Freezing captures the current calculated metrics, record counts,
              algorithm version, and checksum. Frozen snapshots cannot be
              edited.
            </Alert>
            <TextField
              label="Snapshot Name"
              value={freezeForm.name}
              onChange={(event) =>
                setFreezeForm((value) => ({
                  ...value,
                  name: event.target.value,
                }))
              }
              placeholder="Pilot evaluation baseline"
              required
            />
            <TextField
              label="Dataset Version"
              value={freezeForm.dataset_version}
              onChange={(event) =>
                setFreezeForm((value) => ({
                  ...value,
                  dataset_version: event.target.value,
                }))
              }
              placeholder="pilot-2026-v1"
              required
              helperText="Use a documented version that also identifies your exported evaluation records."
            />
            <TextField
              label="Notes"
              value={freezeForm.notes}
              onChange={(event) =>
                setFreezeForm((value) => ({
                  ...value,
                  notes: event.target.value,
                }))
              }
              multiline
              minRows={3}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFreezeOpen(false)}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={busy}>
            {busy ? "Freezing…" : "Freeze Snapshot"}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        component="form"
        open={usabilityOpen}
        onClose={() => setUsabilityOpen(false)}
        onSubmit={(event) => {
          event.preventDefault();
          void addUsability();
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Record Usability Observation</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ pt: 1 }}>
            <TextField
              label="Anonymous Participant Code"
              value={usabilityForm.participant_code}
              onChange={(event) =>
                setUsabilityForm((value) => ({
                  ...value,
                  participant_code: event.target.value,
                }))
              }
              required
            />
            <TextField
              select
              label="Participant Role"
              value={usabilityForm.participant_role}
              onChange={(event) =>
                setUsabilityForm((value) => ({
                  ...value,
                  participant_role: event.target.value,
                }))
              }
            >
              <MenuItem value="student">Student</MenuItem>
              <MenuItem value="teacher">Teacher</MenuItem>
            </TextField>
            <TextField
              label="Observed Task"
              value={usabilityForm.task_name}
              onChange={(event) =>
                setUsabilityForm((value) => ({
                  ...value,
                  task_name: event.target.value,
                }))
              }
              required
            />
            <TextField
              select
              label="Outcome"
              value={usabilityForm.outcome}
              onChange={(event) =>
                setUsabilityForm((value) => ({
                  ...value,
                  outcome: event.target.value,
                }))
              }
            >
              <MenuItem value="completed">Completed</MenuItem>
              <MenuItem value="partial">Partially Completed</MenuItem>
              <MenuItem value="failed">Failed</MenuItem>
            </TextField>
            <Box
              sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}
            >
              <TextField
                label="Duration (seconds)"
                type="number"
                value={usabilityForm.duration_seconds}
                onChange={(event) =>
                  setUsabilityForm((value) => ({
                    ...value,
                    duration_seconds: event.target.value,
                  }))
                }
              />
              <TextField
                label="Observed Errors"
                type="number"
                value={usabilityForm.error_count}
                onChange={(event) =>
                  setUsabilityForm((value) => ({
                    ...value,
                    error_count: event.target.value,
                  }))
                }
              />
            </Box>
            <TextField
              label="SUS Score (optional)"
              type="number"
              value={usabilityForm.sus_score}
              onChange={(event) =>
                setUsabilityForm((value) => ({
                  ...value,
                  sus_score: event.target.value,
                }))
              }
              inputProps={{ min: 0, max: 100 }}
            />
            <TextField
              label="Observation Notes"
              value={usabilityForm.notes}
              onChange={(event) =>
                setUsabilityForm((value) => ({
                  ...value,
                  notes: event.target.value,
                }))
              }
              multiline
              minRows={3}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUsabilityOpen(false)}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={busy}>
            Save Observation
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        component="form"
        open={Boolean(reviewing)}
        onClose={() => setReviewing(null)}
        onSubmit={(event) => {
          event.preventDefault();
          void saveReview();
        }}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Review TALA Response</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ pt: 1 }}>
            <Alert severity="info">
              Compare the response with the cited approved material. Use a
              pre-agreed rubric and independent reviewers for formal evaluation.
            </Alert>
            <Box
              sx={{
                p: 2,
                bgcolor: "background.default",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
              }}
            >
              <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>
                {reviewing?.content}
              </Typography>
            </Box>
            <TextField
              select
              label="Grounding Accuracy"
              value={reviewForm.grounding_accurate ? "accurate" : "inaccurate"}
              onChange={(event) =>
                setReviewForm((value) => ({
                  ...value,
                  grounding_accurate: event.target.value === "accurate",
                }))
              }
            >
              <MenuItem value="accurate">Supported by Cited Sources</MenuItem>
              <MenuItem value="inaccurate">Not Fully Supported</MenuItem>
            </TextField>
            <TextField
              select
              label="Hallucination"
              value={reviewForm.hallucination_detected ? "detected" : "none"}
              onChange={(event) =>
                setReviewForm((value) => ({
                  ...value,
                  hallucination_detected: event.target.value === "detected",
                }))
              }
            >
              <MenuItem value="none">No Hallucination Detected</MenuItem>
              <MenuItem value="detected">Hallucination Detected</MenuItem>
            </TextField>
            <TextField
              select
              label="Incorrect-Answer Leakage"
              value={reviewForm.incorrect_answer_leakage ? "detected" : "none"}
              onChange={(event) =>
                setReviewForm((value) => ({
                  ...value,
                  incorrect_answer_leakage: event.target.value === "detected",
                }))
              }
            >
              <MenuItem value="none">No Leakage Detected</MenuItem>
              <MenuItem value="detected">Leakage Detected</MenuItem>
            </TextField>
            <TextField
              label="Reviewer Notes"
              value={reviewForm.notes}
              onChange={(event) =>
                setReviewForm((value) => ({
                  ...value,
                  notes: event.target.value,
                }))
              }
              multiline
              minRows={3}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewing(null)}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={busy}>
            Save Quality Review
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={700}>
        {value}
      </Typography>
    </Box>
  );
}
function Section({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Box sx={{ p: 2.5 }}>
      <Typography variant="h2">{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        {description}
      </Typography>
    </Box>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <Typography
      variant="body2"
      color="text.secondary"
      sx={{ p: 4, textAlign: "center" }}
    >
      {text}
    </Typography>
  );
}
