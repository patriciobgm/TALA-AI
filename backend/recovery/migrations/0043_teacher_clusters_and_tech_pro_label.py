import django.db.models.deletion
from django.db import migrations, models


def normalize_clusters(apps, schema_editor):
    Cluster = apps.get_model("recovery", "Cluster")
    EmployeeProfile = apps.get_model("recovery", "EmployeeProfile")
    AcademicClass = apps.get_model("recovery", "AcademicClass")
    StudentProfile = apps.get_model("recovery", "StudentProfile")
    Subject = apps.get_model("recovery", "Subject")
    legacy_tech = Cluster.objects.filter(code="TECH-VOC").first()
    tech_pro = Cluster.objects.filter(code="TECH-PRO").first()
    if legacy_tech and tech_pro:
        StudentProfile.objects.filter(cluster_record=legacy_tech).update(cluster_record=tech_pro)
        AcademicClass.objects.filter(cluster=legacy_tech).update(cluster=tech_pro)
        for subject in Subject.objects.filter(clusters=legacy_tech):
            subject.clusters.add(tech_pro)
            subject.clusters.remove(legacy_tech)
        legacy_tech.delete()
    elif legacy_tech:
        legacy_tech.code = "TECH-PRO"
        legacy_tech.name = "Technical Professional (Tech Pro)"
        legacy_tech.save(update_fields=["code", "name"])
        tech_pro = legacy_tech
    if tech_pro:
        tech_pro.name = "Technical Professional (Tech Pro)"
        tech_pro.save(update_fields=["name"])
    academic = Cluster.objects.filter(code="ACADEMIC").first()
    for employee in EmployeeProfile.objects.filter(profile__role="teacher", cluster__isnull=True).select_related("profile"):
        cluster = Cluster.objects.filter(subjects__assigned_teachers=employee.profile).distinct().order_by("id").first() or academic
        if cluster:
            employee.cluster = cluster
            employee.save(update_fields=["cluster"])


class Migration(migrations.Migration):
    dependencies = [("recovery", "0042_normalize_cluster_labels")]

    operations = [
        migrations.AddField(
            model_name="employeeprofile",
            name="cluster",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="employees", to="recovery.cluster"),
        ),
        migrations.AlterField(
            model_name="studentprofile",
            name="cluster",
            field=models.CharField(choices=[("academics", "Academic"), ("tech_pro", "Technical Professional (Tech Pro)")], default="academics", max_length=16),
        ),
        migrations.RunPython(normalize_clusters, migrations.RunPython.noop),
    ]
