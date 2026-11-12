import { useState } from "react";
import { Text, View, Switch } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import Papa from "papaparse";
import { useAuth } from "../contexts/AuthContext";
import { usePairs } from "../hooks/usePairs";
import { MainStackParamList } from "../navigation/types";
import {
  CsvRow,
  FieldKey,
  ParsedRow,
  autoMap,
  FIELD_OPTIONS,
  MAX_FILE_BYTES,
  MAX_ROWS,
} from "../utils/csvImport";
import {
  existingTransactions,
  validateRows,
  importTransactions,
} from "../utils/importTransactions";
import { formatAmount } from "../utils/currency";
import { Screen, Card, Heading, ui, report } from "../components/Screen";
import Button from "../components/Button";
import Choices from "../components/Choices";
export default function CsvImportScreen({
  route,
}: NativeStackScreenProps<MainStackParamList, "CsvImport">) {
  const { user } = useAuth();
  const { pairs } = usePairs();
  const pair = pairs.find((p) => p.id === route.params.pairId);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, FieldKey>>({});
  const [preview, setPreview] = useState<ParsedRow[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [skip, setSkip] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState("");
  async function choose() {
    setBusy(true);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: [
          "text/csv",
          "text/comma-separated-values",
          "text/plain",
          "application/csv",
        ],
        copyToCacheDirectory: true,
      });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      const file = new File(asset.uri);
      if (file.size > MAX_FILE_BYTES)
        throw new Error("Choose a CSV smaller than 10 MB.");
      const parsed = Papa.parse<CsvRow>(await file.text(), {
        header: true,
        skipEmptyLines: "greedy",
        transformHeader: (h) => h.trim(),
      });
      if (parsed.errors.length)
        throw new Error(
          `CSV row ${parsed.errors[0].row ?? "?"}: ${parsed.errors[0].message}`,
        );
      if (
        !parsed.meta.fields?.length ||
        parsed.data.length > MAX_ROWS ||
        new Set(parsed.meta.fields).size !== parsed.meta.fields.length ||
        (parsed.meta.renamedHeaders &&
          Object.keys(parsed.meta.renamedHeaders).length)
      )
        throw new Error(
          "Use unique column headers and no more than 20,000 rows.",
        );
      setHeaders(parsed.meta.fields);
      setRows(parsed.data);
      setMapping(autoMap(parsed.meta.fields));
      setName(asset.name);
      setPreview(null);
      setResult("");
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    if (!pair) return;
    setBusy(true);
    try {
      setPreview(
        validateRows(rows, mapping, await existingTransactions(pair.id)),
      );
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!pair || !user || !preview) return;
    setBusy(true);
    setProgress(0);
    try {
      const result = await importTransactions(
        pair,
        user.uid,
        preview,
        setProgress,
      );
      setResult(
        `Imported ${result.imported}. Skipped ${result.duplicates + preview.filter((r) => r.duplicate).length} duplicates and ${preview.filter((r) => r.errors.length).length} invalid rows.`,
      );
      setPreview(null);
    } catch (e) {
      setResult(
        "Import stopped. Completed batches remain saved. Preview again to skip records already imported.",
      );
      report(e);
    } finally {
      setBusy(false);
    }
  }
  const invalid = preview?.filter((r) => r.errors.length).length || 0;
  const ready =
    preview?.filter((r) => !r.errors.length && !r.duplicate).length || 0;
  return (
    <Screen>
      <Heading>Import CSV</Heading>
      <Text style={ui.muted}>
        Imports remain pending for partner approval, including when auto-approve
        is enabled.
      </Text>
      <Button title="Choose CSV file" disabled={busy} onPress={choose} />
      {name && (
        <Text style={ui.title}>
          {name} · {rows.length} rows
        </Text>
      )}
      {headers.map((header) => (
        <Card key={header}>
          <Text style={ui.title}>{header}</Text>
          <Choices
            value={mapping[header] || "ignore"}
            options={FIELD_OPTIONS}
            onChange={(v) => {
              setMapping({ ...mapping, [header]: v });
              setPreview(null);
            }}
          />
        </Card>
      ))}
      {headers.length > 0 && (
        <Button
          title="Preview and check duplicates"
          disabled={busy}
          onPress={check}
        />
      )}
      {preview && (
        <Card>
          <Heading>{ready} ready to import</Heading>
          <Text style={ui.muted}>
            {invalid} invalid · {preview.filter((r) => r.duplicate).length}{" "}
            duplicates
          </Text>
          {preview.slice(0, 30).map((row) => (
            <Text key={row.rowNumber} style={ui.muted}>
              Row {row.rowNumber}:{" "}
              {row.errors.join(", ") ||
                `${formatAmount(row.amount || 0, pair?.currency || "USD")} · ${row.type} · ${row.date.toLocaleDateString()}${row.duplicate ? " · duplicate" : ""}`}
            </Text>
          ))}
          {preview.length > 30 && (
            <Text style={ui.muted}>
              Showing the first 30 rows. Validation covers all {preview.length}{" "}
              rows.
            </Text>
          )}
          {invalid > 0 && (
            <View style={ui.row}>
              <Switch
                accessibilityLabel="Skip invalid rows"
                value={skip}
                onValueChange={setSkip}
              />
              <Text>Skip invalid rows</Text>
            </View>
          )}
          <Button
            title={`Import ${ready} transactions`}
            disabled={busy || !ready || (invalid > 0 && !skip)}
            onPress={save}
          />
        </Card>
      )}
      {busy && (
        <Text accessibilityLiveRegion="polite" style={ui.muted}>
          Working… {progress} processed
        </Text>
      )}
      {!!result && <Text accessibilityLiveRegion="polite">{result}</Text>}
    </Screen>
  );
}
