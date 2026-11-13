import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isUuid } from "../src/utils/is-uuid";
import { HttpError } from "../src/utils/http-error";
import { hasAddressFields } from "../src/utils/address-fields";
import { readToken, SESSION_COOKIE } from "../src/utils/session";

describe("isUuid", () => {
  it("accepts canonical UUIDs", () => {
    assert.equal(isUuid("3f2504e0-4f89-11d3-9a0c-0305e82c3301"), true);
  });
  it("rejects malformed values", () => {
    for (const value of ["abc", "", undefined, 42, "3f2504e0-4f89-11d3-9a0c-0305e82c330"]) {
      assert.equal(isUuid(value), false, String(value));
    }
  });
});

describe("HttpError", () => {
  it("carries the status and message", () => {
    const error = new HttpError(410, "Quote has expired");
    assert.equal(error.status, 410);
    assert.equal(error.message, "Quote has expired");
    assert.ok(error instanceof Error);
  });
});

describe("hasAddressFields", () => {
  const valid = { firstName: "Mario", lastName: "Rossi", address: "Via Roma 1", city: "Roma", zip: "00100", country: "Italia" };
  it("accepts a complete address", () => {
    assert.equal(hasAddressFields(valid), true);
  });
  it("rejects blanks and missing fields", () => {
    assert.equal(hasAddressFields({ ...valid, zip: "  " }), false);
    assert.equal(hasAddressFields({ ...valid, city: undefined }), false);
    assert.equal(hasAddressFields(null), false);
  });
});

describe("readToken", () => {
  const req = (headers: Record<string, string>) => ({ headers }) as any;
  it("prefers the Bearer header", () => {
    assert.equal(readToken(req({ authorization: "Bearer abc", cookie: `${SESSION_COOKIE}=xyz` })), "abc");
  });
  it("reads the session cookie among other cookies", () => {
    assert.equal(readToken(req({ cookie: `theme=dark; ${SESSION_COOKIE}=a%2Bb; other=1` })), "a+b");
  });
  it("returns undefined without credentials", () => {
    assert.equal(readToken(req({})), undefined);
  });
});
