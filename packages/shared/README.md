# @stockviewer/shared

The types that cross the client/server boundary, and nothing else.

A React component and an API route describe the same records to each other.
Before this package those descriptions lived in the server modules that also
read and wrote them, so `components/BacktestPage.tsx` imported
`BacktestHistoryEntry` from `lib/backtest-history-storage` — a module whose
other exports take a `StorageProvider` and talk to Postgres, and which reached
`lib/backtest-executor.ts` and its `child_process` import through the type
graph. TypeScript erases type-only imports, so nothing shipped to the browser,
but nothing said it could not either.

The rule this package exists to make checkable:

- a component may import `@stockviewer/shared`
- an API route may import `@stockviewer/shared` and `@stockviewer/db`
- a component importing `@stockviewer/db` is a mistake you can see

## What belongs here

A type both sides name: a stored record, a request body, a response body.

## What does not

Anything with a runtime: no Prisma, no `fs`, no `child_process`, no React.
Types only, so there is nothing to execute and nothing to bundle. Types used
by only one side stay on that side — `components/backtest/types.ts` holds the
chart and table shapes the frontend renders, and they are not here because
nothing on the server names them.
