# SQL tests — Upload Data stored procedure

`Test_UploadData_StoredProcedure.sql` runs the Upload Data database operation
directly in SQL Server Management Studio (SSMS), without the backend:

```sql
EXEC dbo.InsertUpdateCoreDescr_WellCAD
    @Action = 'Raw core import_JSON', @Hole, @usr, @fileName, @str_json;
```

It separates database problems (permissions, missing objects, data errors)
from application problems. If this script fails with the same error as the
API, the backend is not the cause.

**Safe by default.** Every section is read-only except the procedure test,
which runs only when you switch it on, and always inside a transaction that is
rolled back. The script contains no `COMMIT`, no `GRANT`/`ALTER`, and no
`INSERT`/`UPDATE` of its own.

## 1. Open the script

SSMS → **File → Open → File…** → `backend/BackendApi/SQLTests/Test_UploadData_StoredProcedure.sql`.

## 2. Connect to the correct server — with the backend's login

| Setting | Backend value (`appsettings.json`) |
| --- | --- |
| Server name | `BMNULAADB02` |
| Authentication | **SQL Server Authentication** |
| Login | `userAcquire` (password from the team / `appsettings.json`; never paste it into tickets) |
| Database the backend uses | `ACQMN01` (`Initial Catalog`) |

Permissions belong to a login. If you connect with Windows Authentication
(your own account), the results describe **your** rights, not the backend's,
and a test can pass for you while the API still fails.

A DBA who does not know the password can instead uncomment
`EXECUTE AS LOGIN = N'userAcquire';` at the top of the script (needs
`IMPERSONATE`) and the `REVERT;` at the end.

**Choose the database** on the `USE` line at the top of the script:

- `ACQMN01_DEV` (default): the approved development database.
- `ACQMN01`: the database the backend actually connects to today, where the
  current error happens. The test is still rollback-only.

Every query in the script uses the database selected there.

## 3. Verify the database and user (Section A)

Press **F5**. The first grid must show:

| Column | Expected |
| --- | --- |
| `ServerName` | `BMNULAADB02` |
| `DatabaseName` | the database on the `USE` line |
| `SqlLogin` | `userAcquire` — compare with the backend's `User ID`. Anything else: results do not describe the backend |
| `DatabaseUser` | the database user mapped to that login (give this name to the DBA) |
| `OriginalLogin` | who opened the session (differs from `SqlLogin` only with `EXECUTE AS`) |

The second grid shows which of `ACQMN01` / `ACQMN01_DEV` contain the
procedure and the table (`NULL` = missing, or not visible to this login).

## 4. Read-only checks (Sections B and D)

The default run (`@RunProcedureTest = 0`) changes nothing.

**Section B — permissions**

- `CanExecuteProcedure` must be `1`.
- `CanInsert` / `CanUpdate` / `CanSelect` may be `0`. Under the approved
  security model the login does **not** need table permissions: the procedure
  reaches the table through an intact ownership chain (procedure and table
  have the same owner, no dynamic SQL) or a certificate signature.
- The owner grid: if the procedure row and the table row show **different**
  `OwnerUser`s, `ExecuteAs` is `CALLER` and `Signatures` is `0`, the
  procedure's INSERT is checked against the login: that is exactly error 229.
  An empty grid means the login cannot read the metadata; ask the DBA.

**Section D — JSON parsing**

- `IsJson = 1`, `RowsInJson > 0`, `InvalidIntervals = 0`,
  `DrillholeLength` 1–20, `FileNameLength` ≤ 50.
- The row grid shows drillhole, project, depths, lithology and colour code as
  SQL Server reads them. A `NULL` in `LithoFromNumeric` / `LithoToNumeric`
  means SQL Server cannot read that depth as a number.

**Using your own data.** Section C holds one real row of `yashgaa.json` in the
same shape the backend sends. To test the whole file, paste its contents
between `N'` and `'`, doubling every single quote (`'` → `''`). The original
file with all its extra fields is fine. Reading the file from disk is not
recommended: SQL Server can only open paths on its own machine and needs bulk
permissions.

## 5. Enable the procedure test (Sections E–F)

1. In Section C set `@RunProcedureTest = 1`.
2. Keep `@CheckRepeatUpload = 1` to run the procedure a second time with the
   same JSON (duplicate check).
3. Press **F5** again.

What happens: `BEGIN TRANSACTION` → procedure → read the rows inside the
transaction → (repeat run) → `ROLLBACK`. The final grid confirms the table is
unchanged after the rollback.

Only use this against an approved database. Rollback undoes the procedure's
table changes, but not side effects outside the transaction (identity values,
calls to other servers or files). If the procedure ends the transaction by
itself, the script warns you; tell the DBA, because its changes may then be
permanent.

To keep data permanently, upload through the API once the database is fixed.
This script deliberately has no commit option.

## 6. Interpret the result

| Result | Meaning |
| --- | --- |
| `Procedure completed without error` + `Unchanged after rollback` | The database side works for this login. If the API still fails, compare its login and database (Section A) with this session |
| `RowsAfterFirstRun` > `RowsBefore` | The procedure inserted rows |
| `RowsAfterFirstRun` = `RowsBefore` | It updated existing rows (or the JSON had nothing new). A success does not always mean an insert |
| `Repeat upload added no rows` | Duplicate handling works |
| `Repeat upload ADDED rows` | Duplicates: report to the DBA |
| An error grid | See the `Diagnosis` column and the table below |

Errors are never hidden: the error grid shows SQL Server's own `ErrorNumber`
and `ErrorMessage`, plus the failed step, login, database user and database.

| Error | Meaning |
| --- | --- |
| **229 / 230** | Permission denied (see section 8) |
| 2812 | Procedure not found in this database: wrong `USE` line |
| 2627 / 2601 | Duplicate key |
| 515 | NULL not allowed: a needed JSON field is missing or empty |
| 8152 / 2628 | Value longer than its column (truncation) |
| 1205 | Deadlock: run the test again |
| 266 | The procedure commits or rolls back on its own |

## 7. Verify inserted or updated data (Section G)

Section G always runs. It is read-only and shows **committed** data only:

- the stored rows for the drillhole (`HOLEID`, `PROJECTCODE`, `[FROM]`, `[TO]`,
  `PRIORITY`, `NAME`, `VALUE`, `COMMENT_VALUE`, `usr`);
- duplicates under the procedure's matching key (must be empty).

After a rollback-only test these are unchanged. To see what the procedure
**would** write, look at the `inside test transaction` grid of Section E.
After a real upload through the API, Section G shows the result. `usr` holds
the SQL login (`SUSER_NAME()`), not the Windows user shown in the app.

## 8. Permission error 229

```text
The INSERT permission was denied on the object 'CoreDescrData',
database 'ACQMN01', schema 'MyApps'.
```

- The message names the **table**, so `EXECUTE` on the procedure was allowed.
  The procedure then ran its INSERT, and SQL Server checked it against the
  login, because the ownership chain from `dbo.InsertUpdateCoreDescr_WellCAD`
  to `MyApps.CoreDescrData` is broken (different owners, dynamic SQL, or a
  cross-database write), or the login has an explicit `DENY`.
- This is a SQL Server authorization setting. **Changing the JSON, the backend
  or the frontend cannot fix it.**
- Do not work around it with another login, broad grants (`db_owner`,
  `db_datawriter`) or by editing the procedure.

## 9. Report to the DBA

Send:

1. Section A grid: server, database, `SqlLogin`, `DatabaseUser`.
2. Section B grids: permissions, owners, `ExecuteAs`, `Signatures`.
3. The full error grid (`FailedStep`, `ErrorNumber`, `ErrorMessage`,
   `ErrorProcedure`, `ErrorLine`, `DatabaseName`).
4. Which database the API should write to: `ACQMN01` or `ACQMN01_DEV`.

Ask the DBA to review the approved procedure's ownership chain or execution
security. The least-privilege fix is to **sign the procedure with a
certificate** whose user holds `SELECT, INSERT, UPDATE` on
`MyApps.CoreDescrData`, so the application login keeps `EXECUTE` only.
`../Sql/UploadDataPermissions.sql` contains the DBA's detailed read-only
diagnostics and that fix, for review; nothing in it runs by itself.
