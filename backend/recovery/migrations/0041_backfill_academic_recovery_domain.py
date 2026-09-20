from django.db import migrations
from django.utils import timezone


def backfill_domain(apps, schema_editor):
    Cluster = apps.get_model("recovery", "Cluster")
    GradeLevel = apps.get_model("recovery", "GradeLevel")
    AcademicClass = apps.get_model("recovery", "AcademicClass")
    StudentProfile = apps.get_model("recovery", "StudentProfile")
    Subject = apps.get_model("recovery", "Subject")
    Topic = apps.get_model("recovery", "Topic")
    Competency = apps.get_model("recovery", "Competency")
    UserProfile = apps.get_model("recovery", "UserProfile")
    SubjectOffering = apps.get_model("recovery", "SubjectOffering")
    SubjectEnrollment = apps.get_model("recovery", "SubjectEnrollment")
    Assessment = apps.get_model("recovery", "Assessment")
    LearningAssignment = apps.get_model("recovery", "LearningAssignment")
    CompetencyResult = apps.get_model("recovery", "CompetencyResult")
    LearningGap = apps.get_model("recovery", "LearningGap")
    RecoveryPlan = apps.get_model("recovery", "RecoveryPlan")
    LearnerCompetencyState = apps.get_model("recovery", "LearnerCompetencyState")

    academic, _ = Cluster.objects.get_or_create(code="ACADEMIC", defaults={"name": "Academic"})
    tech_voc, _ = Cluster.objects.get_or_create(code="TECH-VOC", defaults={"name": "Technical-Vocational (Tech-Voc)"})
    clusters = {"academics": academic, "tech_pro": tech_voc}
    grades = {}
    for level in (11, 12):
        grades[level], _ = GradeLevel.objects.get_or_create(level=level, defaults={"name": f"Grade {level}"})

    for student_profile in StudentProfile.objects.all():
        student_profile.cluster_record = clusters.get(student_profile.cluster, academic)
        student_profile.save(update_fields=["cluster_record"])

    for section in AcademicClass.objects.all():
        section.grade_level_record = grades.get(section.grade_level)
        section.save(update_fields=["grade_level_record"])

    for subject in Subject.objects.all():
        subject.clusters.add(academic, tech_voc)
        topic, _ = Topic.objects.get_or_create(
            subject=subject,
            code=f"{subject.code}-CORE",
            defaults={"title": "Core competencies", "description": "Existing competencies migrated into an ordered curriculum.", "sequence_order": 1},
        )
        for position, competency in enumerate(Competency.objects.filter(subject=subject).order_by("id"), start=1):
            competency.topic = topic
            competency.sequence_order = position
            competency.save(update_fields=["topic", "sequence_order"])

    offering_map = {}
    for subject in Subject.objects.all():
        for section in AcademicClass.objects.filter(grade_level=subject.grade_level):
            teacher_profile = (
                UserProfile.objects.filter(role="teacher", assigned_subjects=subject, assigned_classes=section)
                .select_related("user")
                .order_by("user_id")
                .first()
            )
            enrollment_code = f"{subject.code[:8]}-{(section.class_code or format(section.id, '08X'))[:8]}"[:20]
            suffix = 1
            candidate_code = enrollment_code
            while SubjectOffering.objects.filter(enrollment_code=candidate_code).exists():
                suffix += 1
                candidate_code = f"{enrollment_code[:16]}-{suffix}"[:20]
            offering, _ = SubjectOffering.objects.get_or_create(
                subject=subject,
                academic_class=section,
                school_year=section.school_year,
                term="Full year",
                defaults={
                    "teacher_id": teacher_profile.user_id if teacher_profile else None,
                    "enrollment_code": candidate_code,
                },
            )
            offering_map[(subject.id, section.id)] = offering

            for profile in UserProfile.objects.filter(role="student", academic_class=section).select_related("user"):
                SubjectEnrollment.objects.get_or_create(
                    student=profile.user,
                    offering=offering,
                    status="approved",
                    defaults={
                        "source": "migration",
                        "requested_by": profile.user,
                        "reviewed_by_id": teacher_profile.user_id if teacher_profile else None,
                        "reviewed_at": timezone.now(),
                        "decision_reason": "Migrated from the learner's existing class assignment.",
                    },
                )

    for assessment in Assessment.objects.all():
        for section in assessment.assigned_classes.all():
            offering = offering_map.get((assessment.subject_id, section.id))
            if offering:
                assessment.subject_offerings.add(offering)

    for assignment in LearningAssignment.objects.prefetch_related("assigned_classes", "resource__competencies").all():
        subject_ids = set(assignment.resource.competencies.values_list("subject_id", flat=True))
        for section in assignment.assigned_classes.all():
            for subject_id in subject_ids:
                offering = offering_map.get((subject_id, section.id))
                if offering:
                    assignment.subject_offerings.add(offering)

    for enrollment in SubjectEnrollment.objects.filter(status="approved").select_related("offering"):
        prior_mastered = True
        for competency in Competency.objects.filter(subject_id=enrollment.offering.subject_id, is_active=True).order_by("topic__sequence_order", "sequence_order", "id"):
            latest = (
                CompetencyResult.objects.filter(attempt__student_id=enrollment.student_id, competency=competency, attempt__submitted_at__isnull=False)
                .order_by("-attempt__submitted_at", "-id")
                .first()
            )
            state_status = "available" if prior_mastered else "locked"
            latest_score = None
            best_score = None
            if latest:
                latest_score = latest.score
                best_score = (
                    CompetencyResult.objects.filter(attempt__student_id=enrollment.student_id, competency=competency)
                    .order_by("-score")
                    .values_list("score", flat=True)
                    .first()
                )
                state_status = "mastered" if latest.status == "mastered" else "in_progress"
                if latest.status != "mastered":
                    priority = "high" if latest.status == "remediation" else "medium"
                    gap, _ = LearningGap.objects.update_or_create(
                        student_id=enrollment.student_id,
                        competency=competency,
                        status="open",
                        defaults={
                            "offering": enrollment.offering,
                            "trigger_result": latest,
                            "current_score": latest.score,
                            "classification": latest.status,
                            "priority": priority,
                        },
                    )
                    RecoveryPlan.objects.filter(student_id=enrollment.student_id, competency=competency, status="active").update(
                        offering=enrollment.offering, learning_gap=gap
                    )
            LearnerCompetencyState.objects.update_or_create(
                student_id=enrollment.student_id,
                offering=enrollment.offering,
                competency=competency,
                defaults={
                    "status": state_status,
                    "latest_score": latest_score,
                    "best_score": best_score,
                    "decision_reason": "Migrated from existing assessment evidence." if latest else ("First required competency." if prior_mastered else "Previous competency mastery is required."),
                    "unlocked_at": timezone.now() if state_status != "locked" else None,
                    "mastered_at": latest.attempt.submitted_at if latest and latest.status == "mastered" else None,
                },
            )
            prior_mastered = prior_mastered and bool(latest and latest.status == "mastered")


class Migration(migrations.Migration):
    dependencies = [("recovery", "0040_academic_recovery_domain")]
    operations = [migrations.RunPython(backfill_domain, migrations.RunPython.noop)]
