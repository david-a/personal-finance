"""
Load Israeli bank export (Excel), build end-of-day balances, sample monthly snapshots.
"""

from __future__ import annotations

from calendar import monthrange
from pathlib import Path
from typing import Literal

import pandas as pd


BALANCE_COL = "יתרה בש''ח"
DATE_COL = "תאריך"


def load_transactions(path: str | Path) -> pd.DataFrame:
    path = Path(path)
    df = pd.read_excel(path, engine="openpyxl", header=4)
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
