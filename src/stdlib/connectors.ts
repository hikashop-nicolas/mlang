// Data-source connectors. The full connector surface is IN scope, but the DATA comes from
// the host, not from mlang: a host injects an implementation via HostBindings (the same
// mechanism as Excel.CurrentWorkbook), returning an mlang binary/table/record. Any connector
// a host does not implement is registered here as a stub that raises a typed, catchable
// error naming it, so the UI can explain the step (and offer "refresh in Excel") instead of
// failing with an opaque "name not recognized".
import type { Env } from "../interpret.js";
import { MError, type MFunction } from "../values.js";

/** MError.reason used for connectors with no host implementation. Hosts/UIs match on this. */
export const CONNECTOR_MISSING = "Connector.NotImplemented";

/** True if `e` is a "no host implementation for connector X" error. */
export function isMissingConnector(e: unknown): e is MError {
  return e instanceof MError && e.reason === CONNECTOR_MISSING;
}

/** The connector name that raised, when `isMissingConnector(e)`. */
export function missingConnectorName(e: MError): string {
  return e.detail && e.detail.kind === "text" ? e.detail.value : "";
}

// Source connectors that need host I/O. Grouped only for readability.
const CONNECTORS = [
  "Web.Contents", "Web.Page", "Web.BrowserContents",
  "File.Contents", "Folder.Contents", "Folder.Files",
  "AzureStorage.Blobs", "AzureStorage.Tables",
  "Sql.Database", "Sql.Databases",
  "OData.Feed", "Odbc.DataSource", "Odbc.Query",
  "Access.Database", "Oracle.Database", "MySQL.Database", "PostgreSQL.Database",
  "SharePoint.Contents", "SharePoint.Files", "SharePoint.Tables",
  "GoogleAnalytics.Accounts", "Salesforce.Data", "SapHana.Database",
];

export function registerConnectors(env: Env): void {
  for (const name of CONNECTORS) {
    const stub: MFunction = {
      kind: "function",
      name,
      params: [{ name: "argument", optional: true }],
      // Variadic: connectors take differing shapes; the stub ignores args and reports itself.
      call: () => {
        throw new MError(CONNECTOR_MISSING, `${name}: no host implementation for this connector (refresh in Excel, or provide it via the host).`, { kind: "text", value: name });
      },
    };
    env.defineValue(name, stub);
  }
}
