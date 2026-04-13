
import pdfplumber
import pandas as pd
import re
import sys
import re
from datetime import datetime

def extract_amounts_with_type(text):
    # Match patterns like 42.40 DB or 4.50 CR, with optional commas (e.g., 1,200.50 CR)
    pattern = r"\b\d{1,3}(?:,\d{3})*(?:\.\d{2})?\s+(CR|DB)\b"
    matches = re.findall(pattern, text)
    
    # If you want the full match including amount:
    full_matches = re.findall(r"\b(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s+(CR|DB)\b", text)
    return full_matches

def is_date(text):
    return bool(re.match(r"\d{2} [A-Za-z]+", text))

def remove_ref_num(transaction):
    # remove the text from REF NO onwards
    transaction['desc'] = transaction['desc'].split('REF NO')[0]

def yearNow():
    return datetime.now().strftime("%Y")

transactions = []

with pdfplumber.open(sys.argv[1]) as pdf:
    for page in pdf.pages:
        words = page.extract_words(x_tolerance=3, y_tolerance=3)
        current_row = {}
        for bigram in [words[i:i+2] for i in range(len(words)-1)]:
            text = bigram[0]['text'] + ' ' + bigram[1]['text']
            x = bigram[0]['x0']
            if is_date(text):
                if current_row:
                    transactions.append(current_row)
                current_row = {'date': text + ' ' + yearNow(), 'desc': '', 'amount': ''}
            elif current_row:
                if x > 450:  # rightmost: amount
                    amounts = extract_amounts_with_type(text)
                    if len(amounts) > 0:
                        if amounts[0][1] == 'CR':
                            current_row['amount'] = amounts[0][0]
                        else:
                            current_row['amount'] = '-' + amounts[0][0]
                else:
                    current_row['desc'] += ' ' + bigram[0]['text']
        if current_row:
            transactions.append(current_row)

for transaction in transactions:
    remove_ref_num(transaction)
    transaction['desc'] = transaction['desc'].strip()
    transaction['desc'] = ' '.join(transaction['desc'].split(' ')[1:])

# Filter off lines where the amount is empty
transactions = [transaction for transaction in transactions if transaction['amount'] != '']




# Save to CSV
df = pd.DataFrame(transactions)
df.to_csv(sys.argv[2], index=False)
print(df.head())
