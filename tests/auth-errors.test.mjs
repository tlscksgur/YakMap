import assert from "node:assert/strict";
import { getAuthErrorMessage } from "../lib/auth-errors.mjs";

assert.equal(
  getAuthErrorMessage("signup", "email rate limit exceeded"),
  "이메일 인증 요청이 너무 많습니다. 잠시 후 다시 시도하세요."
);

assert.equal(
  getAuthErrorMessage("signup", "Email address \"yakmap@example.com\" is invalid"),
  "사용할 수 없는 이메일 주소입니다."
);

assert.equal(
  getAuthErrorMessage("signup", "User already registered"),
  "이미 가입된 이메일입니다."
);

assert.equal(
  getAuthErrorMessage("login", "Invalid login credentials"),
  "이메일 또는 비밀번호가 올바르지 않습니다"
);

console.log("PASS auth errors");
