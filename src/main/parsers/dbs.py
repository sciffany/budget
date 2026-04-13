
import pdfplumber
import pandas as pd
import re
import sys
import re

def remove_transaction_details_and_after(text):
    marker = "Balance Carried Forward"
    index = text.find(marker)
    if index == -1:
        return text  # Marker not found
    return text[:index]


def is_integer_like(text: str) -> bool:
    """
    Returns True if the input string represents a number with optional
    commas and decimal point. Returns False if it's a word or non-numeric.
    """
    # Remove leading/trailing spaces
    text = text.strip()

    # Regular expression for number-like strings (e.g., "1,000", "12,345.67", "100.00")
    number_pattern = r'^-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d+(\.\d+)?$'

    return bool(re.match(number_pattern, text))


def is_date(text):
    return bool(re.match(r"\d{2}/\d{2}/\d{4}", text))

transactions = []

with pdfplumber.open(sys.argv[1]) as pdf:
    for page in pdf.pages:
        words = page.extract_words(x_tolerance=10, y_tolerance=10)

        current_row = {}
        for word in words:
            text = word['text']
            x = word['x0']
            if is_date(text):
                if current_row:
                    transactions.append(current_row)
                current_row = {'date': text, 'desc': '', 'amount': ''}
            elif current_row:
                if x > 500:  # rightmost: likely balance
                    pass
                elif x > 420:  # middle-right: likely amount
                    if current_row['amount'] == '':
                        current_row['amount'] = text
                    elif is_integer_like(text):
                        current_row['amount'] += text
                elif x > 300:  # middle-right: likely amount
                    if current_row['amount'] == '':
                        current_row['amount'] = "-" + text
                    elif is_integer_like(text):
                        current_row['amount'] += "-" + text
                else:  # description block
                    current_row['desc'] += ' ' + text
        if current_row:
            current_row['desc'] = current_row['desc'].strip()
            current_row['desc'] = remove_transaction_details_and_after(current_row['desc'])
            transactions.append(current_row)

# Clean up descriptions and filter out unwanted transactions
transactions = [
    transaction for transaction in transactions
    if "Balance Carried Forward" not in transaction['desc'].strip() 
    and "Total" != transaction['desc'].strip()
]

# Strip whitespace from descriptions
for transaction in transactions:
    transaction['desc'] = transaction['desc'].strip()



# Save to CSV
df = pd.DataFrame(transactions)
df.to_csv(sys.argv[2], index=False)
print(df.head())
