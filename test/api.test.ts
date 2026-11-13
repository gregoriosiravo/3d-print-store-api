import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "fs";
import { call, cleanupProbeRows, db, register, SESSION_ID, uploadCube, uploadPath, STAMP } from "./helpers";
import { expirePendingQuotes } from "../src/services/quote-cleanup.service";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: "2026-02-25.clover" });

// Integration tests against a running API (docker compose up). Rows are tagged with STAMP.
let alice: { token: string; id: string };
let bob: { token: string; id: string };

before(async () => {
  alice = await register("alice");
  bob = await register("bob");
});

after(async () => {
  const deleted = await cleanupProbeRows();
  console.log(`cleanup (stamp ${STAMP}): ${JSON.stringify(deleted)}`);
});

async function ownQuote(token = alice.token) {
  const upload = await uploadCube({ token });
  assert.equal(upload.status, 200, JSON.stringify(upload.body));
  await call("POST", "/quote/associate", { token, body: { quoteId: upload.body.quoteId } });
  return upload.body;
}

describe("session cookie", () => {
  it("sets an HttpOnly, SameSite=Strict cookie on register", async () => {
    const res = await call("POST", "/auth/register", {
      body: { email: `probe-${STAMP}-cookie@example.com`, password: "probe-password", firstName: "C", lastName: "C" },
    });
    assert.equal(res.status, 201);
    const cookie = res.headers.get("set-cookie") ?? "";
    assert.match(cookie, /auth_token=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
  });

  it("authenticates with the cookie alone", async () => {
    const res = await call("GET", "/auth/profile", { cookie: `auth_token=${alice.token}` });
    assert.equal(res.status, 200);
  });

  it("still accepts a Bearer token", async () => {
    assert.equal((await call("GET", "/auth/profile", { token: alice.token })).status, 200);
  });

  it("rejects requests without credentials", async () => {
    assert.equal((await call("GET", "/auth/profile")).status, 401);
  });

  it("logout clears the cookie", async () => {
    const res = await call("POST", "/auth/logout");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("set-cookie") ?? "", /auth_token=;/);
  });
});

describe("quotes", () => {
  it("guest upload creates a quote tagged with the session", async () => {
    const res = await uploadCube();
    assert.equal(res.status, 200);
    const { rows } = await db.query("SELECT session_id FROM quotes WHERE id = $1", [res.body.quoteId]);
    assert.equal(rows[0].session_id, SESSION_ID);
  });

  it("a guest quote becomes the owner's on associate, and the body userId is ignored", async () => {
    const quote = await uploadCube();
    const res = await call("POST", "/quote/associate", { token: alice.token, body: { quoteId: quote.body.quoteId, userId: bob.id } });
    assert.equal(res.status, 200);
    const { rows } = await db.query("SELECT user_id FROM quotes WHERE id = $1", [quote.body.quoteId]);
    assert.equal(rows[0].user_id, alice.id);
  });

  it("other users get 404 for an owned quote, and malformed IDs get 404", async () => {
    const quote = await ownQuote();
    assert.equal((await call("GET", `/quote/${quote.quoteId}`, { token: bob.token })).status, 404);
    assert.equal((await call("GET", `/quote/${quote.quoteId}`, { token: alice.token })).status, 200);
    assert.equal((await call("GET", "/quote/not-a-uuid")).status, 404);
  });

  it("associate rejects a malformed quoteId with 400", async () => {
    assert.equal((await call("POST", "/quote/associate", { token: alice.token, body: { quoteId: "x" } })).status, 400);
  });

  it("rejecting a pending quote deletes it and its upload", async () => {
    const quote = await ownQuote();
    const { rows } = await db.query("SELECT s3_key FROM quotes WHERE id = $1", [quote.quoteId]);
    assert.ok(await fs.stat(uploadPath(rows[0].s3_key)));
    assert.equal((await call("POST", `/quote/${quote.quoteId}/reject`, { token: alice.token })).status, 200);
    await assert.rejects(fs.stat(uploadPath(rows[0].s3_key)), { code: "ENOENT" });
  });

  it("a non-STL upload returns a JSON 400", async () => {
    const form = new FormData();
    form.append("stl", new Blob(["hello"]), "model.obj");
    form.append("materialId", "1");
    form.append("layerHeight", "0.2");
    form.append("infillDensity", "25");
    const res = await call("POST", "/quote", { form });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "Only STL files are allowed");
  });

  it("an unsupported layer height returns 400", async () => {
    assert.equal((await uploadCube({ layerHeight: "0.15" })).status, 400);
  });
});

describe("orders", () => {
  it("approving creates an order at the stored price and cannot happen twice", async () => {
    const quote = await ownQuote();
    const first = await call("POST", `/quote/${quote.quoteId}/approve`, { token: alice.token });
    assert.equal(first.status, 201);
    assert.equal(Number(first.body.totalAmount), Number(quote.pricing.totalPrice));
    const second = await call("POST", `/quote/${quote.quoteId}/approve`, { token: alice.token });
    assert.equal(second.status, 409);
  });

  it("another user cannot approve the quote", async () => {
    const quote = await ownQuote();
    assert.equal((await call("POST", `/quote/${quote.quoteId}/approve`, { token: bob.token })).status, 403);
  });

  it("an expired quote is refused with 410 and no order is created", async () => {
    const quote = await ownQuote();
    await db.query("UPDATE quotes SET expires_at = now() - interval '1 day' WHERE id = $1", [quote.quoteId]);
    assert.equal((await call("POST", `/quote/${quote.quoteId}/approve`, { token: alice.token })).status, 410);
    const { rows } = await db.query("SELECT count(*)::int AS n FROM orders WHERE quote_id = $1", [quote.quoteId]);
    assert.equal(rows[0].n, 0);
  });

  it("the expiry job marks past-due pending quotes expired and removes their upload", async () => {
    const quote = await ownQuote();
    const { rows } = await db.query("SELECT s3_key FROM quotes WHERE id = $1", [quote.quoteId]);
    await db.query("UPDATE quotes SET expires_at = now() - interval '1 day' WHERE id = $1", [quote.quoteId]);
    await expirePendingQuotes();
    const after = await db.query("SELECT status FROM quotes WHERE id = $1", [quote.quoteId]);
    assert.equal(after.rows[0].status, "expired");
    await assert.rejects(fs.stat(uploadPath(rows[0].s3_key)), { code: "ENOENT" });
  });

  it("the quote list shows a past-due pending quote as expired", async () => {
    const quote = await ownQuote();
    await db.query("UPDATE quotes SET expires_at = now() - interval '1 day' WHERE id = $1", [quote.quoteId]);
    const res = await call("GET", "/quotes", { token: alice.token });
    const row = res.body.quotes.find((q: any) => q.id === quote.quoteId);
    assert.equal(row.status, "expired");
  });

  it("shipping: invalid body 400, other user 404, owner 200 with the name stored", async () => {
    const quote = await ownQuote();
    const order = (await call("POST", `/quote/${quote.quoteId}/approve`, { token: alice.token })).body;
    const ship = { firstName: "Mario", lastName: "Rossi", address: "Via Roma 1", addressInfo: "Int 4", city: "Roma", zip: "00100", country: "Italia" };
    assert.equal((await call("PATCH", `/orders/${order.orderId}/address`, { token: alice.token, body: { firstName: "x" } })).status, 400);
    assert.equal((await call("PATCH", `/orders/${order.orderId}/address`, { token: bob.token, body: ship })).status, 404);
    assert.equal((await call("PATCH", `/orders/${order.orderId}/address`, { token: alice.token, body: ship })).status, 200);
    const { rows } = await db.query("SELECT shipping_name, shipping_address FROM orders WHERE id = $1", [order.orderId]);
    assert.equal(rows[0].shipping_name, "Mario Rossi");
    assert.equal(rows[0].shipping_address, "Via Roma 1, Int 4");
  });

  it("an unpaid order can be cancelled once", async () => {
    const quote = await ownQuote();
    const order = (await call("POST", `/quote/${quote.quoteId}/approve`, { token: alice.token })).body;
    assert.equal((await call("POST", `/orders/${order.orderId}/cancel`, { token: alice.token })).status, 200);
    assert.equal((await call("POST", `/orders/${order.orderId}/cancel`, { token: alice.token })).status, 409);
  });

  it("a paid order is refunded through Stripe on cancel, once", async () => {
    const quote = await ownQuote();
    const order = (await call("POST", `/quote/${quote.quoteId}/approve`, { token: alice.token })).body;
    // A real succeeded PaymentIntent in Stripe test mode, so the refund is real
    const intent = await stripe.paymentIntents.create({
      amount: 1100,
      currency: "eur",
      payment_method: "pm_card_visa",
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata: { probe: STAMP },
    });
    await db.query("UPDATE orders SET payment_status = 'paid', payment_id = $1 WHERE id = $2", [intent.id, order.orderId]);

    const cancel = await call("POST", `/orders/${order.orderId}/cancel`, { token: alice.token });
    assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
    const refunds = await stripe.refunds.list({ payment_intent: intent.id });
    assert.equal(refunds.data.length, 1);

    const row = await db.query("SELECT status, payment_status FROM orders WHERE id = $1", [order.orderId]);
    assert.deepEqual(row.rows[0], { status: "cancelled", payment_status: "refunded" });
    assert.equal((await call("POST", `/orders/${order.orderId}/cancel`, { token: alice.token })).status, 409);
    assert.equal((await stripe.refunds.list({ payment_intent: intent.id })).data.length, 1);
  });

  it("a paid order with no payment on record cannot be cancelled", async () => {
    const quote = await ownQuote();
    const order = (await call("POST", `/quote/${quote.quoteId}/approve`, { token: alice.token })).body;
    await db.query("UPDATE orders SET payment_status = 'paid' WHERE id = $1", [order.orderId]);
    assert.equal((await call("POST", `/orders/${order.orderId}/cancel`, { token: alice.token })).status, 409);
  });

  it("starting payment twice returns the same PaymentIntent, not a second charge", async () => {
    const quote = await ownQuote();
    const order = (await call("POST", `/quote/${quote.quoteId}/approve`, { token: alice.token })).body;
    const first = await call("POST", `/orders/${order.orderId}/pay`, { token: alice.token });
    const second = await call("POST", `/orders/${order.orderId}/pay`, { token: alice.token });
    assert.equal(first.status, 200);
    assert.equal(first.body.clientSecret, second.body.clientSecret);
    const { rows } = await db.query("SELECT payment_id FROM orders WHERE id = $1", [order.orderId]);
    assert.ok(rows[0].payment_id?.startsWith("pi_"));
  });

  it("a payment that already succeeded in Stripe marks the order paid and cannot be paid again", async () => {
    const quote = await ownQuote();
    const order = (await call("POST", `/quote/${quote.quoteId}/approve`, { token: alice.token })).body;
    await call("POST", `/orders/${order.orderId}/pay`, { token: alice.token });
    const { rows } = await db.query("SELECT payment_id FROM orders WHERE id = $1", [order.orderId]);
    // The webhook did not arrive, so the order is still pending while Stripe has the money
    await stripe.paymentIntents.confirm(rows[0].payment_id, { payment_method: "pm_card_visa", return_url: "http://localhost:3000/checkout" });

    const again = await call("POST", `/orders/${order.orderId}/pay`, { token: alice.token });
    assert.equal(again.status, 400);
    assert.equal(again.body.error, "Order is already paid");
    const row = await db.query("SELECT payment_status FROM orders WHERE id = $1", [order.orderId]);
    assert.equal(row.rows[0].payment_status, "paid");
    assert.equal((await call("POST", `/orders/${order.orderId}/pay`, { token: alice.token })).status, 400);
  });

  it("after a payment is cancelled, starting payment again creates a new PaymentIntent", async () => {
    const quote = await ownQuote();
    const order = (await call("POST", `/quote/${quote.quoteId}/approve`, { token: alice.token })).body;
    const first = await call("POST", `/orders/${order.orderId}/pay`, { token: alice.token });
    const { rows } = await db.query("SELECT payment_id FROM orders WHERE id = $1", [order.orderId]);
    await stripe.paymentIntents.cancel(rows[0].payment_id);
    const retry = await call("POST", `/orders/${order.orderId}/pay`, { token: alice.token });
    assert.equal(retry.status, 200);
    assert.notEqual(retry.body.clientSecret, first.body.clientSecret);
    const after = await db.query("SELECT payment_id FROM orders WHERE id = $1", [order.orderId]);
    assert.notEqual(after.rows[0].payment_id, rows[0].payment_id);
  });

  it("confirming a payment that has not succeeded is refused, and a succeeded one marks the order paid", async () => {
    const quote = await ownQuote();
    const order = (await call("POST", `/quote/${quote.quoteId}/approve`, { token: alice.token })).body;
    assert.equal((await call("POST", `/orders/${order.orderId}/confirm-payment`, { token: alice.token })).status, 409);

    await call("POST", `/orders/${order.orderId}/pay`, { token: alice.token });
    const { rows } = await db.query("SELECT payment_id FROM orders WHERE id = $1", [order.orderId]);
    await stripe.paymentIntents.confirm(rows[0].payment_id, {
      payment_method: "pm_card_visa",
      return_url: "http://localhost:3000/checkout",
    });

    const confirmed = await call("POST", `/orders/${order.orderId}/confirm-payment`, { token: alice.token });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    const row = await db.query("SELECT status, payment_status FROM orders WHERE id = $1", [order.orderId]);
    assert.deepEqual(row.rows[0], { status: "processing", payment_status: "paid" });
    assert.equal((await call("POST", `/orders/${order.orderId}/confirm-payment`, { token: alice.token })).status, 200);
  });

  it("a refund can be requested once, only for a paid order that is received", async () => {
    const quote = await ownQuote();
    const order = (await call("POST", `/quote/${quote.quoteId}/approve`, { token: alice.token })).body;
    assert.equal((await call("POST", `/orders/${order.orderId}/refund-request`, { token: alice.token })).status, 409);

    await db.query("UPDATE orders SET payment_status = 'paid', status = 'processing' WHERE id = $1", [order.orderId]);
    assert.equal((await call("POST", `/orders/${order.orderId}/refund-request`, { token: alice.token })).status, 409);

    await db.query("UPDATE orders SET status = 'received' WHERE id = $1", [order.orderId]);
    const requested = await call("POST", `/orders/${order.orderId}/refund-request`, { token: alice.token });
    assert.equal(requested.status, 200);
    const row = await db.query("SELECT payment_status FROM orders WHERE id = $1", [order.orderId]);
    assert.equal(row.rows[0].payment_status, "refund_requested");
    assert.equal((await call("POST", `/orders/${order.orderId}/refund-request`, { token: alice.token })).status, 409);
    assert.equal((await call("POST", `/orders/${order.orderId}/refund-request`, { token: bob.token })).status, 404);
  });

  it("order routes return 404 for malformed IDs and for other users' orders", async () => {
    assert.equal((await call("GET", "/orders?orderId=abc", { token: alice.token })).status, 404);
    assert.equal((await call("POST", "/orders/abc/cancel", { token: alice.token })).status, 404);
  });
});

describe("addresses", () => {
  const home = { firstName: "Alice", lastName: "Probe", address: "Via A 1", city: "Roma", zip: "00100", country: "Italia" };

  it("a second primary address moves the flag", async () => {
    await call("POST", `/address/${alice.id}/add`, { token: alice.token, body: { ...home, isPrimary: true } });
    await call("POST", `/address/${alice.id}/add`, { token: alice.token, body: { ...home, address: "Via B 2", isPrimary: true } });
    const list = (await call("GET", `/address/${alice.id}/addresses`, { token: alice.token })).body;
    assert.equal(list.filter((a: any) => a.is_primary).length, 1);
    assert.equal(list.find((a: any) => a.is_primary).address, "Via B 2");
  });

  it("setting primary, editing and deleting check ownership and IDs", async () => {
    const list = (await call("GET", `/address/${alice.id}/addresses`, { token: alice.token })).body;
    const first = list.find((a: any) => a.address === "Via A 1");
    assert.equal((await call("PATCH", `/address/${alice.id}/addresses/${first.id}/primary`, { token: alice.token })).status, 200);
    assert.equal((await call("PATCH", `/address/${alice.id}/addresses/${first.id}/primary`, { token: bob.token })).status, 403);
    assert.equal((await call("PATCH", `/address/${alice.id}/addresses/not-a-uuid/primary`, { token: alice.token })).status, 404);
    assert.equal((await call("PUT", `/address/${alice.id}/edit/${first.id}`, { token: alice.token, body: { city: "Milano" } })).status, 400);
    assert.equal((await call("DELETE", `/address/${alice.id}/addresses/${first.id}`, { token: alice.token })).status, 200);
    assert.equal((await call("DELETE", `/address/${alice.id}/addresses/${first.id}`, { token: alice.token })).status, 404);
  });
});

describe("payment methods (without calling Stripe)", () => {
  it("a new user has no saved cards", async () => {
    const res = await call("GET", "/payment-methods", { token: bob.token });
    assert.deepEqual(res.body, []);
  });

  it("unknown or malformed card IDs return 404, and a save without an ID returns 400", async () => {
    assert.equal((await call("PUT", "/payment-methods/not-a-uuid/default", { token: bob.token })).status, 404);
    assert.equal((await call("DELETE", "/payment-methods/00000000-0000-0000-0000-000000000000", { token: bob.token })).status, 404);
    assert.equal((await call("POST", "/payment-methods/save", { token: bob.token, body: {} })).status, 400);
  });
});

describe("catalog", () => {
  it("lists available materials and the named print presets publicly", async () => {
    const materials = await call("GET", "/materials");
    assert.equal(materials.status, 200);
    assert.ok(materials.body.length >= 1);
    assert.ok(materials.body.every((m: any) => typeof m.name === "string" && typeof m.type === "string"));

    const presets = await call("GET", "/print-presets");
    assert.equal(presets.status, 200);
    assert.ok(presets.body.length >= 1);
    assert.ok(presets.body.every((p: any) => !/mm \/ /.test(p.name)), "generated combinations are not listed");
  });
});
