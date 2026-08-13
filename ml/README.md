# ML: Synthetic PII dataset generator

This folder contains a lightweight synthetic PII generator used to create training and evaluation data for PII detection models.

Files
- `generate_synthetic_pii.py` — pure-Python generator (no external dependencies). Writes `ml/data/synthetic_pii.jsonl` by default.

Usage

From the workspace root run:

```bash
python ml/generate_synthetic_pii.py
```

Output
- `ml/data/synthetic_pii.jsonl` — one JSON object per line: `{ "id": ..., "text": ..., "labels": [ ... ] }`.

Next steps
- Use this dataset to train a PII classifier or NER tagger. I can scaffold a Jupyter notebook to train a simple TF/transformers or sklearn baseline if you want.
# ML: Synthetic PII dataset & training

This folder contains tools to generate a synthetic dataset of PII-containing text and a starter training script.

Files:
- `data_generator.py` — pure-Python generator that writes `ml/data/synthetic_pii.csv`.
- `requirements.txt` — recommended packages for training and notebooks.

Quick start (generate data):

```bash
python -m ml.data_generator
```

Next steps:
- Use `scikit-learn` or a small transformer to train a multi-label PII detector.
- Convert to TFJS or ONNX for in-browser inference and integrate into the extension.
