# ccm

Convergent cross mapping (Sugihara et al., 2012) for time series: does one
series drive another, in a system where the relationship need not be linear.

Pure numpy. No subprocesses, no network, no file access — so it imports from
user-authored Python running under StockViewer's audit-hook sandbox
(`packages/executors/src/sandbox/sitecustomize.py`), which blocks all three.

## Install

```bash
python-venv/bin/pip install -e packages/ccm
python-venv/bin/pip install -e 'packages/ccm[test]'   # with pytest
```

## Direction, which inverts

Cross-mapping *from A's manifold to B* means using A's reconstructed states to
predict B. It works when information about B is embedded in A's attractor, and
B leaves a trace in A only if B drives A:

> high, **converging** skill for "A xmap B" ⇒ **B causes A**

`CcmResult.implication` spells this out so the direction is never inferred from
argument order at the call site.

```python
import numpy as np
from ccm import ccm

result = ccm(manifold=series_b, target=series_a,
             manifold_label="B", target_label="A",
             n_surrogates=100, rng=np.random.default_rng(0))

print(result.summary())
# B xmap A: rho=0.712 delta=+0.310 p=0.010 E=3 tau=1 -> A -> B supported

if result.supports_causality():
    ...  # A drives B
```

## Three gates, not one

`rho` on its own means nothing — see `tests/test_crossmap.py`, where two
*unrelated* AR(1) series score rho ≈ 0.18 simply for sharing an
autocorrelation structure. A result is only worth reading when all three gates
pass:

- **convergence** — skill rises with library size (`result.converged()`,
  `result.delta_rho`, `result.rho_mean` across `result.library_sizes`);
- **the null** — skill beats phase-randomised surrogates of the target, which
  preserve its power spectrum exactly (`result.significant()`);
- **power** — the manifold series predicts its own future well enough for a
  cross map to recover anything at all (`result.had_power`,
  `result.manifold_embeddability`).

`ccm()` refuses `n_surrogates=0`, and refuses a manifold below
`min_embeddability` (default 0.1) with `UnembeddableManifold`. Use
`cross_map_skill()` when exploring and no one will read the number.

The gates are not interchangeable:

- A one-sided p-value is cheap to pass when skill hovers around zero. In the
  ground-truth run the *absent* direction came back with p = 0.02 while its rho
  was −0.01 and its curve flat; only convergence caught it.
- The power gate catches noise-dominated manifolds, where a coupling of any
  strength goes undetected. Measured on a chaotic series genuinely forcing
  random-walk returns, every coupling from 0 to 2× the noise amplitude was
  missed. Without the gate that reads as "no causality"; with it, the call
  raises instead.
- The power gate does *not* establish that an attractor exists. An AR(1) with
  phi = 0.95 — the shape of most financial data — passes it comfortably while
  being pure noise with memory. That case is the surrogate null's job.

False positives sit at the nominal rate: 1 in 20 on unrelated series at
alpha = 0.05. On a pairwise scan of 100 pairs, expect about 5.

## One diagnostic, which is not a fourth gate

`result.leakage_suspected` flags the failure the three gates are blind to:
pairing a series with something computed *from* it. It reads
`result.excess_skill`, which is `rho - target_embeddability` — how far cross
mapping beats the target at predicting itself.

Under CCM's premises that quantity sits at or below zero. If both series are
observations of one attractor, the target's own history is the shortest route
to its future; information reaching the manifold travelled a longer path
through the shared dynamics and arrived degraded, never improved. A large
positive value is therefore evidence against the premises rather than a
stronger result.

It fires above `LEAKAGE_GAP_THRESHOLD` (0.45), and `supports_causality()`
ignores it. Read the two side by side — `summary()` appends the flag to the
verdict rather than changing it. Keeping it out of the verdict is deliberate,
because it errs in both directions:

- **It is blind to leakage onto a predictable target.** The measure only has
  resolution when the target is hard to predict from its own past. Cross-map a
  smoothed or lagged copy of a deterministic series against the series itself
  and every check in the package passes, excess included, at a gap of ±0.02.
  A quiet diagnostic is not a clean bill of health.
- **A real coupling can drift into its range from below.** When the target is
  seen through observation noise, self-prediction pays for that noise twice
  and cross mapping only once, so genuine forcing produces a positive excess —
  up to +0.382, measured at noise roughly the size of the signal.

The threshold sits in the gap between that +0.382 ceiling and the +0.568 floor
of the weakest leakage case constructed, 0.187 wide, nearer its middle than its
top. `tests/test_leakage.py` holds the six classes it was calibrated on and
fails if the threshold leaves the measured gap. All of it is synthetic, and
the leakage floor bounds only the leaks that were *built*: real partial
leakage, mixed with common factors, can sit below it.

One accidental safeguard, from the same calibration: a *pointwise invertible*
transform gives rho = 1.000 at every library size, so `delta_rho` is zero and
the convergence gate rejects it. Perfect leakage gives itself away. It is the
partial kind — a smoothing, a lag — that passes.

## What it will not fix

CCM assumes a low-dimensional, near-deterministic, roughly stationary system.
Financial series break all three, and three failure modes matter most:

- **An indicator against the prices it was computed from.** This is not a weak
  case, it is an ill-posed one, and no gate here detects it. An indicator is a
  smooth function of its input series, so by Takens the two reconstruct *one*
  attractor: there is no second system for a cause to live in. Measured on a
  pure random walk, cross mapping RSI(14) against the returns it came from
  returns rho = 0.96, delta = +0.77, p = 0.01 — a confident causal verdict on
  data containing no causality whatsoever. No *gate* detects it, so the
  pairing still has to be avoided by the caller;
  `tests/test_embeddability.py` pins the behaviour so the limit stays visible.
  `leakage_suspected` does flag this particular shape of it, for whatever that
  is worth — see above for the two ways it is wrong. For "does my indicator
  predict price", see below.
- **Non-stationarity.** Two trending series embed into each other beautifully
  and mean nothing. Use returns or detrended series, never raw prices.
- **Common driving.** When both series are forced by a third — the index, for
  A-shares — CCM reports causality in both directions. This is the default
  case in equity data, not an edge case, and nothing here detects it either.
  Condition out the common factor first, or read a bidirectional result as
  "probably a shared driver".

`rho` is also not a calibrated measure of causal strength: it is bounded by the
target's own predictability, so a weak coupling in a clean system outscores a
strong one in a noisy system. Rank with it only within one target, one length
and one E; never across instruments with different noise levels.

## The question CCM cannot answer

"Does my indicator drive the price" is not reachable from here, for the first
reason above, and the direction that matters is also the one with no power:
returns cannot be embedded, so nothing is ever detected as driving them. The
well-posed version of that question is about *information increment* — does
`indicator_t` say anything about `return_{t+1}` beyond what the return's own
history already says — and it is answered by out-of-sample incremental R²,
Granger causality (linear, but it needs no attractor, which here is an
advantage), or conditional transfer entropy. Not by this package.

Validate against `ccm.systems` (coupled logistic maps, where the answer is
known) before pointing any of this at market data.

## Caching

`ccm.__version__` is part of the contract. Anything that persists a value
computed here — `IndicatorValue` rows, for instance — must include it in the
cache key, or upgrading the package will quietly serve numbers computed by the
old one.

## Layout

| module | holds |
|---|---|
| `embedding.py` | delay embedding, Theiler-windowed neighbour search, weights |
| `simplex.py` | simplex projection, dimension selection, `embeddability()` |
| `crossmap.py` | `ccm()`, `cross_map_skill()`, `CcmResult`, the leakage diagnostic |
| `surrogate.py` | Ebisuzaki phase randomisation and the p-value |
| `systems.py` | ground-truth systems for calibration |

## Tests

```bash
cd packages/ccm && ../../python-venv/bin/python -m pytest -q
```

`tests/test_leakage.py` is the slow one, around 30 seconds: each of its cases
builds a full convergence curve and surrogate null, because the numbers that
fix `LEAKAGE_GAP_THRESHOLD` were measured at those settings and a cheaper run
would not reproduce them.
