// 서버 저장 전에 학기 미선택·N/A·빈 값과 원문 메타데이터가 걸러지는지 검사한다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const file = path.join(__dirname, '../lib/transcript.ts');
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const testModule = { exports: {} };
new Function('module', 'exports', code)(testModule, testModule.exports);
const { transcriptPayload, transcriptGroup } = testModule.exports;
const row = { term: null, source_year: 2026, source_semester: 1, course_name: 'Global English1', credits: 3, grade: 'D+', area: '자유 선택', source_line: '원문' };
assert.equal(transcriptPayload(row, undefined), null);
assert.equal(transcriptPayload({ ...row, excluded: true, grade: null, raw_grade: 'N/A' }, '1-1'), null);
for (const change of [{ grade: null }, { grade: 'N/A' }, { area: '' }, { credits: null }, { credits: NaN }]) {
  assert.equal(transcriptPayload({ ...row, ...change }, '1-1'), null);
}
assert.deepEqual(transcriptPayload(row, '4-1'), {
  term: '4-1', course_name: 'Global English1', credits: 3, grade: 'D+', area: '자유 선택',
});
assert.equal(transcriptGroup(row, 0), '2026-1');
assert.notEqual(transcriptGroup({ ...row, source_year: null }, 0), transcriptGroup({ ...row, source_year: null }, 1));
console.log('성적 미리보기 저장 검증 통과');
