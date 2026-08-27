from django.test import SimpleTestCase
from .models import CompetencyResult
from .services import classify_mastery

class MasteryClassificationTests(SimpleTestCase):
    def test_mastered_at_configured_threshold(self):
        self.assertEqual(classify_mastery(75, 75), CompetencyResult.Status.MASTERED)

    def test_developing_between_thresholds(self):
        self.assertEqual(classify_mastery(60, 75), CompetencyResult.Status.DEVELOPING)

    def test_remediation_below_developing_threshold(self):
        self.assertEqual(classify_mastery(49, 75), CompetencyResult.Status.REMEDIATION)

    def test_custom_mastery_threshold_is_respected(self):
        self.assertEqual(classify_mastery(80, 85), CompetencyResult.Status.DEVELOPING)
