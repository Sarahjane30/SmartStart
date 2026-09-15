"""Layer 1 — Synthetic data engine.

Generates labeled, reproducible, fully synthetic multimodal cohorts
(clinical covariates + EEG channels + MRI-derived feature vectors)
for SmartStart research workflows. No real patient data is used or
required.
"""

from smartstart.layer1.config import GenerationConfig
from smartstart.layer1.engine import SyntheticDataEngine
from smartstart.layer1.schemas import CohortBundle, SubjectRecord

__all__ = [
    "CohortBundle",
    "GenerationConfig",
    "SubjectRecord",
    "SyntheticDataEngine",
]
