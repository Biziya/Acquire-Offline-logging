# SQL tests for the Upload Data stored procedure

`Test_UploadData_StoredProcedure.sql` runs the upload's database step
directly in SQL Server Management Studio (SSMS), without the backend. If the
script fails with the same error as the API, the backend is not the cause.

## The script is out of date

The script still calls the old procedure and the old database:

```sql
USE [ACQMN01_DEV];
EXEC dbo.InsertUpdateCoreDescr_WellCAD
    @Action = 'Raw core import_JSON', @Hole, @usr, @fileName, @str_json;
```

The API now calls `dbo.insertAcQuireOfflineBek` (created by
`../Sql/insertAcQuireOfflineBek.sql`) with the same parameters. `appsettings.json`
does not set `CoreDescrData:Database`, so uploads go to `ACQMN01`, not
`ACQMN01_DEV`. Until the script is updated:

- change the `USE` line and the procedure name in Sections A, B, E and F by
  hand to test what the API really runs;
- `@User = NULL` in Section C relied on the old procedure replacing `@usr`
  with `SUSER_NAME()`. The new procedure stores `@usr` as sent and falls back
  to `SUSER_SNAME()` only when it is empty, so set `@User` to a test
  `DOMAIN\user` to match the API.

The rest of this page describes the script as it is.

## Safe by default

Sections A to D and G only read. The procedure test (Sections E and F) runs
only when you switch it on, and always inside a transaction that is rolled
back. The script has no `COMMIT`, no `GRANT` or `ALTER`, and no `INSERT` or
`UPDATE` of its own.

## Connect with the backend's login

Open `backend/BackendApi/SQLTests/Test_UploadData_StoredProcedure.sql` in SSMS
and connect with the same login as the backend:

| Setting | Value |
| --- | --- |
| Server name | `BMNULAADB02` |
| Authentication | SQL Server Authentication |
| Login | `userAcquire` (ask the team for the password; never paste it into a ticket) |

Permissions belong to a login. With Windows Authentication the results
describe your own rights, so a test can pass for you while the API still
fails. A DBA can instead uncomment `EXECUTE AS LOGIN = N'userAcquire';` at the
top (this needs `IMPERSONATE`) and the `REVERT;` at the end.

Every query uses the database on the `USE` line.

## Section A: connection

Press F5. The first grid should show:

| Column | Expected |
| --- | --- |
| `ServerName` | `BMNULAADB02` |
| `DatabaseName` | the database on the `USE` line |
| `SqlLogin` | `userAcquire`; anything else means the results do not describe the backend |
| `DatabaseUser` | the database user mapped to that login (give this name to the DBA) |
| `OriginalLogin` | who opened the session; it differs from `SqlLogin` only with `EXECUTE AS` |

The second grid shows which of `ACQMN01` and `ACQMN01_DEV` contain the
procedure and the table. `NULL` means missing, or not visible to this login.

## Sections B and D: read-only checks

The default run (`@RunProcedureTest = 0`) changes nothing.

Section B checks permissions. `CanExecuteProcedure` must be `1`. `CanInsert`,
`CanUpdate` and `CanSelect` may be `0`, because the login does not need table
permissions when the procedure reaches the table through an intact ownership
chain or a certificate signature. In the owner grid, if the procedure and the
table have different `OwnerUser`s, `ExecuteAs` is `CALLER` and `Signatures` is
`0`, the procedure's INSERT is checked against the login, which gives error
229. An empty grid means the login cannot read the metadata.

Section D checks JSON parsing: `IsJson = 1`, `RowsInJson > 0`,
`InvalidIntervals = 0`, `DrillholeLength` from 1 to 20 and `FileNameLength`
at most 50. A `NULL` in `LithoFromNumeric` or `LithoToNumeric` means SQL
Server cannot read that depth as a number.

Section C holds one real row of `yashgaa.json` in the shape the backend sends.
To test a whole file, paste its contents between `N'` and `'` and double every
single quote. Extra fields in the file are fine. Reading the file from disk is
not practical, because SQL Server can only open paths on its own machine and
needs bulk permissions.

## Sections E and F: procedure test

1. In Section C set `@RunProcedureTest = 1`.
2. Keep `@CheckRepeatUpload = 1` to run the procedure a second time with the
   same JSON as a duplicate check.
3. Press F5.

The script begins a transaction, runs the procedure, reads the rows inside the
transaction, optionally runs it again, and rolls back. The last grid confirms
the table is unchanged.

Use this only against an approved database. Rollback undoes the table changes
but not side effects outside the transaction. If the procedure ends the
transaction itself, the script warns you, and its changes may then be
permanent; tell the DBA. To keep data, upload through the API.

| Result | Meaning |
| --- | --- |
| `Procedure completed without error` and `Unchanged after rollback` | The database side works for this login. If the API still fails, compare its login and database with Section A |
| `RowsAfterFirstRun` > `RowsBefore` | The procedure inserted rows |
| `RowsAfterFirstRun` = `RowsBefore` | It updated existing rows, or had nothing new |
| `Repeat upload added no rows` | Duplicate handling works |
| `Repeat upload ADDED rows` | Duplicates; report to the DBA |
| An error grid | See its `Diagnosis` column and the table below |

The error grid shows SQL Server's `ErrorNumber` and `ErrorMessage`, plus the
failed step, login, database user and database.

| Error | Meaning |
| --- | --- |
| 229 / 230 | Permission denied (see below) |
| 2812 | Procedure not found in this database: check the `USE` line |
| 2627 / 2601 | Duplicate key |
| 515 | NULL not allowed: a needed JSON field is missing or empty |
| 8152 / 2628 | Value longer than its column |
| 1205 | Deadlock: run the test again |
| 266 | The procedure commits or rolls back on its own |

## Section G: stored data

Section G always runs and only reads committed data: the stored rows for the
drillhole, and any duplicates under the procedure's matching key (this grid
should be empty). After a rollback-only test nothing changes here; the
`inside test transaction` grid of Section E shows what the procedure would
write. After a real upload through the API, Section G shows the result, with
the uploader's `DOMAIN\user` in `usr`.

## Error 229

```text
The INSERT permission was denied on the object 'CoreDescrData',
database 'ACQMN01', schema 'MyApps'.
```

The message names the table, so `EXECUTE` on the procedure was allowed. SQL
Server then checked the procedure's INSERT against the login, because the
ownership chain from the procedure to `MyApps.CoreDescrData` is broken
(different owners, dynamic SQL, or a cross-database write) or the login has
an explicit `DENY`. This is a SQL Server setting. Changing the JSON, the
backend or the frontend will not fix it, and neither will another login or
broad grants such as `db_owner` or `db_datawriter`.

## What to send the DBA

1. The Section A grid: server, database, `SqlLogin`, `DatabaseUser`.
2. The Section B grids: permissions, owners, `ExecuteAs`, `Signatures`.
3. The full error grid (`FailedStep`, `ErrorNumber`, `ErrorMessage`,
   `ErrorProcedure`, `ErrorLine`, `DatabaseName`).
4. The API's log line `Uploading drillhole … as SQL login …`, to compare with
   Section A.

The least-privilege fix is to sign the procedure with a certificate whose user
holds `SELECT, INSERT, UPDATE` on `MyApps.CoreDescrData`, so the application
login keeps `EXECUTE` only. `../Sql/UploadDataPermissions.sql` has the DBA's
read-only diagnostics and that fix for review; nothing in it runs by itself.
