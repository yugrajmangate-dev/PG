#!/usr/bin/env python3
"""Train a simple baseline PII detector (TF-IDF + One-vs-Rest LogisticRegression).

Reads `ml/data/synthetic_pii.jsonl` and outputs models into `ml/models/`.
"""
import os
import json
import argparse


def main(dataset_path='ml/data/synthetic_pii.jsonl', out_dir='ml/models'):
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.preprocessing import MultiLabelBinarizer
        from sklearn.model_selection import train_test_split
        from sklearn.multiclass import OneVsRestClassifier
        from sklearn.linear_model import LogisticRegression
        from sklearn.metrics import classification_report
        import joblib
    except Exception as e:
        print('Missing dependency:', e)
        print('Please install requirements: pip install -r ml/requirements.txt')
        raise

    texts = []
    labels = []
    with open(dataset_path, 'r', encoding='utf-8') as fh:
        for line in fh:
            obj = json.loads(line)
            texts.append(obj.get('text', ''))
            labels.append(obj.get('labels', []))

    if not texts:
        raise SystemExit('No data found at ' + dataset_path)

    mlb = MultiLabelBinarizer()
    Y = mlb.fit_transform(labels)

    X_train_texts, X_test_texts, y_train, y_test = train_test_split(
        texts, Y, test_size=0.2, random_state=42
    )

    vec = TfidfVectorizer(max_features=10000, ngram_range=(1,2))
    X_train = vec.fit_transform(X_train_texts)
    X_test = vec.transform(X_test_texts)

    clf = OneVsRestClassifier(LogisticRegression(max_iter=1000))
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)

    print('\nClassification report (per label):')
    print(classification_report(y_test, y_pred, target_names=mlb.classes_, zero_division=0))

    os.makedirs(out_dir, exist_ok=True)
    vec_path = os.path.join(out_dir, 'tfidf_vectorizer.joblib')
    model_path = os.path.join(out_dir, 'pii_classifier.joblib')
    classes_path = os.path.join(out_dir, 'classes.json')

    joblib.dump(vec, vec_path)
    joblib.dump(clf, model_path)
    with open(classes_path, 'w', encoding='utf-8') as fh:
        json.dump(list(mlb.classes_), fh)

    print('\nSaved vectorizer ->', vec_path)
    print('Saved classifier ->', model_path)
    print('Saved classes ->', classes_path)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', default='ml/data/synthetic_pii.jsonl')
    parser.add_argument('--out', default='ml/models')
    args = parser.parse_args()
    main(args.data, args.out)
