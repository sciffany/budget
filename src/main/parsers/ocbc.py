from __future__ import annotations

"""Rudimentary PDF reader using the pdftotext library (Poppler bindings)."""

import sys
from pathlib import Path

import pdftotext


def read_pdf(pdf_path: str) -> str:
    path = Path(pdf_path)
    if not path.is_file():
        print(f"Error: file not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    with open(path, "rb") as f:
        pdf = pdftotext.PDF(f, physical=True)

    return "\n".join(pdf)


"""Convert OCBC statement text (out.txt) to CSV.

Line format assumed:
  10 spaces, first date (e.g. "01 AUG"), 11 spaces, second date, 11 spaces,
  transaction description, spaces, amount (withdrawal col ~125-140, deposit
  col ~155-165), spaces, running balance (ends near col 200).

Continuation lines are indented 44 spaces with no dates and no amount.
"""

import csv
import re
import sys

MONTHS = {
    "JAN": "01", "FEB": "02", "MAR": "03", "APR": "04",
    "MAY": "05", "JUN": "06", "JUL": "07", "AUG": "08",
    "SEP": "09", "OCT": "10", "NOV": "11", "DEC": "12",
}

DATE_LINE = re.compile(r"^ {10}(\d{2} [A-Z]{3}) +(\d{2} [A-Z]{3}) +(\S.*)$")
CONT_LINE = re.compile(r"^ {44}(\S.*)$")
NUMBER = re.compile(r"[\d,]+\.\d{2}")
ACCOUNT_HEADER = re.compile(r"^\s*360 ACCOUNT\b.*\s(\S+)\s*$")

WITHDRAWAL_MAX_COL = 140  # amount starting before this column is a withdrawal

NOISE_SUBSTRINGS = (
    "Oversea-Chinese Banking",
    "BALANCE B/F",
    "BALANCE C/F",
    "Total Withdrawals",
    "Total Interest",
    "Average Balance",
    "CHECK YOUR STATEMENT",
    "UPDATING YOUR PERSONAL",
    "Please check this",
    "For enquiries",
    "You may update",
    "the Change of",
    "we will take",
)


def is_noise(line: str) -> bool:
    return any(s in line for s in NOISE_SUBSTRINGS)


def parse_amount(text: str) -> float:
    return float(text.replace(",", ""))


def to_iso_date(date_str: str, year: int) -> str:
    day, month = date_str.split()
    return f"{year}-{MONTHS[month]}-{int(day):02d}"


def find_year(lines, default: int) -> int:
    """Extract the year from the last whitespace-separated token on the first
    ``360 ACCOUNT`` header line (e.g. ``... 1 AUG 2025 TO 31 AUG 2025`` -> 2025).
    Falls back to ``default`` if the line is missing or unparseable.
    """
    for line in lines:
        m = ACCOUNT_HEADER.match(line)
        if m:
            token = m.group(1)
            if token.isdigit():
                return int(token)
    return default


def parse_statement(lines):
    transactions = []
    current = None

    def flush():
        nonlocal current
        if current is not None:
            transactions.append(current)
            current = None

    for raw in lines:
        line = raw.rstrip("\n")

        m = DATE_LINE.match(line)
        if m:
            flush()
            first_date = m.group(1)
            nums = list(NUMBER.finditer(line))
            if not nums:
                continue

            balance = parse_amount(nums[-1].group())

            if len(nums) >= 2:
                amt_match = nums[0]
                amount = parse_amount(amt_match.group())
                if amt_match.start() < WITHDRAWAL_MAX_COL:
                    amount = -amount
                desc = line[44:amt_match.start()].strip()
            else:
                amount = 0.0
                desc = line[44:nums[-1].start()].strip()

            current = {
                "date": first_date,
                "description": desc,
                "amount": amount,
                "balance": balance,
            }
            continue

        if is_noise(line):
            continue

        if not line.strip():
            continue

        if current is not None:
            cm = CONT_LINE.match(line)
            if cm and not NUMBER.search(line):
                current["description"] += " " + cm.group(1).strip()

    flush()
    return transactions


def write_csv(transactions, path, year):
    # Column names match the contract in runPythonParser.ts (date, desc, amount).
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["date", "desc", "amount"])
        for t in transactions:
            writer.writerow([
                to_iso_date(t["date"], year),
                t["description"],
                f"{t['amount']:.2f}",
            ])

"""Extract OCBC statement text.

Step 1: Given an OCBC statement text file (e.g. account.txt), pull out the
text between the "BALANCE B/F" marker and the "Co. Reg. No." marker.

The extracted text will be used in later steps for parsing transactions.
"""


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: ocbc.py <path-to-pdf> [<output-csv>]", file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]
    output_path = (
        Path(sys.argv[2])
        if len(sys.argv) >= 3
        else Path(pdf_path).with_suffix(".csv")
    )

    text = read_pdf(pdf_path)
    lines = text.split("\n")

    year = find_year(lines, default=2025)
    transactions = parse_statement(lines)
    write_csv(transactions, output_path, year)

    print(f"Parsed {len(transactions)} transactions (year={year}) -> {output_path}")


if __name__ == "__main__":
    main()
