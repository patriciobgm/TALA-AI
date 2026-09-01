import { useCallback, useEffect, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  LinearProgress,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  ArrowForward,
  CheckCircleOutline,
  ExpandMore,
  PsychologyOutlined,
  SendOutlined,
  SupportAgentOutlined,
  ThumbDownOutlined,
  ThumbUpOutlined,
} from "@mui/icons-material";
import { api } from "../api/client";
import type { ApiPlan } from "../api/types";
import { PageHeader } from "../components/PageHeader";
import { useStudentScope } from "../components/StudentScopeContext";

type Source = {
  number: number;
  chunk_id: number;
  resource_id: number;
  title: string;
  resource_type: string;
  locator: string;
  excerpt: string;
};
type CompanionMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  action: string;
  grounding_status: string;
  sources: Source[];
  feedback: "helpful" | "not_helpful" | null;
  created_at: string;
};
type CompanionSession = {
  id: number;
  plan_id: number;
  competency?: string;
  goal: string;
  stage: string;
  stage_label: string;
  summary: string;
  started_at?: string;
  updated_at?: string;
  completed_at?: string | null;
  messages?: CompanionMessage[];
};
type Dashboard = {
  next_action: { kind: string; title: string; detail: string; route: string };
  active_plan: ApiPlan | null;
  sessions: CompanionSession[];
  goals: { id: number; competency: number; title: string; target_score: number; progress_percent: number; status: string }[];
  adaptive_states: { competency: number; competency_title: string; level: string; reason: string; success_streak: number; miss_streak: number }[];
  learning_focus: { id: number; competency: string; title: string; status: string; confidence: number }[];
};
const stages = [
  { key: "orient", label: "Goal" },
  { key: "explain", label: "Explain" },
  { key: "example", label: "Example" },
  { key: "reasoning", label: "Reason" },
  { key: "practice", label: "Practice" },
  { key: "reflect", label: "Reflect" },
  { key: "completed", label: "Done" },
];
const modes = [
  { key: "explain", label: "Explain" },
  { key: "example", label: "Worked example" },
  { key: "hint", label: "Give a hint" },
  { key: "simplify", label: "Make it simpler" },
  { key: "reasoning", label: "Coach my reasoning" },
  { key: "practice", label: "Practice question" },
  { key: "check", label: "Check understanding" },
];

export function StudentCompanionPage({
  onOpenRoute,
  onEvidence,
}: {
  onOpenRoute: (path: string) => void;
  onEvidence: () => void;
}) {
  const scope = useStudentScope();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [session, setSession] = useState<CompanionSession | null>(null);
  const [messages, setMessages] = useState<CompanionMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [goal, setGoal] = useState("");
  const [targetScore, setTargetScore] = useState(75);
  const [helpNote, setHelpNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const messageEnd = useRef<HTMLDivElement>(null);
  const subjectQuery = scope?.selectedSubjectId
    ? `?subject=${scope.selectedSubjectId}`
    : "";
  const load = useCallback(async () => {
    try {
      const result = await api<Dashboard>(`/tutor/companion/${subjectQuery}`);
      setDashboard(result);
      const planId = result.active_plan?.id;
      if (planId) {
        const history = await api<{
          messages: CompanionMessage[];
          session: CompanionSession | null;
        }>(`/tutor/plans/${planId}/messages/`);
        setMessages(history.messages);
        setSession(
          history.session ? { ...history.session, plan_id: planId } : null,
        );
        const persistentGoal = result.goals.find(item => item.competency === result.active_plan?.competency);
        setGoal(history.session?.goal ?? persistentGoal?.title ?? `Strengthen ${result.active_plan?.competency_title}`);
        setTargetScore(persistentGoal?.target_score ?? 75);
      } else {
        setMessages([]);
        setSession(null);
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load TALA Companion.",
      );
    }
  }, [subjectQuery]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    messageEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);
  const startSession = async () => {
    if (!dashboard?.active_plan) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<CompanionSession>(`/tutor/companion/sessions/`, {
        method: "POST",
        body: JSON.stringify({ plan_id: dashboard.active_plan.id, goal }),
      });
      setSession(result);
      setMessages(result.messages ?? []);
      setSuccess(
        "Guided learning session ready. Start with an explanation or example.",
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to start this companion session.",
      );
    } finally {
      setBusy(false);
    }
  };
  const saveGoal = async () => {
    if (!dashboard?.active_plan || !goal.trim()) return;
    setBusy(true); setError("");
    try { await api('/tutor/goals/', { method: 'POST', body: JSON.stringify({ competency: dashboard.active_plan.competency, title: goal.trim(), target_score: targetScore }) }); setSuccess('Your learning goal has been saved.'); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save your learning goal.'); }
    finally { setBusy(false); }
  };
  const ask = async (message: string, action = "explain") => {
    if (!dashboard?.active_plan || !message.trim()) return;
    setBusy(true);
    setError("");
    setDraft("");
    setMessages((current) => [
      ...current,
      {
        id: -Date.now(),
        role: "user",
        content: message.trim(),
        action,
        grounding_status: "",
        sources: [],
        feedback: null,
        created_at: new Date().toISOString(),
      },
    ]);
    try {
      const result = await api<{
        id: number;
        answer: string;
        mode: string;
        grounding_status: string;
        sources: Source[];
      }>(`/tutor/plans/${dashboard.active_plan.id}/messages/`, {
        method: "POST",
        body: JSON.stringify({ message: message.trim(), action }),
      });
      setMessages((current) => [
        ...current,
        {
          id: result.id,
          role: "assistant",
          content: result.answer,
          action: result.mode,
          grounding_status: result.grounding_status,
          sources: result.sources,
          feedback: null,
          created_at: new Date().toISOString(),
        },
      ]);
      setSession((current) =>
        current
          ? {
              ...current,
              stage:
                action === "hint" || action === "simplify"
                  ? "explain"
                  : action === "check"
                    ? "reflect"
                    : action,
              stage_label:
                stages.find((item) => item.key === action)?.label ??
                current.stage_label,
            }
          : current,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "TALA is temporarily unavailable.",
      );
    } finally {
      setBusy(false);
    }
  };
  const rate = async (messageId: number, rating: "helpful" | "not_helpful") => {
    try {
      await api(`/tutor/messages/${messageId}/feedback/`, {
        method: "POST",
        body: JSON.stringify({ rating }),
      });
      setMessages((current) =>
        current.map((item) =>
          item.id === messageId ? { ...item, feedback: rating } : item,
        ),
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to save feedback.",
      );
    }
  };
  const complete = async () => {
    if (!session) return;
    setBusy(true);
    try {
      const updated = await api<CompanionSession>(
        `/tutor/companion/sessions/${session.id}/`,
        { method: "PATCH", body: JSON.stringify({ complete: true }) },
      );
      setSession(updated);
      setSuccess("Session completed. Your summary is ready for review.");
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to complete the session.",
      );
    } finally {
      setBusy(false);
    }
  };
  const requestHelp = async () => {
    if (!dashboard?.active_plan) return;
    setBusy(true);
    try {
      await api("/tutor/companion/help/", {
        method: "POST",
        body: JSON.stringify({
          plan_id: dashboard.active_plan.id,
          session_id: session?.id,
          note: helpNote,
        }),
      });
      setHelpNote("");
      setSuccess(
        "Your assigned teacher has been notified that you still need help.",
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to request teacher help.",
      );
    } finally {
      setBusy(false);
    }
  };
  if (!dashboard && !error)
    return (
      <Box sx={{ minHeight: 360, display: "grid", placeItems: "center" }}>
        <CircularProgress size={28} />
      </Box>
    );
  const activeStage = Math.max(
    0,
    stages.findIndex((item) => item.key === (session?.stage ?? "orient")),
  );
  return (
    <>
      <PageHeader
        title="TALA Learning Companion"
        description="Follow a guided learning session based on your current support plan."
        action={
          <Button variant="outlined" onClick={onEvidence}>
            View My Learning Record
          </Button>
        }
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess("")}>
          {success}
        </Alert>
      )}
      <Card sx={{ mb: 3, overflow: "hidden", borderColor: "primary.main" }}>
        <Box
          sx={{
            p: { xs: 2.5, md: 3 },
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "auto minmax(0,1fr) auto" },
            gap: 2,
            alignItems: "center",
            bgcolor: "primary.light",
          }}
        >
          <Box
            component="img"
            src="/tala.png"
            alt="TALA"
            sx={{
              width: 62,
              height: 62,
              objectFit: "contain",
              borderRadius: "50%",
              bgcolor: "#fff",
            }}
          />
          <Box>
            <Typography
              variant="overline"
              color="primary.dark"
              fontWeight={800}
            >
              Your recommended next step
            </Typography>
            <Typography variant="h2">{dashboard?.next_action.title}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {dashboard?.next_action.detail}
            </Typography>
          </Box>
          <Button
            variant="contained"
            endIcon={<ArrowForward />}
            onClick={() => onOpenRoute(dashboard?.next_action.route ?? "/")}
          >
            Open next step
          </Button>
        </Box>
      </Card>
      {!dashboard?.active_plan ? (
        <Card sx={{ p: 3, textAlign: "center" }}>
          <Typography variant="h2">
            {dashboard?.next_action.kind === "review"
              ? "No guided session is needed right now"
              : "Complete your next learning step first"}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {dashboard?.next_action.kind === "review"
              ? "TALA guided sessions are available when an active recovery plan identifies a competency that needs support."
              : "After your assigned materials and diagnostic are complete, TALA will provide a guided session only when additional support is needed."}
          </Typography>
        </Card>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", xl: "minmax(0,1.45fr) 360px" },
            gap: 3,
            alignItems: "start",
          }}
        >
          <Stack gap={3}>
            <Card sx={{ p: { xs: 2, md: 2.5 } }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
                <Box><Typography variant="h2">My learning goal</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>Set a measurable target for {dashboard.active_plan.competency_title}.</Typography></Box>
                {dashboard.adaptive_states.find(item => item.competency === dashboard.active_plan?.competency) && <Chip color="primary" variant="outlined" label={`${dashboard.adaptive_states.find(item => item.competency === dashboard.active_plan?.competency)!.level} support`} sx={{ textTransform: 'capitalize' }} />}
              </Stack>
              {dashboard.goals.find(item => item.competency === dashboard.active_plan?.competency) && <Box sx={{ mt: 2 }}><LinearProgress variant="determinate" value={dashboard.goals.find(item => item.competency === dashboard.active_plan?.competency)!.progress_percent} sx={{ height: 7, borderRadius: 4 }} /><Typography variant="caption" color="text.secondary">{dashboard.goals.find(item => item.competency === dashboard.active_plan?.competency)!.progress_percent}% progress toward the recorded target</Typography></Box>}
              <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} sx={{ mt: 2 }}><TextField fullWidth size="small" label="Learning goal" value={goal} onChange={event => setGoal(event.target.value)} /><TextField size="small" type="number" label="Target score" value={targetScore} onChange={event => setTargetScore(Number(event.target.value))} inputProps={{ min: 1, max: 100 }} sx={{ width: { sm: 140 } }} /><Button variant="outlined" disabled={busy || !goal.trim()} onClick={() => void saveGoal()}>Save goal</Button></Stack>
              {dashboard.learning_focus.length > 0 && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>Current focus: {dashboard.learning_focus.map(item => item.title).join(' · ')}</Typography>}
            </Card>
            <Card sx={{ p: { xs: 2, md: 2.5 } }}>
              <Typography variant="h2">Guided session</Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.5 }}
              >
                {dashboard.active_plan.competency_title} · Baseline{" "}
                {Math.round(Number(dashboard.active_plan.baseline_score))}%
              </Typography>
              <Stepper
                activeStep={activeStage}
                alternativeLabel
                sx={{ mt: 3, overflowX: "auto" }}
              >
                {stages.map((item) => (
                  <Step key={item.key}>
                    <StepLabel>{item.label}</StepLabel>
                  </Step>
                ))}
              </Stepper>
              {!session && (
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  gap={1.5}
                  sx={{ mt: 3 }}
                >
                  <TextField
                    fullWidth
                    label="What do you want to understand today?"
                    value={goal}
                    onChange={(event) => setGoal(event.target.value)}
                  />
                  <Button
                    variant="contained"
                    startIcon={<PsychologyOutlined />}
                    onClick={() => void startSession()}
                    disabled={busy}
                  >
                    Start guided session
                  </Button>
                </Stack>
              )}
            </Card>
            {session && (
              <Card sx={{ overflow: "hidden" }}>
                <Box sx={{ px: 2.5, py: 2, bgcolor: "#f8fafb" }}>
                  <Typography variant="caption" color="text.secondary">
                    Session goal
                  </Typography>
                  <Typography variant="body2" fontWeight={750}>
                    {session.goal}
                  </Typography>
                </Box>
                <Divider />
                <Box
                  sx={{
                    p: 2,
                    minHeight: 360,
                    maxHeight: 540,
                    overflowY: "auto",
                  }}
                >
                  <Stack gap={1.5}>
                    {messages.map((message) => (
                      <Box
                        key={`${message.id}-${message.created_at}`}
                        sx={{
                          alignSelf:
                            message.role === "user" ? "flex-end" : "stretch",
                          ml: message.role === "user" ? "15%" : 0,
                          mr: message.role === "assistant" ? "8%" : 0,
                          p: 1.75,
                          borderRadius: 2,
                          bgcolor:
                            message.role === "user"
                              ? "primary.main"
                              : "#eef3f2",
                          color:
                            message.role === "user"
                              ? "primary.contrastText"
                              : "text.primary",
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{ whiteSpace: "pre-line", lineHeight: 1.65 }}
                        >
                          {message.content}
                        </Typography>
                        {message.role === "assistant" && (
                          <>
                            <Stack
                              direction="row"
                              gap={0.5}
                              alignItems="center"
                              sx={{ mt: 1 }}
                            >
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                Was this useful?
                              </Typography>
                              <Tooltip title="Helpful">
                                <IconButton
                                  size="small"
                                  color={
                                    message.feedback === "helpful"
                                      ? "success"
                                      : "default"
                                  }
                                  onClick={() =>
                                    void rate(message.id, "helpful")
                                  }
                                >
                                  <ThumbUpOutlined fontSize="inherit" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Not helpful">
                                <IconButton
                                  size="small"
                                  color={
                                    message.feedback === "not_helpful"
                                      ? "error"
                                      : "default"
                                  }
                                  onClick={() =>
                                    void rate(message.id, "not_helpful")
                                  }
                                >
                                  <ThumbDownOutlined fontSize="inherit" />
                                </IconButton>
                              </Tooltip>
                              <Chip
                                size="small"
                                label={
                                  message.grounding_status === "grounded"
                                    ? "Grounded"
                                    : "Limited evidence"
                                }
                                color={
                                  message.grounding_status === "grounded"
                                    ? "success"
                                    : "warning"
                                }
                                variant="outlined"
                              />
                            </Stack>
                            {message.sources?.map((source) => (
                              <Accordion
                                key={source.chunk_id}
                                disableGutters
                                elevation={0}
                                sx={{
                                  mt: 1,
                                  bgcolor: "transparent",
                                  "&:before": { display: "none" },
                                }}
                              >
                                <AccordionSummary
                                  expandIcon={<ExpandMore />}
                                  sx={{ minHeight: 36, px: 0 }}
                                >
                                  <Typography
                                    variant="caption"
                                    fontWeight={700}
                                  >
                                    [{source.number}] {source.title}
                                    {source.locator
                                      ? ` · ${source.locator}`
                                      : ""}
                                  </Typography>
                                </AccordionSummary>
                                <AccordionDetails sx={{ px: 0, pt: 0 }}>
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                  >
                                    {source.excerpt}
                                  </Typography>
                                </AccordionDetails>
                              </Accordion>
                            ))}
                          </>
                        )}
                      </Box>
                    ))}
                    {busy && (
                      <Box
                        sx={{ display: "flex", gap: 1, alignItems: "center" }}
                      >
                        <CircularProgress size={15} />
                        <Typography variant="body2" color="text.secondary">
                          TALA is reviewing approved evidence…
                        </Typography>
                      </Box>
                    )}
                    <div ref={messageEnd} />
                  </Stack>
                </Box>
                <Divider />
                <Box sx={{ p: 2 }}>
                  <Stack
                    direction="row"
                    useFlexGap
                    flexWrap="wrap"
                    gap={0.75}
                    sx={{ mb: 1.5 }}
                  >
                    {modes.map((mode) => (
                      <Button
                        key={mode.key}
                        size="small"
                        variant="outlined"
                        disabled={busy || Boolean(session.completed_at)}
                        onClick={() => void ask(mode.label, mode.key)}
                      >
                        {mode.label}
                      </Button>
                    ))}
                  </Stack>
                  <Box
                    component="form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void ask(draft);
                    }}
                    sx={{ display: "flex", gap: 1 }}
                  >
                    <TextField
                      fullWidth
                      size="small"
                      label={
                        session.completed_at
                          ? "Start another session to continue"
                          : "Ask TALA about this competency"
                      }
                      value={draft}
                      disabled={busy || Boolean(session.completed_at)}
                      onChange={(event) => setDraft(event.target.value)}
                    />
                    <Button
                      type="submit"
                      variant="contained"
                      disabled={
                        busy || Boolean(session.completed_at) || !draft.trim()
                      }
                    >
                      <SendOutlined />
                    </Button>
                  </Box>
                </Box>
              </Card>
            )}
          </Stack>
          <Stack gap={3}>
            <Card sx={{ p: 2.5 }}>
              <Typography variant="h2">Session progress</Typography>
              <LinearProgress
                variant="determinate"
                value={(activeStage / (stages.length - 1)) * 100}
                sx={{ mt: 2, height: 8, borderRadius: 4 }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {session?.stage_label ?? "Set a goal to begin"}
              </Typography>
              {session?.summary && (
                <Alert
                  severity="success"
                  icon={<CheckCircleOutline />}
                  sx={{ mt: 2 }}
                >
                  {session.summary}
                </Alert>
              )}
              {session && !session.completed_at && (
                <Button
                  fullWidth
                  variant="contained"
                  sx={{ mt: 2 }}
                  onClick={() => void complete()}
                  disabled={busy}
                >
                  Complete & summarize session
                </Button>
              )}
              {session?.completed_at && (
                <Button
                  fullWidth
                  variant="outlined"
                  sx={{ mt: 2 }}
                  onClick={() => void startSession()}
                  disabled={busy}
                >
                  Start another guided session
                </Button>
              )}
            </Card>
            {dashboard.sessions.filter(
              (item) => item.completed_at && item.id !== session?.id,
            ).length > 0 && (
              <Card sx={{ p: 2.5 }}>
                <Typography variant="h2">Previous session summaries</Typography>
                <Stack divider={<Divider />} sx={{ mt: 1 }}>
                  {dashboard.sessions
                    .filter(
                      (item) => item.completed_at && item.id !== session?.id,
                    )
                    .map((item) => (
                      <Box key={item.id} sx={{ py: 1.25 }}>
                        <Typography variant="body2" fontWeight={700}>
                          {item.goal}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: "block", mt: 0.25 }}
                        >
                          {item.summary}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {item.completed_at
                            ? new Date(item.completed_at).toLocaleString()
                            : ""}
                        </Typography>
                      </Box>
                    ))}
                </Stack>
              </Card>
            )}
            <Card sx={{ p: 2.5 }}>
              <Typography variant="h2">Still need help?</Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.75 }}
              >
                Send your teacher a concise follow-up request linked to this
                competency and TALA session.
              </Typography>
              <TextField
                fullWidth
                multiline
                minRows={3}
                label="What should your teacher know?"
                value={helpNote}
                onChange={(event) => setHelpNote(event.target.value)}
                sx={{ mt: 2 }}
              />
              <Button
                fullWidth
                variant="outlined"
                startIcon={<SupportAgentOutlined />}
                sx={{ mt: 1.5 }}
                disabled={busy}
                onClick={() => void requestHelp()}
              >
                I Still Need Help
              </Button>
            </Card>
          </Stack>
        </Box>
      )}
    </>
  );
}
