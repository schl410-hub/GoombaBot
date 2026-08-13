#!/usr/bin/env node
/**
 * verify-es5.js
 * --------------
 * main.js가 메신저봇R(Rhino, ES5)에서 컴파일 가능한지 최대한 엄격하게 검증한다.
 * - acorn(ecmaVersion: 5)로 진짜 ES5 문법만 허용하는지 확인 (trailing comma in call 등 차단)
 * - 문자열/주석을 인식하는 스캐너로 남은 trailing comma가 있는지 이중 확인
 * - try without catch(그리고 without finally도) 있는지 AST로 확인
 *
 * 사용법: node verify-es5.js <파일경로>
 */
var path = process.argv[2];
if (!path) {
  console.error("사용법: node verify-es5.js <main.js 경로>");
  process.exit(1);
}

var fs = require("fs");
var acorn = require("acorn");
var code = fs.readFileSync(path, "utf-8");
var failed = false;

// 1) acorn ES5 strict parse
var ast;
try {
  ast = acorn.parse(code, { ecmaVersion: 5, locations: true });
  console.log("[OK] acorn(ecmaVersion:5) 파싱 성공");
} catch (e) {
  failed = true;
  console.log("[FAIL] acorn(ES5) 파싱 실패: " + e.message);
}

// 2) node --check와 동급의 기본 문법 확인 (참고용, acorn이 더 엄격하므로 보조 수단)
try {
  new Function(code);
  console.log("[OK] new Function()으로도 파싱 가능 (참고용 - V8 기준이라 acorn보다 관대함)");
} catch (e) {
  console.log("[WARN] new Function() 실패 (acorn만큼 신뢰하지 않음): " + e.message);
}

// 3) trailing comma 스캐너 (문자열/주석 인식)
(function () {
  var n = code.length;
  var i = 0;
  var inStr = null;
  var inLineComment = false;
  var inBlockComment = false;
  var found = [];

  while (i < n) {
    var c = code.charAt(i);
    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (c === "*" && code.charAt(i + 1) === "/") {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inStr) {
      if (c === "\\") { i += 2; continue; }
      if (c === inStr) inStr = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'") { inStr = c; i++; continue; }
    if (c === "/" && code.charAt(i + 1) === "/") { inLineComment = true; i++; continue; }
    if (c === "/" && code.charAt(i + 1) === "*") { inBlockComment = true; i++; continue; }
    if (c === ",") {
      var j = i + 1;
      while (j < n && " \t\r\n".indexOf(code.charAt(j)) !== -1) j++;
      if (j < n && ")]}".indexOf(code.charAt(j)) !== -1) {
        found.push(code.slice(Math.max(0, i - 30), j + 1).replace(/\n/g, "\\n"));
      }
    }
    i++;
  }

  if (found.length === 0) {
    console.log("[OK] trailing comma 없음");
  } else {
    failed = true;
    console.log("[FAIL] trailing comma " + found.length + "건 발견:");
    found.forEach(function (f) { console.log("   - " + f); });
  }
})();

// 4) try without catch(그리고 without finally) 확인 - AST 순회
if (ast) {
  var badTry = [];
  (function walk(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "TryStatement" && !node.handler && !node.finalizer) {
      badTry.push(node.loc ? node.loc.start.line : "?");
    }
    for (var key in node) {
      if (key === "loc" || key === "range") continue;
      var val = node[key];
      if (Array.isArray(val)) { val.forEach(walk); }
      else if (val && typeof val.type === "string") { walk(val); }
    }
  })(ast);

  if (badTry.length === 0) {
    console.log("[OK] catch/finally 없는 try 없음");
  } else {
    failed = true;
    console.log("[FAIL] catch/finally 둘 다 없는 try " + badTry.length + "건: line " + badTry.join(", "));
  }
}

console.log("");
console.log(failed ? "=== 종합 결과: 실패 (Rhino에서 컴파일 안 될 가능성 높음) ===" : "=== 종합 결과: 통과 ===");
process.exit(failed ? 1 : 0);
