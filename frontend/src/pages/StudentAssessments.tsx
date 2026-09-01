import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  LinearProgress,
  Radio,
  RadioGroup,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import {
  ArrowBack,
  ArrowForward,
  AssignmentOutlined,
} from "@mui/icons-material";
import { PageHeader } from "../components/PageHeader";
import { StatusChip } from "../components/StatusChip";
import { api } from "../api/client";
import type {
  ApiAssessment,
  AssessmentAttempt,
  PrerequisiteStatus,
} from "../api/types";
import {
  DataTablePagination,
  DataTableToolbar,
  SortableTableCell,
  useDataTable,
} from "../components/DataTable";
import { useStudentScope } from "../components/StudentScopeContext";

const prerequisiteDetail = (item: PrerequisiteStatus) => {
  if (item.completed) return "Complete";
  const details = [
    item.resource_type === "video"
      ? `${item.watched_percent}% watched`
      : item.opened
        ? "Viewed"
        : "Not opened",
  ];
  if (item.quiz_required) {
    details.push(
      item.quiz_score === null
        ? `Quiz not taken · pass ${item.passing_score}%`
        : item.quiz_passed
          ? `Quiz ${Math.round(item.quiz_score)}% · passed`
          : `Quiz ${Math.round(item.quiz_score)}% · pass ${item.passing_score}% required`,
    );
  } else {
    details.push("Mark complete after reviewing");
  }
  return details.join(" · ");
};

export function StudentAssessments({
  onRecovery,
  onMaterials,
  targetCompetency,
  onTargetHandled,
}: {
  onRecovery: () => void;
  onMaterials: () => void;
  targetCompetency?: number | null;
  onTargetHandled?: () => void;
}) {
  const [assessments, setAssessments] = useState<ApiAssessment[] | null>(null);
  const [active, setActive] = useState<ApiAssessment | null>(null);
  const [attempts, setAttempts] = useState<AssessmentAttempt[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [result, setResult] = useState<AssessmentAttempt | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [requirementsAssessment, setRequirementsAssessment] =
    useState<ApiAssessment | null>(null);
  const scope = useStudentScope();

  const load = useCallback(() => {
    if (!scope?.selectedSubjectId) return Promise.resolve();
    const query = `?subject=${scope.selectedSubjectId}`;
    return Promise.all([
      api<{ results?: ApiAssessment[] } | ApiAssessment[]>(
        `/assessments/${query}`,
      ),
      api<{ results?: AssessmentAttempt[] } | AssessmentAttempt[]>(
        `/assessments/my-attempts/${query}`,
      ),
    ])
      .then(([assessmentResult, attemptResult]) => {
        setAssessments(
          Array.isArray(assessmentResult)
            ? assessmentResult
            : (assessmentResult.results ?? []),
        );
        setAttempts(
          Array.isArray(attemptResult)
            ? attemptResult
            : (attemptResult.results ?? []),
        );
      })
      .catch((reason) => setError(reason.message));
  }, [scope?.selectedSubjectId]);
  useEffect(() => {
    setAssessments(null);
    setActive(null);
    setResult(null);
    void load();
  }, [load]);

  const [activeCompetency, setActiveCompetency] = useState<number | null>(null);
  const start = useCallback(
    async (assessment: ApiAssessment, competencyId?: number | null) => {
      let resolvedCompetency = competencyId ?? null;
      let retryQuestionIds: number[] = [];
      if (!resolvedCompetency && assessment.kind === "post") {
        const assessmentResults = attempts
          .filter((attempt) => attempt.assessment === assessment.id)
          .flatMap((attempt) => attempt.competency_results);
        const nextRetry = assessment.competency_ids
          .map((id) => assessmentResults.find((item) => item.competency === id))
          .find((item) => item && item.status !== "mastered");
        resolvedCompetency = nextRetry?.competency ?? null;
      }
      if (resolvedCompetency) {
        const latestForCompetency = attempts.find(
          (attempt) =>
            attempt.assessment === assessment.id &&
            attempt.competency_results.some(
              (result) => result.competency === resolvedCompetency,
            ),
        );
        retryQuestionIds = latestForCompetency?.incorrect_question_ids ?? [];
      }
      setBusy(true);
      setError("");
      const query = new URLSearchParams();
      if (resolvedCompetency)
        query.set("competency", String(resolvedCompetency));
      if (retryQuestionIds.length)
        query.set("questions", retryQuestionIds.join(","));
      try {
        const response = await api<{ assessment: ApiAssessment }>(
          `/assessments/${assessment.id}/start/${query.size ? `?${query}` : ""}`,
        );
        setActive(response.assessment);
        setActiveCompetency(resolvedCompetency);
        setAnswers({});
        setQuestionIndex(0);
        setResult(null);
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to start assessment.",
        );
      } finally {
        setBusy(false);
      }
    },
    [attempts],
  );
  useEffect(() => {
    if (!targetCompetency || !assessments || active || busy) return;
    const matching = assessments.find(
      (item) =>
        item.kind === "post" &&
        item.available &&
        item.competency_ids.includes(targetCompetency),
    );
    if (matching) {
      onTargetHandled?.();
      void start(matching, targetCompetency);
    }
  }, [targetCompetency, assessments, active, busy, start, onTargetHandled]);
  const submit = async () => {
    if (!active?.questions) return;
    setBusy(true);
    setError("");
    try {
      const submitted = await api<AssessmentAttempt>(
        `/assessments/${active.id}/submit/`,
        {
          method: "POST",
          body: JSON.stringify({
            competency: activeCompetency,
            question_ids: active.questions.map((question) => question.id),
            answers: active.questions.map((question) => ({
              question_id: question.id,
              answer: answers[question.id],
            })),
          }),
        },
      );
      setResult(submitted);
      setActive(null);
      setActiveCompetency(null);
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to submit assessment.",
      );
    } finally {
      setBusy(false);
    }
  };
  const assessmentRows = (assessments ?? []).map((assessment) => ({
    assessment,
    previous: attempts.find((attempt) => attempt.assessment === assessment.id),
    results: assessment.competency_ids.map((competencyId) =>
      attempts
        .flatMap((attempt) => attempt.competency_results)
        .find((item) => item.competency === competencyId),
    ),
  }));
  const table = useDataTable(assessmentRows, {
    searchText: (row) =>
      `${row.assessment.title} ${row.assessment.kind} ${row.assessment.available ? "available" : "locked"}`,
    sortValues: {
      assessment: (row) => row.assessment.title,
      type: (row) => row.assessment.kind,
      questions: (row) => row.assessment.question_count,
      score: (row) => (row.previous ? Number(row.previous.score) : null),
      status: (row) =>
        row.previous
          ? "completed"
          : row.assessment.available
            ? "available"
            : "locked",
    },
    initialSort: "assessment",
  });

  if (scope && !scope.loading && !scope.selectedSubjectId)
    return (
      <>
        <PageHeader title="Assessments" />
        <Alert severity="info">
          No subject with assigned assessments is available yet.
        </Alert>
      </>
    );
  if (!assessments && !error)
    return (
      <Box sx={{ minHeight: 360, display: "grid", placeItems: "center" }}>
        <CircularProgress size={28} />
      </Box>
    );
  if (active?.questions) {
    const question = active.questions[questionIndex];
    const answeredCount = active.questions.filter((item) =>
      Boolean(answers[item.id]?.trim()),
    ).length;
    const freeResponse = ["short", "essay"].includes(question.question_type);
    return (
      <>
        <Button
          startIcon={<ArrowBack />}
          onClick={() => setActive(null)}
          sx={{ mb: 2, px: 0 }}
        >
          Exit assessment
        </Button>
        <PageHeader
          title={active.title}
          description={`${answeredCount} of ${active.questions.length} answered`}
        />
        <Box sx={{ maxWidth: 840, mx: "auto" }}>
          <LinearProgress
            variant="determinate"
            value={((questionIndex + 1) / active.questions.length) * 100}
            sx={{ height: 7, borderRadius: 1, mb: 3 }}
          />
          <Card sx={{ p: { xs: 2.5, sm: 4 } }}>
            <Typography
              variant="overline"
              color="text.secondary"
              fontWeight={700}
            >
              Question {questionIndex + 1} of {active.questions.length}
            </Typography>
            <Typography variant="h2" sx={{ mt: 1 }}>
              {question.prompt}
            </Typography>
            {freeResponse ? (
              <TextField
                fullWidth
                sx={{ mt: 2 }}
                label={
                  question.question_type === "essay"
                    ? "Your short essay"
                    : "Your answer"
                }
                value={answers[question.id] ?? ""}
                onChange={(event) =>
                  setAnswers((current) => ({
                    ...current,
                    [question.id]: event.target.value,
                  }))
                }
                multiline={question.question_type === "essay"}
                minRows={question.question_type === "essay" ? 5 : undefined}
                inputProps={
                  question.question_type === "essay"
                    ? { maxLength: question.character_limit }
                    : undefined
                }
                helperText={
                  question.question_type === "essay"
                    ? `${(answers[question.id] ?? "").length}/${question.character_limit} characters · Your teacher will review this response before your result is finalized.`
                    : "Enter a concise identification answer."
                }
              />
            ) : (
              <FormControl sx={{ mt: 2, width: "100%" }}>
                <RadioGroup
                  value={answers[question.id] ?? ""}
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      [question.id]: event.target.value,
                    }))
                  }
                >
                  {question.options.map((option) => (
                    <FormControlLabel
                      key={option}
                      value={option}
                      control={<Radio />}
                      label={option}
                      sx={{
                        border: "1px solid",
                        borderColor:
                          answers[question.id] === option
                            ? "primary.main"
                            : "divider",
                        borderRadius: 1,
                        m: 0,
                        mb: 1,
                        px: 1.5,
                        py: 0.5,
                        bgcolor:
                          answers[question.id] === option ? "#f0f6fa" : "#fff",
                      }}
                    />
                  ))}
                </RadioGroup>
              </FormControl>
            )}
            <Divider sx={{ my: 3 }} />
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Button
                disabled={questionIndex === 0}
                onClick={() => setQuestionIndex((index) => index - 1)}
              >
                Previous
              </Button>
              {questionIndex < active.questions.length - 1 ? (
                <Button
                  variant="contained"
                  endIcon={<ArrowForward />}
                  disabled={!answers[question.id]?.trim()}
                  onClick={() => setQuestionIndex((index) => index + 1)}
                >
                  Next question
                </Button>
              ) : (
                <Button
                  variant="contained"
                  disabled={answeredCount !== active.questions.length || busy}
                  onClick={submit}
                >
                  Submit assessment
                </Button>
              )}
            </Box>
          </Card>
        </Box>
      </>
    );
  }
  if (!assessments?.length) {
    return (
      <>
        <PageHeader
          title="Assessments"
          description="View diagnostic, mastery, and remedial assessments assigned to this subject."
        />
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Card
          sx={{
            maxWidth: 720,
            mx: "auto",
            mt: 4,
            px: { xs: 3, sm: 5 },
            py: { xs: 4, sm: 6 },
            textAlign: "center",
          }}
        >
          <Box
            sx={{
              width: 58,
              height: 58,
              mx: "auto",
              mb: 2,
              borderRadius: "50%",
              bgcolor: "primary.light",
              color: "primary.dark",
              display: "grid",
              placeItems: "center",
            }}
          >
            <AssignmentOutlined />
          </Box>
          <Typography variant="h2">No assessments assigned yet</Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 1, mx: "auto", maxWidth: 480, lineHeight: 1.7 }}
          >
            There is nothing to complete in this subject right now. An
            assessment will appear here after your teacher assigns and activates
            it.
          </Typography>
          <Button variant="outlined" sx={{ mt: 3 }} onClick={onMaterials}>
            Continue learning materials
          </Button>
        </Card>
      </>
    );
  }
  return (
    <>
      <PageHeader
        title="Assessments"
        description="Complete formal assessments assigned to your class."
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {result && (
        <Alert
          severity={
            result.grading_status === "pending_review" ? "info" : "success"
          }
          sx={{ mb: 2 }}
        >
          {result.grading_status === "pending_review"
            ? "Assessment submitted. Your teacher will review the short essays before your score and recovery result are finalized."
            : `Assessment submitted. Your recorded score is ${Math.round(Number(result.score))}%.`}
        </Alert>
      )}
      <Card>
        <DataTableToolbar
          query={table.query}
          onQuery={table.setQuery}
          placeholder="Search assessments"
          count={table.filteredCount}
        />
        <TableContainer>
          <Table sx={{ minWidth: 780 }}>
            <TableHead>
              <TableRow>
                <SortableTableCell
                  column="assessment"
                  label="Assessment"
                  orderBy={table.orderBy}
                  direction={table.direction}
                  onSort={table.toggleSort}
                />
                <SortableTableCell
                  column="type"
                  label="Type"
                  orderBy={table.orderBy}
                  direction={table.direction}
                  onSort={table.toggleSort}
                />
                <SortableTableCell
                  column="questions"
                  label="Questions"
                  orderBy={table.orderBy}
                  direction={table.direction}
                  onSort={table.toggleSort}
                />
                <SortableTableCell
                  column="score"
                  label="Latest score"
                  orderBy={table.orderBy}
                  direction={table.direction}
                  onSort={table.toggleSort}
                />
                <SortableTableCell
                  column="status"
                  label="Status"
                  orderBy={table.orderBy}
                  direction={table.direction}
                  onSort={table.toggleSort}
                />
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {table.pageRows.map(({ assessment, previous, results }) => {
                const pendingReview =
                  previous?.grading_status === "pending_review";
                const allMastered =
                  assessment.kind === "post" &&
                  results.length > 0 &&
                  results.every((item) => item?.status === "mastered");
                const needsRetry =
                  assessment.kind === "post" &&
                  Boolean(previous) &&
                  !pendingReview &&
                  !allMastered;
                const completed = pendingReview
                  ? false
                  : assessment.kind === "post"
                    ? allMastered
                    : Boolean(previous);
                return (
                  <TableRow key={assessment.id}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={650}>
                        {assessment.title}
                      </Typography>
                      {needsRetry && (
                        <Typography
                          variant="caption"
                          color="warning.dark"
                          sx={{ display: "block", mt: 0.5 }}
                        >
                          One or more competencies still require a mastery
                          retry.
                        </Typography>
                      )}
                      {!assessment.available &&
                        assessment.availability_reason && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: "block", mt: 0.5, maxWidth: 320 }}
                          >
                            {assessment.availability_reason}
                          </Typography>
                        )}
                      {assessment.kind === "pre" &&
                        assessment.prerequisite_statuses.length > 0 && (
                          <Button
                            size="small"
                            variant="text"
                            sx={{ mt: 0.5, px: 0 }}
                            onClick={() => setRequirementsAssessment(assessment)}
                          >
                            View requirements ({assessment.prerequisite_statuses.length})
                          </Button>
                        )}
                    </TableCell>
                    <TableCell>
                      {assessment.kind === "pre"
                        ? "Diagnostic"
                        : assessment.kind === "remedial"
                          ? "Remedial exam"
                          : "Mastery assessment"}
                    </TableCell>
                    <TableCell>{assessment.question_count}</TableCell>
                    <TableCell>
                      {pendingReview ? (
                        <Typography variant="body2" color="text.secondary">
                          Awaiting review
                        </Typography>
                      ) : previous?.score != null ? (
                        <Typography variant="body2" fontWeight={700}>
                          {Math.round(Number(previous.score))}%
                        </Typography>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusChip
                        label={
                          pendingReview
                            ? "Teacher review"
                            : completed
                              ? "Completed"
                              : needsRetry
                                ? "Review needed"
                                : assessment.available
                                  ? "Available"
                                  : "Locked"
                        }
                      />
                    </TableCell>
                    <TableCell align="right">
                      {pendingReview ? (
                        <Typography variant="body2" color="text.secondary">
                          Awaiting teacher
                        </Typography>
                      ) : completed ? (
                        <Typography variant="body2" color="text.secondary">
                          No action needed
                        </Typography>
                      ) : assessment.available ? (
                        <Button
                          size="small"
                          variant="contained"
                          disabled={busy}
                          onClick={() => start(assessment)}
                        >
                          {needsRetry ? "Try again" : "Start assessment"}
                        </Button>
                      ) : assessment.kind === "post" ? (
                        <Button
                          size="small"
                          variant="text"
                          onClick={onRecovery}
                        >
                          View recovery plan
                        </Button>
                      ) : assessment.kind === "pre" &&
                        assessment.remaining_prerequisites > 0 ? (
                        <Button
                          size="small"
                          variant="text"
                          onClick={onMaterials}
                        >
                          Complete required materials and quizzes
                        </Button>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Not available
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        {!table.filteredCount && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ p: 4, textAlign: "center" }}
          >
            No assessments match this search.
          </Typography>
        )}
        <DataTablePagination
          count={table.filteredCount}
          page={table.page}
          rowsPerPage={table.rowsPerPage}
          onPage={table.setPage}
          onRowsPerPage={table.setRowsPerPage}
        />
        <Dialog
          open={Boolean(requirementsAssessment)}
          onClose={() => setRequirementsAssessment(null)}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle>Required materials and quizzes</DialogTitle>
          <DialogContent dividers>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Complete these requirements before starting {requirementsAssessment?.title}.
            </Typography>
            {requirementsAssessment?.prerequisite_statuses.map((item) => (
              <Box
                key={item.assignment_id}
                sx={{
                  display: "grid",
                  gridTemplateColumns: "12px minmax(0, 1fr)",
                  gap: 1,
                  py: 1.25,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  "&:last-child": { borderBottom: 0 },
                }}
              >
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    mt: 0.65,
                    borderRadius: "50%",
                    bgcolor: item.completed
                      ? "success.main"
                      : item.quiz_score !== null
                        ? "warning.main"
                        : "divider",
                  }}
                />
                <Box>
                  <Typography variant="body2" fontWeight={700}>
                    {item.title}
                  </Typography>
                  <Typography
                    variant="caption"
                    color={item.completed ? "success.main" : "text.secondary"}
                  >
                    {prerequisiteDetail(item)}
                  </Typography>
                </Box>
              </Box>
            ))}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRequirementsAssessment(null)}>Close</Button>
            {requirementsAssessment?.remaining_prerequisites ? (
              <Button variant="contained" onClick={onMaterials}>
                Open learning materials
              </Button>
            ) : null}
          </DialogActions>
        </Dialog>
      </Card>
    </>
  );
}
