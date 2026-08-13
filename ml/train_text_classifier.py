"""
Starter training script (scikit-learn)

This is a simple baseline: TF-IDF char/word features + LogisticRegression.
Install dependencies from `ml/requirements.txt` before running.
"""
import os
import sys

def main():
    try:
        import pandas as pd
        from sklearn.model_selection import train_test_split
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.linear_model import LogisticRegression
        from sklearn.metrics import classification_report
    except Exception as e:
        print('Missing training dependencies. Run: pip install -r ml/requirements.txt')
        print('Error:', e)
        sys.exit(1)

    path = 'ml/data/synthetic_pii.csv'
    if not os.path.exists(path):
        print('Dataset not found. Generate it first: python -m ml.data_generator')
        sys.exit(1)

    df = pd.read_csv(path)
    X = df['text'].fillna('')
    y = df['label']

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    vec = TfidfVectorizer(ngram_range=(1,3), analyzer='char_wb', max_features=2000)
    Xtr = vec.fit_transform(X_train)
    Xte = vec.transform(X_test)

    clf = LogisticRegression(max_iter=1000)
    clf.fit(Xtr, y_train)

    preds = clf.predict(Xte)
    print(classification_report(y_test, preds))

    # Save model and vectorizer for later conversion to TFJS/ONNX
    try:
        import joblib
        os.makedirs('ml/models', exist_ok=True)
        joblib.dump(clf, 'ml/models/text_clf.joblib')
        joblib.dump(vec, 'ml/models/vectorizer.joblib')
        print('Saved model to ml/models/')
    except Exception:
        print('joblib not available; skipping model save')

if __name__ == '__main__':
    main()
