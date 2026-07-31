from __future__ import annotations

"""Parse Citibank Singapore credit card eStatements to (date, desc, amount) CSV.

The physical-layout text extraction from Poppler renders transactions as:
    ``DD MMM   <description with column spacing>   <amount>``
where amount may be wrapped in parentheses to denote a credit
(e.g. ``FAST INCOMING PAYMENT (60.00)``).

Statements don't print the year on transaction lines, so we take it from the
four-digit sequence in the PDF filename (e.g. ``eStatement_Jul2026.pdf`` ->
2026). All emitted amounts are negative, per the caller's convention that
credit card statement rows represent outgoing charges.
"""

import csv
import os
import re
import sys
from datetime import datetime
from pathlib import Path

import pdftotext


MONTHS = {
    "JAN": "01", "FEB": "02", "MAR": "03", "APR": "04",
    "MAY": "05", "JUN": "06", "JUL": "07", "AUG": "08",
    "SEP": "09", "OCT": "10", "NOV": "11", "DEC": "12",
}

TXN_LINE = re.compile(
    r"^\s*(?P<day>\d{2})\s+(?P<mon>JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+"
    r"(?P<desc>.+?)\s{2,}"
    r"(?P<amount>\(?-?[\d,]+\.\d{2}\)?)\s*$",
    re.IGNORECASE,
)


def year_from_filename(pdf_path: str) -> str:
    """Return the 4-digit year found in the PDF filename (19xx / 20xx),
    falling back to the current year if the filename doesn't contain one."""
    match = re.search(r"(19|20)\d{2}", os.path.basename(pdf_path))
    return match.group(0) if match else datetime.now().strftime("%Y")


def parse_amount(text: str) -> float:
    text = text.strip()
    negative = text.startswith("(") and text.endswith(")")
    cleaned = text.strip("()").replace(",", "")
    value = float(cleaned)
    return -value if negative else value


def clean_description(desc: str) -> str:
    """Collapse the wide column spacing left by physical-layout extraction
    into single spaces so the payee reads naturally."""
    return re.sub(r"\s{2,}", " ", desc).strip()


def read_pdf(pdf_path: str) -> str:
    with open(pdf_path, "rb") as f:
        pdf = pdftotext.PDF(f, physical=True)
    return "\n".join(pdf)


def extract_transactions(pdf_path: str, year: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for raw_line in read_pdf(pdf_path).split("\n"):
        line = raw_line.rstrip()
        if not line.strip():
            continue

        match = TXN_LINE.match(line)
        if not match:
            continue

        day = match.group("day")
        mon = match.group("mon").upper()
        if mon not in MONTHS:
            continue

        desc = clean_description(match.group("desc"))
        amount = parse_amount(match.group("amount"))

        # All rows emitted negative per the credit-card-statement contract.
        amount = -abs(amount)

        rows.append({
            "date": f"{year}-{MONTHS[mon]}-{int(day):02d}",
            "desc": desc,
            "amount": f"{amount:.2f}",
        })
    return rows


def write_csv(rows: list[dict[str, str]], path: str) -> None:
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["date", "desc", "amount"])
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: citibank.py <pdf-path> [<csv-output-path>]", file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]
    if not Path(pdf_path).is_file():
        print(f"Error: file not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    output_path = (
        sys.argv[2] if len(sys.argv) >= 3 else str(Path(pdf_path).with_suffix(".csv"))
    )

    year = year_from_filename(pdf_path)
    rows = extract_transactions(pdf_path, year)
    write_csv(rows, output_path)
    print(f"Parsed {len(rows)} transactions (year={year}) -> {output_path}")


if __name__ == "__main__":
    main()
