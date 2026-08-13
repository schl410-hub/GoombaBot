/**
 * scripts/build-base64.js
 * -------------------------
 * main.js를 base64로 인코딩해서 main.js.b64를 만든다. (내부 처리용 - 사용자는
 * 이 파일이 뭔지 몰라도 됨, GitHub에 이 파일만 그대로 올리면 된다)
 */
var fs = require("fs");
var path = require("path");

var mainJsPath = path.join(__dirname, "..", "main.js");
var outPath = path.join(__dirname, "..", "main.js.b64");

var code = fs.readFileSync(mainJsPath, "utf-8");
var b64 = Buffer.from(code, "utf-8").toString("base64");

fs.writeFileSync(outPath, b64);
console.log("main.js.b64 생성 완료 - 원본 " + code.length + "자 -> base64 " + b64.length + "자");
