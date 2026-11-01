# executors

The Python that runs user-authored code: indicators, strategies and backtests.
Spawned as a child process by the web app, one process per request.

```
src/
  executor.py              entry point for indicator calculation
  indicator_executor.py    builds the namespace, exec()s user code
  backtest_executor.py     strategy signals and the backtest simulation
  base_executor.py         stdin/stdout JSON protocol, dataframe preparation
  importable_dataframe.py  lets user code import other indicators and datasets
  MyTT.py                  technical analysis library, 60+ functions
  sandbox/sitecustomize.py the in-process guard
```

## Why this is not an installable package

It has a `requirements.txt` rather than a `pyproject.toml`, and nothing
installs it into the virtualenv. That is deliberate, and reversing it breaks
two things:

**The modules are flat on `sys.path`, not a package.** `executor.py` does
`sys.path.insert(0, os.path.dirname(__file__))` and then
`from indicator_executor import IndicatorExecutor`. Converting to a package
namespace would mean invoking them as `python -m sv_executors.executor`
instead of by file path, which is a larger change than it looks — see the
sandbox note below.

**The sandbox needs a directory, not a module.** `sandbox/sitecustomize.py` is
installed by putting *its directory* on `PYTHONPATH`: CPython's `site` imports
`sitecustomize` by name during interpreter startup, which is what gets the
audit hooks in place before any executor or user code runs. That mechanism is
a path on `PYTHONPATH`, so a path is what the web app has to know either way.

Installing these as top-level modules would also put names like `executor` and
`base_executor` into the virtualenv's global namespace, where they would
shadow anything with the same name.

So: a script bundle with a declared dependency set. `packages/ccm` is the
library in this repository; this is a runtime.

## Dependencies

```bash
python-venv/bin/pip install -r packages/executors/requirements.txt
```

`backtrader` is needed only by `backtest_executor.py`.

## What user code is given

Not `import`s. `indicator_executor.py` builds the namespace explicitly —
`pd`, `np`, `data`, `parameters`, `MyTT`, and every public MyTT function as a
global — and `exec()`s the user's code against it. Users are told they may use
pandas, numpy and MyTT (`docs/INDICATORS.md`), and that is what those names
are. Adding something to that namespace is how you make it available; putting
a module on the path is not.

## Confinement

Three layers, described where they are implemented rather than here:

- the namespace above, which is the weakest and only shapes what is convenient;
- `sandbox/sitecustomize.py`, audit hooks that deny the paths named in
  `SV_SANDBOX_DENY` and sockets when `SV_SANDBOX_DENY_NETWORK` is set. It runs
  inside the process it constrains, so `ctypes` can reach around it;
- the kernel — `sandbox-exec` on macOS, `bubblewrap` on Linux — set up in
  `apps/web/lib/python-child.ts`, which probes at startup that a denial
  actually bites and says so when it does not.

The paths that must stay unreachable are listed once, in `python-child.ts`,
and all three layers are built from that one list.
