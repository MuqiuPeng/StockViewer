"""Sketch: calling ccm from a StockViewer indicator.

A paste-able shape rather than a tested path. It is deliberately NOT the
obvious use: cross mapping a stock's own indicator against that stock's own
price is ill-posed (see README, "What it will not fix"), and cross mapping
anything onto daily returns has no power, so `ccm()` refuses it.

What is left that the assumptions allow: two *different* instruments, and a
series with real persistence rather than returns. Turnover rate is a
reasonable candidate; realised volatility is another.

Configure the second instrument as an external dataset
(docs/EXTERNAL_DATASETS.md) under the parameter name `other`.
"""
import numpy as np
import pandas as pd

from ccm import DEFAULT_MIN_EMBEDDABILITY, ccm, embeddability
from ccm.crossmap import UnembeddableManifold

DIMENSION = 3


def calculate(data: pd.DataFrame, parameters: dict):
    blank = [None] * len(data)
    other = parameters["other"]

    # Align on dates. Turnover rate, not close: it has the persistence a
    # delay embedding needs, and it is already scale-free.
    paired = pd.DataFrame(
        {
            "self": data.set_index("date")["turnoverRate"],
            "other": other.set_index("date")["turnoverRate"],
        }
    ).dropna()
    if len(paired) < 300:
        return blank

    mine = paired["self"].to_numpy()
    theirs = paired["other"].to_numpy()

    # Pre-screen before paying for the full run: this is one simplex pass,
    # while ccm() below is that plus a convergence curve and 100 surrogates.
    if embeddability(mine, dimension=DIMENSION) < DEFAULT_MIN_EMBEDDABILITY:
        return blank

    try:
        result = ccm(
            manifold=mine,
            target=theirs,
            dimension=DIMENSION,
            n_surrogates=100,
            manifold_label="self",
            target_label="other",
            rng=np.random.default_rng(0),   # seed it, or the column is unstable
        )
    except UnembeddableManifold:
        # Belt and braces: the gate can still fire if the aligned window
        # differs from what was screened above.
        return blank

    # The leakage diagnostic is advisory, so the decision of what to do with
    # it belongs here rather than in the library. Suppressing is the right
    # call for an indicator column: two turnover-rate series should not show
    # excess skill, so a flag here means the pair is not what it looks like —
    # most likely one series is a transform of the other, or the alignment
    # dropped the wrong rows. Print it somewhere you will see it.
    if result.leakage_suspected:
        return blank

    # Emit the verdict, not the bare rho: rho alone is ~0.2 for unrelated
    # series. One scalar per series, broadcast to the column the executor
    # expects. result.implication reads "other -> self" when this is positive.
    value = result.rho if result.supports_causality() else 0.0
    return [value] * len(data)
