#!/usr/bin/env python3
"""Synthetic PII dataset generator

Creates `ml/data/synthetic_pii.jsonl` with examples containing zero, one, or multiple
PII types for training/evaluation of PII detectors.
"""
import os
import random
import string
import json
import uuid


DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)


def rand_alphanum(n):
    return ''.join(random.choices(string.ascii_letters + string.digits, k=n))


def generate_email():
    local = ''.join(random.choices(string.ascii_lowercase + string.digits, k=random.randint(5,12)))
    domain = random.choice(['gmail.com', 'yahoo.com', 'example.org', 'company.com', 'hotmail.com'])
    return f"{local}@{domain}"


def generate_phone():
    return ''.join(random.choices(string.digits, k=10))


def generate_credit_card():
    digits = ''.join(random.choices(string.digits, k=16))
    return ' '.join([digits[i:i+4] for i in range(0,16,4)])


def generate_aadhaar():
    first = str(random.randint(2,9))
    rest = ''.join(random.choices(string.digits, k=11))
    return first + rest


def generate_pan():
    letters = ''.join(random.choices(string.ascii_uppercase, k=5))
    digits = ''.join(random.choices(string.digits, k=4))
    last = random.choice(string.ascii_uppercase)
    return letters + digits + last


def generate_aws_key():
    return 'AKIA' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=16))


def generate_api_key():
    return ''.join(random.choices(string.ascii_letters + string.digits, k=32))


def generate_private_key():
    lines = ['-----BEGIN PRIVATE KEY-----']
    for _ in range(6):
        lines.append(''.join(random.choices(string.ascii_letters + string.digits + '+/', k=64)))
    lines.append('-----END PRIVATE KEY-----')
    return '\n'.join(lines)


def generate_data_url():
    return 'data:image/png;base64,' + ''.join(random.choices(string.ascii_letters + string.digits + '+/', k=128))


def generate_name():
    first = random.choice(['Amit', 'Riya', 'John', 'Alice', 'Yugraj', 'Sara', 'Mohit', 'Priya'])
    last = random.choice(['Kumar', 'Sharma', 'Singh', 'Patel', 'Gupta', 'Verma', 'Smith', 'Doe'])
    return f"{first} {last}"


def normal_sentence():
    phrases = [
        "Let's meet tomorrow.",
        "Can you review the document?",
        "Here is the report summary.",
        "The server will be restarted tonight.",
        "Please find the attached file.",
        "I love working on ML projects.",
        "Reminder: submit your timesheet.",
        "See you at the meeting."
    ]
    return random.choice(phrases)


TYPES = {
    'email': generate_email,
    'phone': generate_phone,
    'credit_card': generate_credit_card,
    'aadhaar': generate_aadhaar,
    'pan': generate_pan,
    'aws_key': generate_aws_key,
    'api_key': generate_api_key,
    'private_key': generate_private_key,
    'data_url': generate_data_url,
    'name': generate_name
}


def make_example(piitypes):
    pieces = []
    labels = []

    # Basic context
    pieces.append(random.choice(['Hi,', 'Hello,', 'FYI,', 'Note:']))

    for t in piitypes:
        gen = TYPES.get(t)
        if not gen:
            continue
        val = gen()
        labels.append(t)

        if t == 'private_key':
            # Put private key on its own lines
            pieces.append('\n' + val + '\n')
        elif t == 'data_url':
            pieces.append(f'I attached an image: {val}')
        elif t == 'name':
            pieces.append(f'my name is {val}.')
        else:
            pieces.append(f'my {t.replace("_"," ")} is {val}.')

    # Add some normal text
    pieces.append(normal_sentence())

    text = ' '.join(pieces)
    return text.strip(), sorted(list(set(labels)))


def generate_dataset(n=500, out_jsonl=None):
    if out_jsonl is None:
        out_jsonl = os.path.join(DATA_DIR, 'synthetic_pii.jsonl')

    counts = {}
    with open(out_jsonl, 'w', encoding='utf-8') as fh:
        for i in range(n):
            r = random.random()
            if r < 0.15:
                # none
                text = normal_sentence()
                labels = []
            elif r < 0.8:
                # single
                t = random.choice(list(TYPES.keys()))
                text, labels = make_example([t])
            else:
                # combo of 2-3
                k = random.choice([2,3])
                ts = random.sample(list(TYPES.keys()), k)
                text, labels = make_example(ts)

            rec = {
                'id': str(uuid.uuid4()),
                'text': text,
                'labels': labels
            }
            fh.write(json.dumps(rec, ensure_ascii=False) + '\n')

            for l in labels:
                counts[l] = counts.get(l, 0) + 1

    return out_jsonl, counts


if __name__ == '__main__':
    print('Generating synthetic PII dataset...')
    path, counts = generate_dataset(500)
    print('Saved:', path)
    print('Label counts (approx):')
    for k, v in sorted(counts.items(), key=lambda x: -x[1]):
        print(f'  {k}: {v}')
