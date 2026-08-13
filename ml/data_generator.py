"""
Synthetic PII dataset generator

Produces a CSV with columns: id, text, label

This module has no external dependencies and is safe to run in plain Python.
"""
import os
import random
import csv
import string
from typing import List

DOMAINS = ["example.com", "mail.com", "test.org", "demo.io", "company.co"]
FIRST_NAMES = ["Amit","Sara","John","Priya","Wei","Carlos","Fatima","Ivan","Laura","Noah"]
LAST_NAMES = ["Kumar","Sharma","Smith","Patel","Wang","Garcia","Ali","Ivanov","Lopez","Johnson"]
WORDS = [
    "please","contact","the","team","for","support","account","details","invoice","order",
    "server","restart","deploy","configuration","meeting","schedule","project","deadline","note","confirm"
]

def random_email():
    name = ''.join(random.choices(string.ascii_lowercase + string.digits, k=random.randint(5,10)))
    domain = random.choice(DOMAINS)
    return f"{name}@{domain}"

def random_phone():
    # Indian-style 10-digit starting 6-9
    first = random.choice('6789')
    rest = ''.join(random.choice(string.digits) for _ in range(9))
    return first + rest

def luhn_generate(length=16):
    # generate length-1 random digits, compute check digit for Luhn
    digits = [str(random.randint(0,9)) for _ in range(length-1)]
    for check in range(10):
        seq = digits + [str(check)]
        s = 0
        double = False
        for d in reversed(seq):
            v = int(d)
            if double:
                v *= 2
                if v > 9:
                    v -= 9
            s += v
            double = not double
        if s % 10 == 0:
            return ''.join(seq)
    return ''.join(digits) + '0'

def random_credit_card():
    num = luhn_generate(16)
    return ' '.join([num[i:i+4] for i in range(0,16,4)])

def random_aadhaar():
    first = str(random.randint(2,9))
    rest = ''.join(random.choice(string.digits) for _ in range(11))
    return first + rest

def random_pan():
    letters = ''.join(random.choice(string.ascii_uppercase) for _ in range(5))
    digits = ''.join(random.choice(string.digits) for _ in range(4))
    last = random.choice(string.ascii_uppercase)
    return letters + digits + last

def random_aws_key():
    return 'AKIA' + ''.join(random.choice(string.ascii_uppercase + string.digits) for _ in range(16))

def random_api_key():
    return ''.join(random.choice(string.ascii_letters + string.digits + '-_') for _ in range(40))

def random_name():
    return f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"

def random_sentence(include_token: str = None):
    n = random.randint(6,14)
    words = [random.choice(WORDS) for _ in range(n)]
    if include_token:
        idx = len(words)//2
        words.insert(idx, include_token)
    s = ' '.join(words)
    # Capitalize and add punctuation
    return s.capitalize() + '.'

def generate_sample(piitype: str) -> str:
    if piitype == 'email':
        token = random_email()
        return f"Please reach out to {token} for access."
    if piitype == 'phone':
        token = random_phone()
        return f"Call our office at {token} to confirm the order."
    if piitype == 'credit_card':
        token = random_credit_card()
        return f"Card number: {token}; expiry 12/25; name on card: {random_name()}."
    if piitype == 'aadhaar':
        token = random_aadhaar()
        return f"Aadhaar ID: {token} was used for verification."
    if piitype == 'pan':
        token = random_pan()
        return f"PAN: {token} appears on the document."
    if piitype == 'aws_key':
        token = random_aws_key()
        return f"AWS access key detected: {token}. Keep it secret."
    if piitype == 'api_key':
        token = random_api_key()
        return f"API token: {token} stored in config.yml"
    if piitype == 'name':
        token = random_name()
        return f"Participant: {token} attended the meeting."
    # normal text
    return random_sentence()

def generate_dataset(output_path: str, n_samples: int = 1000, seed: int = 42) -> str:
    random.seed(seed)
    os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
    types = [
        'normal_text', 'email', 'phone', 'credit_card', 'aadhaar', 'pan', 'aws_key', 'api_key', 'name'
    ]
    weights = [0.6, 0.12, 0.08, 0.04, 0.03, 0.03, 0.03, 0.03, 0.04]
    with open(output_path, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=['id', 'text', 'label'])
        writer.writeheader()
        for i in range(n_samples):
            label = random.choices(types, weights, k=1)[0]
            text = generate_sample(label)
            writer.writerow({'id': i, 'text': text, 'label': label})
    return output_path

if __name__ == '__main__':
    out = generate_dataset('ml/data/synthetic_pii.csv', n_samples=200, seed=123)
    print('Wrote', out)
