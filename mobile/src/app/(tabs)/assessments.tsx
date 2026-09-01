import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api } from "@/lib/api";
import type { Assessment, PrerequisiteStatus } from "@/lib/types";
import { colors, radius, spacing } from "@/constants/tokens";
import { useStudentScope } from "@/lib/student-scope";

const prerequisiteDetail = (item: PrerequisiteStatus) => {
  if (item.completed) return "Complete";
  const viewing =
    item.resource_type === "video"
      ? `${item.watched_percent}% watched`
      : item.opened
        ? "Viewed"
        : "Not opened";
  if (!item.quiz_required) return `${viewing} · Mark complete after reviewing`;
  const quiz =
    item.quiz_score === null
      ? `Quiz not taken · pass ${item.passing_score}%`
      : item.quiz_passed
        ? `Quiz ${Math.round(item.quiz_score)}% · passed`
        : `Quiz ${Math.round(item.quiz_score)}% · pass ${item.passing_score}% required`;
  return `${viewing} · ${quiz}`;
};

export default function AssessmentsScreen() {
  const router = useRouter();
  const scope = useStudentScope();
  const [items, setItems] = useState<Assessment[] | null>(null);
  const [error, setError] = useState("");
  const [expandedRequirements, setExpandedRequirements] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!scope.selectedSubjectId) return;
      setItems(null);
      api<Assessment[] | { results?: Assessment[] }>(
        `/assessments/?subject=${scope.selectedSubjectId}`,
      )
        .then((result) =>
          setItems(Array.isArray(result) ? result : (result.results ?? [])),
        )
        .catch((reason) => setError(reason.message));
    }, [scope.selectedSubjectId]),
  );
  if (!scope.loading && !scope.selectedSubjectId)
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>
          No subject with assigned assessments is available yet.
        </Text>
      </View>
    );
  if (!items && !error)
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.list}>
        {items?.map((item) => (
          <Pressable
            key={item.id}
            disabled={!item.available && item.remaining_prerequisites === 0}
            onPress={() => item.available
              ? router.push({ pathname: "/assessment/[id]", params: { id: String(item.id) } })
              : router.push("/(tabs)/materials")}
            style={({ pressed }) => [
              styles.row,
              pressed && styles.pressed,
              !item.available && styles.disabled,
            ]}
          >
            <View style={styles.rowText}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.meta}>
                {item.kind === "pre"
                  ? "Diagnostic assessment"
                  : item.kind === "remedial"
                    ? "Remedial exam"
                    : "Mastery assessment"}{" "}
                · {item.question_count} questions
                {item.due_at
                  ? ` · Due ${new Date(item.due_at).toLocaleDateString()}`
                  : ""}
              </Text>
              {!item.available && item.availability_reason ? (
                <Text style={styles.reason}>{item.availability_reason}</Text>
              ) : null}
              {item.kind === "pre" && item.prerequisite_statuses.length > 0 ? <>
                <Pressable onPress={(event) => { event.stopPropagation(); setExpandedRequirements(current => current === item.id ? null : item.id); }}>
                  <Text style={styles.requirementsLink}>{expandedRequirements === item.id ? "Hide requirements" : `View requirements (${item.prerequisite_statuses.length})`}</Text>
                </Pressable>
                {expandedRequirements === item.id ? <View style={styles.checklist}>
                    <Text style={styles.checklistTitle}>Required materials and quizzes</Text>
                    {item.prerequisite_statuses.map((requirement) => (
                      <View key={requirement.assignment_id} style={styles.checklistRow}>
                        <View style={[styles.checklistDot, requirement.completed ? styles.completeDot : requirement.quiz_score !== null ? styles.retryDot : null]} />
                        <View style={styles.checklistText}>
                          <Text style={styles.requirementTitle}>{requirement.title}</Text>
                          <Text style={[styles.requirementDetail, requirement.completed && styles.completeText]}>{prerequisiteDetail(requirement)}</Text>
                        </View>
                      </View>
                    ))}
                  </View> : null}
              </> : null}
            </View>
            <View
              style={[
                styles.status,
                item.available ? styles.available : styles.locked,
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  item.available ? styles.availableText : styles.lockedText,
                ]}
              >
                {item.available ? "Start" : item.remaining_prerequisites > 0 ? "Materials" : "Locked"}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
      {!items?.length && (
        <Text style={styles.empty}>No assessments are currently assigned.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  list: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.panel,
    overflow: "hidden",
  },
  row: {
    minHeight: 78,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  rowText: { flex: 1 },
  title: { color: colors.text, fontWeight: "700" },
  meta: {
    color: colors.secondaryText,
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing.xs,
  },
  reason: {
    color: colors.secondaryText,
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing.sm,
  },
  checklist: { marginTop: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.control, padding: spacing.md, gap: spacing.sm, backgroundColor: colors.background },
  requirementsLink: { color: colors.primary, fontSize: 12, fontWeight: "700", marginTop: spacing.sm },
  checklistTitle: { color: colors.text, fontSize: 12, fontWeight: "800" },
  checklistRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  checklistDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, backgroundColor: colors.border },
  completeDot: { backgroundColor: colors.success },
  retryDot: { backgroundColor: colors.warning },
  checklistText: { flex: 1 },
  requirementTitle: { color: colors.text, fontSize: 12, fontWeight: "700" },
  requirementDetail: { color: colors.secondaryText, fontSize: 11, lineHeight: 16, marginTop: 2 },
  completeText: { color: colors.success },
  status: {
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  statusText: { fontSize: 12, fontWeight: "700" },
  available: { backgroundColor: colors.primarySoft },
  availableText: { color: colors.primary },
  locked: { backgroundColor: "#eef0f2" },
  lockedText: { color: colors.secondaryText },
  disabled: { opacity: 0.72 },
  pressed: { backgroundColor: colors.primarySoft },
  empty: {
    color: colors.secondaryText,
    textAlign: "center",
    marginTop: spacing.xl,
  },
  error: { color: colors.error, marginBottom: spacing.lg },
});
