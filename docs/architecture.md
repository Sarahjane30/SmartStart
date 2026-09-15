# SmartStart architecture

## Product intent

SmartStart explores multimodal (clinical + EEG + MRI) signals for **research** on neonatal HIE outcome modeling. Real neonatal datasets are scarce and sensitive, so Layer 1 provides a synthetic foundation that later layers can consume without PHI.

## Layer contracts

### Layer 1 — Synthetic data engine (current)

**Owns:** generation of labeled synthetic cohorts.

**Inputs:** `GenerationConfig` (size, seed, EEG geometry, MRI feature names, noise).

**Outputs:** `CohortBundle` plus on-disk artifacts (`cohort.json`, `cohort.jsonl`, `manifest.json`, `arrays.npz`).

**Invariants:**

1. Every subject has `synthetic=true` and an `SYN-` subject id.
2. Fixed seed ⇒ bit-stable cohort contents for a given config version.
3. Modalities are coupled through a shared latent risk so supervised baselines are learnable.
4. No network calls; no real patient data I/O.

### Layer 2 — Feature store / dataset registry (planned)

Register Layer 1 (and later real de-identified) datasets, version schemas, and materialize train/val/test splits.

### Layer 3 — Model training & evaluation (planned)

Train multimodal baselines on registered datasets; emit metrics and model cards.

### Layer 4 — Research inference prototypes (planned)

Offline scoring UIs / APIs clearly labeled as research prototypes — not clinical decision support.

## Extension points

- Swap `generators.py` waveform models without changing export schemas.
- Add modalities by extending `SubjectRecord` and bumping `generator_version`.
- Keep clinical claims out of code paths; provenance flags travel with every record.
