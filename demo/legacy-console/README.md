# Legacy Console demo target

A deliberately awkward local browser target for the take-home vertical slice.

Run:

```bash
node demo/legacy-console/server.mjs
```

Open `http://127.0.0.1:4173`.

Interesting flow:

> Look up market `ASH-17`, stage a purchase of 25 supplies, and reach the staged-order confirmation without submitting a purchase.

The target contains:

- table-heavy old-school layout;
- an iframe workspace;
- no test ids;
- a search → detail → form → review → confirmation flow;
- `NO SUCH MARKET` as a legitimate domain outcome;
- validation errors;
- injectable slow load;
- injectable session expiry;
- injectable surprise dialog;
- a consequential `Submit purchase` boundary that should route to human approval.

This target exists to exercise Byheart. It is intentionally small enough for a reviewer to run locally and weird enough to make targeting/error handling meaningful.
