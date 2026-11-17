import { readConfig } from "../config.js";
import { SheetsRepository } from "../repository.js";
import { acquireWriterLock } from "../writer-lock.js";
const config = readConfig();
const release = await acquireWriterLock(config.spreadsheetId);
try {
  await new SheetsRepository(config).initialize();
  console.log(
    "All EasyManage worksheets and required columns initialized. Existing rows were preserved.",
  );
} finally {
  await release();
}
