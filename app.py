"""
Streamlit: גרף יתרה בחשבון בנקודות חודשיות לפי יום נבחר בחודש (או יום אחרון בחודש).
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from bank_balance_chart import default_excel_path, load_transactions, monthly_snapshots

st.set_page_config(page_title="יתרה בחשבון — לפי חודש", layout="wide")

st.title("יתרה בחשבון — נקודות בזמן")
st.markdown(
    "בחרו קובץ אקסל מהבנק, ואז יום בחודש (1–31) או **יום אחרון בחודש**. "
    "הגרף מציג את היתרה אחרי התנועה האחרונה בכל יום צילום (או לפני כן אם לא היו תנועות באותו יום)."
)

with st.sidebar:
    st.header("קלט")
    default_path = default_excel_path()
    uploaded = st.file_uploader("קובץ Excel (אופציונלי)", type=["xlsx"])
    if uploaded is not None:
        path: Path | str = uploaded
    elif default_path.exists():
        path = default_path
        st.caption(f"משתמש בקובץ: `{default_path.name}`")
    else:
        path = default_path
        st.warning("לא נמצא קובץ ברירת מחדל. העלו קובץ Excel.")

    mode = st.radio(
        "יום הצילום בכל חודש",
        options=["יום ספציפי (1–31)", "יום אחרון בחודש"],
        index=1,
    )
    if mode == "יום ספציפי (1–31)":
        day_num = st.number_input("יום בחודש", min_value=1, max_value=31, value=1, step=1)
        day_arg: int | str = int(day_num)
    else:
        day_arg = "last"

    st.divider()
    st.caption("הקובץ צפוי בפורמט ייצוא עסקי (שורת כותרות אחרי פרטי חשבון).")

try:
    daily = load_transactions(path)
except Exception as e:
    st.error(f"שגיאה בטעינת הקובץ: {e}")
    st.stop()

if daily.empty:
    st.error("אין שורות עם תאריך ויתרה תקינים.")
    st.stop()

snap_df = monthly_snapshots(daily, day_arg)

col_a, col_b = st.columns(2)
with col_a:
    st.metric("תאריך התנועה המוקדם", str(daily["day"].min().date()))
with col_b:
    st.metric("תאריך התנועה המאוחר", str(daily["day"].max().date()))

if snap_df.empty:
    st.warning("אין נתונים להצגה.")
    st.stop()

fig = go.Figure()
fig.add_trace(
    go.Scatter(
        x=snap_df["snapshot"],
        y=snap_df["balance"],
        mode="lines+markers",
        name="יתרה",
        connectgaps=False,
        hovertemplate="%{x|%Y-%m-%d}<br>יתרה: %{y:,.2f} ₪<extra></extra>",
    )
)
fig.update_layout(
    xaxis_title="תאריך צילום (סוף יום)",
    yaxis_title="יתרה (₪)",
    hovermode="x unified",
    height=520,
    margin=dict(l=40, r=40, t=40, b=40),
    yaxis=dict(tickformat=",.0f"),
)
fig.update_xaxes(tickformat="%Y-%m-%d")

st.plotly_chart(fig, use_container_width=True)

with st.expander("טבלת נקודות"):
    st.dataframe(
        snap_df.assign(
            snapshot=snap_df["snapshot"].dt.strftime("%Y-%m-%d"),
            balance=snap_df["balance"].map(
                lambda x: f"{x:,.2f}" if pd.notna(x) else "—"
            ),
        ),
        use_container_width=True,
        hide_index=True,
    )
