import fs from 'node:fs'
import path from 'node:path'
import { NewRecruitImporter } from '../src/importers/newRecruit'
import { create40kdcRulesDataProvider } from '../src/rulesData/40kdc'
import {
  buildArmyStratagemDiagnostic,
  formatArmyStratagemDiagnostic,
} from '../src/rulesData/40kdc/diagnostics'

const fixturePath = path.resolve(process.cwd(), 'test-data', '1700.json')
const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as unknown
const { army } = NewRecruitImporter.import(raw)
const diagnostic = buildArmyStratagemDiagnostic(army, create40kdcRulesDataProvider())

console.log(formatArmyStratagemDiagnostic(diagnostic))
