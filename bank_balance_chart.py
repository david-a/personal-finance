"""
Load Israeli bank export (Excel), build end-of-day balances, sample monthly snapshots.
"""

from __future__ import annotations

import re
from calendar import monthrange
from pathlib import Path
from typing import Literal

import pandas as pd


BALANCE_COL = "יתרה בש''ח"
DATE_COL = "תאריך"


def _normalize_header_cell(s: object) -> str:
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return ""
    t = str(s).strip().replace("\ufeff", "")
    return re.sub(r"\s+", " ", t)


def _find_col_indices_from_row(row: list[object]) -> tuple[int, int]:
    date_idx = -1
    bal_idx = -1
    for i, cell in enumerate(row):
        h = _normalize_header_cell(cell)
        if not h:
            continue
        if date_idx < 0 and h in ("תאריך", "תאריך הפעולה"):
            date_idx = i
        if bal_idx < 0 and "יתרה" in h:
            bal_idx = i
    if date_idx < 0:
        for i, cell in enumerate(row):
            h = _normalize_header_cell(cell)
            if "תאריך" in h and "ערך" not in h:
                date_idx = i
                break
    return date_idx, bal_idx


def _find_header_row_index(raw: pd.DataFrame, max_scan: int = 45) -> tuple[int, int, int] | None:
    limit = min(max_scan, len(raw))
    for i in range(limit):
        row = raw.iloc[i].tolist()
        d, b = _find_col_indices_from_row(row)
        if d >= 0 and b >= 0:
            return i, d, b
    return None


def load_transactions(path: str | Path) -> pd.DataFrame:
    path = Path(path)
    raw = pd.read_excel(path, engine="openpyxl", header=None)
    found = _find_header_row_index(raw)
    if found is None:
        raise ValueError(
            "לא נמצאו עמודות תאריך / יתרה בשורות הפתיחה של הגיליון. ודאו שזה ייצוא תנועות מהבנק."
        )
    header_idx, date_idx, bal_idx = found
    df = pd.read_excel(path, engine="openpyxl", header=header_idx)
    date_series = df.iloc[:, date_idx]
    bal_series = df.iloc[:, bal_idx]
    df = pd.DataFrame(
        {
            DATE_COL: pd.to_datetime(date_series, errors="coerce"),
            BALANCE_COL: pd.to_numeric(bal_series, errors="coerce"),
        }
    )
    df["_row_order"] = range(len(df))
    df[DATE_COL] = pd.to_datetime(df[DATE_COL], errors="coerce")
    df[BALANCE_COL] = pd.to_numeric(df[BALANCE_COL], errors="coerce")
    df = df.dropna(subset=[DATE_COL, BALANCE_COL])
    # Export is newest-first: within a date, the first row in the file is the last txn of that day (EOD).
    df = df.sort_values([DATE_COL, "_row_order"])
    df["day"] = df[DATE_COL].dt.normalize()
    daily = (
        df.groupby("day", as_index=False)[BALANCE_COL].first().sort_values("day").reset_index(drop=True)
    )
    return daily


def _snapshot_date(year: int, month: int, day_in_month: int | Literal["last"]) -> pd.Timestamp:
    if day_in_month == "last":
        last = monthrange(year, month)[1]
        return pd.Timestamp(year=year, month=month, day=last)
    cap = monthrange(year, month)[1]
    d = min(int(day_in_month), cap)
    return pd.Timestamp(year=year, month=month, day=d)


def monthly_snapshots(
    daily: pd.DataFrame,
    day_in_month: int | Literal["last"],
) -> pd.DataFrame:
    """
    For each calendar month from first to last transaction month, return balance as of
    end of the chosen calendar day (last transaction on or before that day).
    Months with no prior transaction use NaN (no marker; line breaks with connectgaps=False).
    Trailing months with no data are dropped so the axis does not extend past real data.
    """
    if daily.empty:
        return pd.DataFrame(columns=["snapshot", "balance"])

    first = daily["day"].min()
    last_data_day = daily["day"].max()
    periods = pd.period_range(first.to_period("M"), last_data_day.to_period("M"), freq="M")

    rows: list[dict] = []
    for p in periods:
        y, m = p.year, p.month
        snap = _snapshot_date(y, m, day_in_month)
        # אין "צילום" לתאריך שעדיין לא הגיע ביחס ליום האחרון שיש בו תנועות בקובץ
        if snap > last_data_day:
            rows.append({"snapshot": snap, "balance": float("nan")})
            continue
        sub = daily[daily["day"] <= snap]
        if sub.empty:
            rows.append({"snapshot": snap, "balance": float("nan")})
        else:
            bal = sub.iloc[-1][BALANCE_COL]
            rows.append({"snapshot": snap, "balance": float(bal)})

    out = pd.DataFrame(rows)
    if out.empty:
        return out

    last_ok = out["balance"].last_valid_index()
    if last_ok is None:
        return pd.DataFrame(columns=["snapshot", "balance"])
    # שמירה על רווחים באמצע (NaN), אבל בלי חודשים ריקים *אחרי* הנקודה האחרונה עם דאטה
    out = out.loc[:last_ok].reset_index(drop=True)
    return out


def default_excel_path() -> Path:
    return Path(__file__).resolve().parent / "excelNewTransactions.xlsx"
