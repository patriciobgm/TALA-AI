import { Fragment, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Collapse,
  Divider,
  IconButton,
  LinearProgress,
  MenuItem,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { KeyboardArrowDown, KeyboardArrowRight } from "@mui/icons-material";
import { api } from "../api/client";
import type { ApiLearner, MaterialAnalytics } from "../api/types";
import {
  DataTablePagination,
  DataTableToolbar,
  SortableTableCell,
  useDataTable,
} from "../components/DataTable";
import { PageHeader } from "../components/PageHeader";
import { StatusChip } from "../components/StatusChip";
import { downloadText } from "../utils/download";
import { useTeachingScope } from "../components/TeachingScopeContext";

type MaterialRow = MaterialAnalytics["learners"][number];
type LearnerMaterialGroup = {
  studentId: number;
  student: string;
  section: string;
  rows: MaterialRow[];
  completed: number;
  averageProgress: number;
  quizPassed: number;
  quizAttempted: number;
  lastActivityAt: string | null;
};
type CompanionAnalytics = {
  summary: {
    learners: number;
    sessions: number;
    completed_sessions: number;
    helpful: number;
    not_helpful: number;
    open_handoffs: number;
    active_misconceptions: number;
  };
  modes: { action: string; count: number }[];
  top_misconceptions: { title: string; competency: string; count: number }[];
  learners: {
    student: number;
    student_name: string;
    section: string;
    sessions: number;
    completed_sessions: number;
    active_signals: number;
    help_requests: number;
    last_session_at: string | null;
  }[];
};
type MisconceptionSignal = {
  id: number;
  student: number;
  student_name: string;
  section: string;
  competency: string;
  misconception: string;
  status: string;
  confidence: number;
  occurrence_count: number;
  teacher_note: string;
  last_observed_at: string;
};

export function TeacherReportsPage() {
  const [learners, setLearners] = useState<ApiLearner[]>([]);
  const [materials, setMaterials] = useState<MaterialAnalytics | null>(null);
  const [companion, setCompanion] = useState<CompanionAnalytics | null>(null);
  const [signals, setSignals] = useState<MisconceptionSignal[]>([]);
  const [section, setSection] = useState<
    "recovery" | "materials" | "companion"
  >(() => {
    const requested = new URLSearchParams(window.location.search).get("view");
    return requested === "materials" || requested === "companion"
      ? requested
      : "recovery";
  });
  const [expandedLearner, setExpandedLearner] = useState<number | null>(null);
  const [error, setError] = useState("");
  const scope = useTeachingScope();
  const changeSection = (next: "recovery" | "materials" | "companion") => {
    setSection(next);
    const url = new URL(window.location.href);
    if (next === "recovery") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  };
  useEffect(() => {
    const restoreSection = () => {
      const requested = new URLSearchParams(window.location.search).get("view");
      setSection(
        requested === "materials" || requested === "companion"
          ? requested
          : "recovery",
      );
    };
    window.addEventListener("popstate", restoreSection);
    return () => window.removeEventListener("popstate", restoreSection);
  }, []);
  useEffect(() => {
    if (!scope?.selectedSubjectId) return;
    setError("");
    Promise.all([
      api<ApiLearner[]>(
        `/dashboard/teacher/learners/?subject=${scope.selectedSubjectId}`,
      ),
      api<MaterialAnalytics>(
        `/dashboard/teacher/materials/?subject=${scope.selectedSubjectId}`,
      ),
      api<CompanionAnalytics>(
        `/tutor/companion/analytics/?subject=${scope.selectedSubjectId}`,
      ),
      api<MisconceptionSignal[]>(
        `/tutor/misconception-signals/?subject=${scope.selectedSubjectId}`,
      ),
    ])
      .then(([learnerRows, materialRows, companionRows, signalRows]) => {
        setLearners(learnerRows);
        setMaterials(materialRows);
        setCompanion(companionRows);
        setSignals(signalRows);
      })
      .catch((reason) => setError(reason.message));
  }, [scope?.selectedSubjectId]);
  const recoveryTable = useDataTable(learners, {
    searchText: (item) =>
      `${item.name} ${item.email} ${item.section} ${item.status}`,
    sortValues: {
      learner: (item) => item.name,
      progress: (item) => item.progress,
      gaps: (item) => item.gaps,
      score: (item) => item.assessment,
      status: (item) => item.status,
    },
    initialSort: "gaps",
    initialDirection: "desc",
  });
  const learnerMaterialGroups: LearnerMaterialGroup[] = Array.from(
    (materials?.learners ?? [])
      .reduce((groups, item) => {
        const group = groups.get(item.student_id) ?? {
          studentId: item.student_id,
          student: item.student,
          section: item.section,
          rows: [],
        };
        group.rows.push(item);
        groups.set(item.student_id, group);
        return groups;
      }, new Map<number, Pick<LearnerMaterialGroup, "studentId" | "student" | "section" | "rows">>())
      .values(),
  ).map((group) => {
    const activeDates = group.rows
      .map((item) => item.last_activity_at)
      .filter((value): value is string => Boolean(value))
      .sort(
        (left, right) => new Date(right).getTime() - new Date(left).getTime(),
      );
    return {
      ...group,
      completed: group.rows.filter((item) => item.status === "completed")
        .length,
      averageProgress: group.rows.length
        ? Math.round(
            group.rows.reduce((sum, item) => sum + item.progress_percent, 0) /
              group.rows.length,
          )
        : 0,
      quizPassed: group.rows.filter((item) => item.quiz_passed).length,
      quizAttempted: group.rows.filter(
        (item) => item.latest_quiz_score !== null,
      ).length,
      lastActivityAt: activeDates[0] ?? null,
    };
  });
  const materialTable = useDataTable(learnerMaterialGroups, {
    searchText: (item) =>
      `${item.student} ${item.section} ${item.rows.map((row) => `${row.material} ${row.status}`).join(" ")}`,
    sortValues: {
      learner: (item) => item.student,
      materials: (item) => item.rows.length,
      progress: (item) => item.completed / item.rows.length,
      score: (item) => item.quizPassed,
      activity: (item) =>
        item.lastActivityAt ? new Date(item.lastActivityAt).getTime() : 0,
    },
    initialSort: "activity",
    initialDirection: "desc",
  });
  const assessed = learners.filter((item) => item.assessment !== null);
  const scoreDistribution = [
    {
      label: "75–100%",
      detail: "At or above mastery",
      count: assessed.filter((item) => Number(item.assessment) >= 75).length,
      color: "#2e7d5b",
    },
    {
      label: "50–74%",
      detail: "Developing",
      count: assessed.filter(
        (item) => Number(item.assessment) >= 50 && Number(item.assessment) < 75,
      ).length,
      color: "#d08a24",
    },
    {
      label: "Below 50%",
      detail: "Needs focused support",
      count: assessed.filter((item) => Number(item.assessment) < 50).length,
      color: "#c65353",
    },
    {
      label: "Not assessed",
      detail: "No submitted result",
      count: learners.length - assessed.length,
      color: "#8a949c",
    },
  ];
  const supportDistribution = [
    {
      label: "On track",
      detail: "No current intervention",
      count: learners.filter((item) => item.status === "On track").length,
      color: "#2e7d5b",
    },
    {
      label: "Monitor",
      detail: "Review upcoming progress",
      count: learners.filter((item) => item.status === "Monitor").length,
      color: "#d08a24",
    },
    {
      label: "Intervention",
      detail: "Teacher follow-up needed",
      count: learners.filter((item) => item.status === "Intervention").length,
      color: "#c65353",
    },
  ];
  const learnerAssignments = materials?.summary.assigned_learners ?? 0;
  const materialFunnel = [
    { label: "Assigned", count: learnerAssignments, color: "#2d5f87" },
    {
      label: "Opened",
      count:
        learnerAssignments -
        (materials?.materials.reduce(
          (sum, item) => sum + item.not_started,
          0,
        ) ?? 0),
      color: "#397f91",
    },
    {
      label: "Completed",
      count: materials?.summary.completed ?? 0,
      color: "#3f8c70",
    },
    {
      label: "Quiz passed",
      count: materials?.summary.quiz_passed ?? 0,
      color: "#2e7d5b",
    },
  ];
  const exportReport = () =>
    section === "companion"
      ? downloadText(
          "tala-companion-analytics.csv",
          [
            "Learner,Section,Sessions,Completed sessions,Active learning difficulties,Open handoffs",
            ...(companion?.learners ?? []).map(
              (item) =>
                `"${item.student_name}","${item.section}",${item.sessions},${item.completed_sessions},${item.active_signals},${item.help_requests}`,
            ),
          ].join("\n"),
        )
      : section === "materials"
        ? downloadText(
            "tala-material-engagement.csv",
            [
              "Material,Learner,Section,Status,Reading progress,Latest quiz score,Attempts,Quiz passed",
              ...(materials?.learners ?? []).map(
                (item) =>
                  `"${item.material}","${item.student}","${item.section}",${item.status},${item.progress_percent}%,${item.latest_quiz_score ?? ""},${item.attempt_count},${item.quiz_passed ? "Yes" : "No"}`,
              ),
            ].join("\n"),
          )
        : downloadText(
            "tala-recovery-report.csv",
            [
              "Learner,Plan progress,Active gaps,Latest assessment,Status",
              ...learners.map(
                (item) =>
                  `${item.name},${item.progress}%,${item.gaps},${item.assessment ?? ""},${item.status}`,
              ),
            ].join("\n"),
          );
  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        description="Review assessment outcomes, recovery progress, material engagement, and module quiz results."
        action={
          <Button variant="outlined" onClick={exportReport}>
            Export Current View
          </Button>
        }
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Card sx={{ mb: 3 }}>
        <Tabs value={section} onChange={(_, value) => changeSection(value)}>
          <Tab value="recovery" label="Recovery Outcomes" />
          <Tab value="materials" label="Learning Materials & Quizzes" />
          <Tab value="companion" label="TALA Companion" />
        </Tabs>
      </Card>
      {section === "recovery" ? (
        <>
          <Card sx={{ mb: 3, p: 2.5 }}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr 1fr", lg: "repeat(4, 1fr)" },
                gap: { xs: 2, lg: 0 },
              }}
            >
              {[
                ["Learners", learners.length],
                ["Assessed", assessed.length],
                [
                  "Average Score",
                  assessed.length
                    ? `${Math.round(assessed.reduce((sum, item) => sum + Number(item.assessment), 0) / assessed.length)}%`
                    : "—",
                ],
                [
                  "Average Plan Progress",
                  learners.length
                    ? `${Math.round(learners.reduce((sum, item) => sum + item.progress, 0) / learners.length)}%`
                    : "—",
                ],
              ].map(([label, value], index) => (
                <Box
                  key={label}
                  sx={{
                    px: { lg: index === 0 ? 0 : 3 },
                    borderLeft: { lg: index > 0 ? "1px solid #e1e6eb" : 0 },
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    {label}
                  </Typography>
                  <Typography sx={{ fontSize: 24, fontWeight: 750 }}>
                    {value}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Card>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
              gap: 3,
              mb: 3,
            }}
          >
            <DistributionCard
              title="Latest score distribution"
              description="Learners grouped by their latest submitted assessment score."
              rows={scoreDistribution}
              total={learners.length}
            />
            <DistributionCard
              title="Current support priorities"
              description="A quick view of learners who are on track, need monitoring, or need intervention."
              rows={supportDistribution}
              total={learners.length}
            />
          </Box>
          <Card>
            <DataTableToolbar
              query={recoveryTable.query}
              onQuery={recoveryTable.setQuery}
              placeholder="Search learner outcomes"
              count={recoveryTable.filteredCount}
            />
            <TableContainer>
              <Table sx={{ minWidth: 720 }}>
                <TableHead>
                  <TableRow>
                    <SortableTableCell
                      column="learner"
                      label="Learner"
                      orderBy={recoveryTable.orderBy}
                      direction={recoveryTable.direction}
                      onSort={recoveryTable.toggleSort}
                    />
                    <SortableTableCell
                      column="progress"
                      label="Plan Progress"
                      orderBy={recoveryTable.orderBy}
                      direction={recoveryTable.direction}
                      onSort={recoveryTable.toggleSort}
                    />
                    <SortableTableCell
                      column="gaps"
                      label="Active Gaps"
                      orderBy={recoveryTable.orderBy}
                      direction={recoveryTable.direction}
                      onSort={recoveryTable.toggleSort}
                    />
                    <SortableTableCell
                      column="score"
                      label="Latest Score"
                      orderBy={recoveryTable.orderBy}
                      direction={recoveryTable.direction}
                      onSort={recoveryTable.toggleSort}
                    />
                    <SortableTableCell
                      column="status"
                      label="Status"
                      orderBy={recoveryTable.orderBy}
                      direction={recoveryTable.direction}
                      onSort={recoveryTable.toggleSort}
                    />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recoveryTable.pageRows.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700}>
                          {item.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {item.section}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" alignItems="center" gap={1}>
                          <LinearProgress
                            variant="determinate"
                            value={item.progress}
                            sx={{ width: 100, height: 6 }}
                          />
                          <Typography variant="caption">
                            {item.progress}%
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>{item.gaps}</TableCell>
                      <TableCell>
                        {item.assessment === null
                          ? "—"
                          : `${Math.round(item.assessment)}%`}
                      </TableCell>
                      <TableCell>
                        <StatusChip label={item.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <DataTablePagination
              count={recoveryTable.filteredCount}
              page={recoveryTable.page}
              rowsPerPage={recoveryTable.rowsPerPage}
              onPage={recoveryTable.setPage}
              onRowsPerPage={recoveryTable.setRowsPerPage}
            />
          </Card>
        </>
      ) : section === "materials" ? (
        <>
          <Card sx={{ mb: 3, p: 2.5 }}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr 1fr", lg: "repeat(5, 1fr)" },
                gap: { xs: 2, lg: 0 },
              }}
            >
              {[
                ["Materials", materials?.summary.materials ?? 0],
                [
                  "Learner Assignments",
                  materials?.summary.assigned_learners ?? 0,
                ],
                ["Currently Reading", materials?.summary.in_progress ?? 0],
                ["Completed", materials?.summary.completed ?? 0],
                ["Quiz Passed", materials?.summary.quiz_passed ?? 0],
              ].map(([label, value], index) => (
                <Box
                  key={label}
                  sx={{
                    px: { lg: index === 0 ? 0 : 3 },
                    borderLeft: { lg: index > 0 ? "1px solid #e1e6eb" : 0 },
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    {label}
                  </Typography>
                  <Typography sx={{ fontSize: 24, fontWeight: 750 }}>
                    {value}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Card>
          <Card sx={{ mb: 3, p: 2.5 }}>
            <Typography variant="h2">Material engagement funnel</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Progress across learner–material assignments, from assignment to
              quiz completion.
            </Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "repeat(4, 1fr)" },
                gap: 2,
                mt: 2.5,
                alignItems: "end",
              }}
            >
              {materialFunnel.map((item) => {
                const percentage = learnerAssignments
                  ? Math.round((item.count / learnerAssignments) * 100)
                  : 0;
                return (
                  <Box key={item.label}>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        mb: 0.75,
                      }}
                    >
                      <Typography variant="body2" fontWeight={700}>
                        {item.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {item.count} · {percentage}%
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        height: 12,
                        bgcolor: "#edf1f3",
                        borderRadius: 6,
                        overflow: "hidden",
                      }}
                    >
                      <Box
                        sx={{
                          width: `${percentage}%`,
                          height: "100%",
                          bgcolor: item.color,
                          borderRadius: 6,
                        }}
                      />
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Card>
          <Card sx={{ mb: 3 }}>
            <Box sx={{ p: 2.5 }}>
              <Typography variant="h2">Material Performance</Typography>
              <Typography variant="body2" color="text.secondary">
                Completion and quiz outcomes by uploaded module or video.
              </Typography>
            </Box>
            <Divider />
            <Stack divider={<Divider />}>
              {materials?.materials.map((item) => (
                <Box
                  key={item.id}
                  sx={{
                    p: 2.5,
                    display: "grid",
                    gridTemplateColumns: {
                      xs: "1fr 1fr",
                      md: "minmax(260px, 1fr) repeat(5, minmax(80px, auto))",
                    },
                    gap: 2,
                  }}
                >
                  <Box>
                    <Typography variant="body2" fontWeight={700}>
                      {item.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.quiz_question_count} quiz questions ·{" "}
                      {item.assigned} assigned learners
                    </Typography>
                    <Box
                      sx={{
                        display: "flex",
                        height: 7,
                        mt: 1.25,
                        borderRadius: 4,
                        overflow: "hidden",
                        bgcolor: "#edf1f3",
                        maxWidth: 360,
                      }}
                    >
                      {item.assigned > 0 && (
                        <>
                          <Box
                            title={`${item.completed} completed`}
                            sx={{
                              width: `${(item.completed / item.assigned) * 100}%`,
                              bgcolor: "#2e7d5b",
                            }}
                          />
                          <Box
                            title={`${item.in_progress} in progress`}
                            sx={{
                              width: `${(item.in_progress / item.assigned) * 100}%`,
                              bgcolor: "#d08a24",
                            }}
                          />
                          <Box
                            title={`${item.not_started} not started`}
                            sx={{
                              width: `${(item.not_started / item.assigned) * 100}%`,
                              bgcolor: "#cfd6db",
                            }}
                          />
                        </>
                      )}
                    </Box>
                  </Box>
                  {[
                    ["Not Started", item.not_started],
                    ["Reading", item.in_progress],
                    ["Completed", item.completed],
                    ["Quiz Passed", item.quiz_passed],
                    [
                      "Average Score",
                      item.average_quiz_score === null
                        ? "—"
                        : `${item.average_quiz_score}%`,
                    ],
                  ].map(([label, value]) => (
                    <Box key={label}>
                      <Typography variant="caption" color="text.secondary">
                        {label}
                      </Typography>
                      <Typography variant="body2" fontWeight={700}>
                        {value}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              ))}
            </Stack>
            {!materials?.materials.length && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 3 }}>
                No learning materials have been assigned by this teacher.
              </Typography>
            )}
          </Card>
          <Card>
            <Box sx={{ p: 2.5 }}>
              <Typography variant="h2">Learner Material Activity</Typography>
              <Typography variant="body2" color="text.secondary">
                See who has not started, is currently reading, completed, or
                passed a quiz.
              </Typography>
            </Box>
            <Divider />
            <DataTableToolbar
              query={materialTable.query}
              onQuery={materialTable.setQuery}
              placeholder="Search learner or material"
              count={materialTable.filteredCount}
            />
            <TableContainer>
              <Table sx={{ minWidth: 900 }}>
                <TableHead>
                  <TableRow>
                    <SortableTableCell
                      column="learner"
                      label="Learner"
                      orderBy={materialTable.orderBy}
                      direction={materialTable.direction}
                      onSort={materialTable.toggleSort}
                    />
                    <SortableTableCell
                      column="materials"
                      label="Assigned Materials"
                      orderBy={materialTable.orderBy}
                      direction={materialTable.direction}
                      onSort={materialTable.toggleSort}
                    />
                    <SortableTableCell
                      column="progress"
                      label="Completion"
                      orderBy={materialTable.orderBy}
                      direction={materialTable.direction}
                      onSort={materialTable.toggleSort}
                    />
                    <SortableTableCell
                      column="score"
                      label="Learning Quizzes"
                      orderBy={materialTable.orderBy}
                      direction={materialTable.direction}
                      onSort={materialTable.toggleSort}
                    />
                    <SortableTableCell
                      column="activity"
                      label="Last Activity"
                      orderBy={materialTable.orderBy}
                      direction={materialTable.direction}
                      onSort={materialTable.toggleSort}
                    />
                    <TableCell width={48} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {materialTable.pageRows.map((group) => {
                    const expanded = expandedLearner === group.studentId;
                    const completion = group.rows.length
                      ? Math.round((group.completed / group.rows.length) * 100)
                      : 0;
                    return (
                      <Fragment key={group.studentId}>
                        <TableRow hover>
                          <TableCell>
                            <Typography variant="body2" fontWeight={700}>
                              {group.student}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {group.section}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight={700}>
                              {group.rows.length}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {group.rows.length === 1
                                ? group.rows[0].material
                                : `${group.rows[0].material} +${group.rows.length - 1} more`}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ minWidth: 170 }}>
                            <Stack direction="row" alignItems="center" gap={1}>
                              <LinearProgress
                                variant="determinate"
                                value={completion}
                                sx={{ width: 90, height: 7, borderRadius: 4 }}
                              />
                              <Typography variant="caption" fontWeight={700}>
                                {group.completed}/{group.rows.length}
                              </Typography>
                            </Stack>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight={700}>
                              {group.quizPassed} passed
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {group.quizAttempted} of {group.rows.length}{" "}
                              attempted
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">
                              {group.lastActivityAt
                                ? new Date(
                                    group.lastActivityAt,
                                  ).toLocaleDateString()
                                : "No activity"}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <IconButton
                              size="small"
                              aria-label={
                                expanded
                                  ? `Hide ${group.student}'s materials`
                                  : `Show ${group.student}'s materials`
                              }
                              onClick={() =>
                                setExpandedLearner(
                                  expanded ? null : group.studentId,
                                )
                              }
                            >
                              {expanded ? (
                                <KeyboardArrowDown />
                              ) : (
                                <KeyboardArrowRight />
                              )}
                            </IconButton>
                          </TableCell>
                        </TableRow>
                        <TableRow key={`${group.studentId}-details`}>
                          <TableCell
                            colSpan={6}
                            sx={{ py: 0, bgcolor: "#f8fafb" }}
                          >
                            <Collapse
                              in={expanded}
                              timeout="auto"
                              unmountOnExit
                            >
                              <Stack divider={<Divider />} sx={{ py: 1 }}>
                                {group.rows.map((item) => (
                                  <Box
                                    key={item.assignment_id}
                                    sx={{
                                      display: "grid",
                                      gridTemplateColumns: {
                                        xs: "1fr",
                                        md: "minmax(220px, 1fr) 130px 150px 130px",
                                      },
                                      gap: 2,
                                      px: 2,
                                      py: 1.5,
                                      alignItems: "center",
                                    }}
                                  >
                                    <Box>
                                      <Typography
                                        variant="body2"
                                        fontWeight={650}
                                      >
                                        {item.material}
                                      </Typography>
                                      <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        sx={{ textTransform: "capitalize" }}
                                      >
                                        {item.resource_type}
                                      </Typography>
                                    </Box>
                                    <StatusChip
                                      label={item.status.replace("_", " ")}
                                    />
                                    <Typography variant="body2">
                                      {item.resource_type === "video"
                                        ? `${item.progress_percent}% watched`
                                        : item.status === "in_progress"
                                          ? "Opened"
                                          : item.status === "completed"
                                            ? "Completed"
                                            : "Not opened"}
                                    </Typography>
                                    <Box>
                                      {item.latest_quiz_score === null ? (
                                        <Typography
                                          variant="body2"
                                          color="text.secondary"
                                        >
                                          Quiz not attempted
                                        </Typography>
                                      ) : (
                                        <>
                                          <Typography
                                            variant="body2"
                                            fontWeight={700}
                                          >
                                            {Math.round(item.latest_quiz_score)}
                                            %
                                          </Typography>
                                          <Typography
                                            variant="caption"
                                            color={
                                              item.quiz_passed
                                                ? "success.main"
                                                : "error.main"
                                            }
                                          >
                                            {item.quiz_passed
                                              ? "Passed"
                                              : `Needs retry · ${item.attempt_count} attempt${item.attempt_count === 1 ? "" : "s"}`}
                                          </Typography>
                                        </>
                                      )}
                                    </Box>
                                  </Box>
                                ))}
                              </Stack>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <DataTablePagination
              count={materialTable.filteredCount}
              page={materialTable.page}
              rowsPerPage={materialTable.rowsPerPage}
              onPage={materialTable.setPage}
              onRowsPerPage={materialTable.setRowsPerPage}
            />
          </Card>
        </>
      ) : null}
      {section === "companion" && (
        <CompanionAnalyticsPanel
          analytics={companion}
          signals={signals}
          subjectId={scope?.selectedSubjectId ?? null}
          onSignalReviewed={(id, nextStatus) =>
            setSignals((current) =>
              current.map((item) =>
                item.id === id ? { ...item, status: nextStatus } : item,
              ),
            )
          }
        />
      )}
    </>
  );
}

function DistributionCard({
  title,
  description,
  rows,
  total,
}: {
  title: string;
  description: string;
  rows: { label: string; detail: string; count: number; color: string }[];
  total: number;
}) {
  return (
    <Card sx={{ p: 2.5 }}>
      <Typography variant="h2">{title}</Typography>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mt: 0.5, mb: 2.5 }}
      >
        {description}
      </Typography>
      <Stack gap={2}>
        {rows.map((row) => {
          const percentage = total ? Math.round((row.count / total) * 100) : 0;
          return (
            <Box key={row.label}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 2,
                  mb: 0.75,
                }}
              >
                <Box>
                  <Typography variant="body2" fontWeight={700}>
                    {row.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {row.detail}
                  </Typography>
                </Box>
                <Typography variant="body2" fontWeight={750}>
                  {row.count}{" "}
                  <Box
                    component="span"
                    sx={{ color: "text.secondary", fontWeight: 500 }}
                  >
                    ({percentage}%)
                  </Box>
                </Typography>
              </Box>
              <Box
                sx={{
                  height: 8,
                  bgcolor: "#edf1f3",
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                <Box
                  sx={{
                    width: `${percentage}%`,
                    height: "100%",
                    bgcolor: row.color,
                    borderRadius: 4,
                  }}
                />
              </Box>
            </Box>
          );
        })}
      </Stack>
    </Card>
  );
}

function CompanionAnalyticsPanel({
  analytics,
  signals,
  subjectId,
  onSignalReviewed,
}: {
  analytics: CompanionAnalytics | null;
  signals: MisconceptionSignal[];
  subjectId: number | null;
  onSignalReviewed: (id: number, status: string) => void;
}) {
  const [categories, setCategories] = useState<
    {
      id: number;
      competency_code: string;
      title: string;
      description: string;
    }[]
  >([]);
  const [competencies, setCompetencies] = useState<
    { id: number; code: string; title: string }[]
  >([]);
  const [form, setForm] = useState({
    competency: "",
    code: "",
    title: "",
    description: "",
  });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!subjectId) return;
    Promise.all([
      api<typeof categories>(`/tutor/misconceptions/?subject=${subjectId}`),
      api<
        | { results?: { id: number; code: string; title: string }[] }
        | { id: number; code: string; title: string }[]
      >(`/competencies/?subject=${subjectId}`),
    ]).then(([categoryRows, competencyRows]) => {
      setCategories(categoryRows);
      setCompetencies(
        Array.isArray(competencyRows)
          ? competencyRows
          : (competencyRows.results ?? []),
      );
    });
  }, [subjectId]);
  const review = async (id: number, status: string) => {
    setBusy(true);
    try {
      await api("/tutor/misconception-signals/", {
        method: "PATCH",
        body: JSON.stringify({ id, status }),
      });
      onSignalReviewed(id, status);
    } finally {
      setBusy(false);
    }
  };
  const createCategory = async () => {
    if (!subjectId) return;
    setBusy(true);
    try {
      await api("/tutor/misconceptions/", {
        method: "POST",
        body: JSON.stringify({
          subject: subjectId,
          competency: Number(form.competency),
          code: form.code,
          title: form.title,
          description: form.description,
        }),
      });
      setCategories(
        await api<typeof categories>(
          `/tutor/misconceptions/?subject=${subjectId}`,
        ),
      );
      setForm({ competency: "", code: "", title: "", description: "" });
    } finally {
      setBusy(false);
    }
  };
  const feedbackTotal =
    (analytics?.summary.helpful ?? 0) + (analytics?.summary.not_helpful ?? 0);
  return (
    <Stack gap={3}>
      <Card sx={{ p: 2.5 }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr 1fr", lg: "repeat(6,1fr)" },
            gap: 2,
          }}
        >
          {[
            ["Learners", analytics?.summary.learners ?? 0],
            ["Sessions", analytics?.summary.sessions ?? 0],
            ["Completed", analytics?.summary.completed_sessions ?? 0],
            [
              "Helpful",
              feedbackTotal
                ? `${Math.round((analytics!.summary.helpful / feedbackTotal) * 100)}%`
                : "—",
            ],
            ["Open handoffs", analytics?.summary.open_handoffs ?? 0],
            [
              "Active difficulties",
              analytics?.summary.active_misconceptions ?? 0,
            ],
          ].map(([label, value], index) => (
            <Box
              key={label}
              sx={{
                px: { lg: index === 0 ? 0 : 3 },
                borderLeft: { lg: index > 0 ? "1px solid #e1e6eb" : 0 },
              }}
            >
              <Typography variant="caption" color="text.secondary">
                {label}
              </Typography>
              <Typography sx={{ fontSize: 24, fontWeight: 750 }}>
                {value}
              </Typography>
            </Box>
          ))}
        </Box>
      </Card>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
          gap: 3,
        }}
      >
        <Card sx={{ p: 2.5 }}>
          <Typography variant="h2">
            Most common learning difficulties
          </Typography>
          <Stack gap={1.5} sx={{ mt: 2 }}>
            {analytics?.top_misconceptions.length ? (
              analytics.top_misconceptions.map((item) => (
                <Box
                  key={`${item.competency}-${item.title}`}
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 2,
                  }}
                >
                  <Box>
                    <Typography variant="body2" fontWeight={700}>
                      {item.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.competency}
                    </Typography>
                  </Box>
                  <Typography fontWeight={750}>{item.count}</Typography>
                </Box>
              ))
            ) : (
              <Typography variant="body2" color="text.secondary">
                No learning-difficulty signals yet.
              </Typography>
            )}
          </Stack>
        </Card>
        <Card sx={{ p: 2.5 }}>
          <Typography variant="h2">Companion modes used</Typography>
          <Stack gap={1.5} sx={{ mt: 2 }}>
            {analytics?.modes.length ? (
              analytics.modes.map((item) => (
                <Box
                  key={item.action}
                  sx={{ display: "flex", justifyContent: "space-between" }}
                >
                  <Typography
                    variant="body2"
                    sx={{ textTransform: "capitalize" }}
                  >
                    {item.action}
                  </Typography>
                  <Typography fontWeight={750}>{item.count}</Typography>
                </Box>
              ))
            ) : (
              <Typography variant="body2" color="text.secondary">
                No companion sessions recorded yet.
              </Typography>
            )}
          </Stack>
        </Card>
      </Box>
      <Card>
        <Box sx={{ p: 2.5 }}>
          <Typography variant="h2">Signals requiring teacher review</Typography>
          <Typography variant="body2" color="text.secondary">
            Confirm genuine patterns or dismiss inaccurate signals.
          </Typography>
        </Box>
        <Divider />
        <Stack divider={<Divider />}>
          {signals
            .filter((item) => item.status === "detected")
            .map((item) => (
              <Box
                key={item.id}
                sx={{
                  p: 2,
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "minmax(0,1fr) auto" },
                  gap: 2,
                }}
              >
                <Box>
                  <Typography variant="body2" fontWeight={700}>
                    {item.student_name} · {item.misconception}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {item.competency} · {item.occurrence_count} observation
                    {item.occurrence_count === 1 ? "" : "s"} · {item.confidence}
                    % confidence
                  </Typography>
                </Box>
                <Stack direction="row" gap={1}>
                  <Button
                    size="small"
                    disabled={busy}
                    onClick={() => void review(item.id, "dismissed")}
                  >
                    Dismiss
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    disabled={busy}
                    onClick={() => void review(item.id, "confirmed")}
                  >
                    Confirm
                  </Button>
                </Stack>
              </Box>
            ))}
        </Stack>
        {!signals.some((item) => item.status === "detected") && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 3 }}>
            No new signals are waiting for review.
          </Typography>
        )}
      </Card>
      <Card sx={{ p: 2.5 }}>
        <Typography variant="h2">Misconception taxonomy</Typography>
        <Typography variant="body2" color="text.secondary">
          Maintain competency-specific categories. Untagged questions use a
          clearly identified general category.
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1fr 160px 1fr" },
            gap: 1.5,
            mt: 2,
          }}
        >
          <TextField
            select
            size="small"
            label="Competency"
            value={form.competency}
            onChange={(event) =>
              setForm((value) => ({ ...value, competency: event.target.value }))
            }
          >
            {competencies.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.code} · {item.title}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="Code"
            value={form.code}
            onChange={(event) =>
              setForm((value) => ({ ...value, code: event.target.value }))
            }
          />
          <TextField
            size="small"
            label="Category title"
            value={form.title}
            onChange={(event) =>
              setForm((value) => ({ ...value, title: event.target.value }))
            }
          />
        </Box>
        <TextField
          fullWidth
          size="small"
          label="Description"
          value={form.description}
          onChange={(event) =>
            setForm((value) => ({ ...value, description: event.target.value }))
          }
          sx={{ mt: 1.5 }}
        />
        <Button
          variant="outlined"
          sx={{ mt: 1.5 }}
          disabled={
            busy || !form.competency || !form.code.trim() || !form.title.trim()
          }
          onClick={() => void createCategory()}
        >
          Add category
        </Button>
        <Stack divider={<Divider />} sx={{ mt: 2 }}>
          {categories.map((item) => (
            <Box key={item.id} sx={{ py: 1.25 }}>
              <Typography variant="body2" fontWeight={700}>
                {item.title}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {item.competency_code} · {item.description || "No description"}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}
