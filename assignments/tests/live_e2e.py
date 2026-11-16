#!/usr/bin/env python3
"""
Full dry run of assignment 1 against the deployed Apps Script web app, before students get in.

Eight test students (IDs 99999000x) go through every stage: registration, stage A alone and in
pairs, the error paths, peer review, an error flag, grades. Between stages the script stops and
tells you which menu item to run in the Sheet ("מטלה 1" menu, items are numbered), then checks
what the server returns. At the end, the menu's reset item removes all test data.

Usage:
  python assignments/tests/live_e2e.py https://script.google.com/macros/s/XXXX/exec
Rehearsal without Google (admin steps are automatic):
  node assignments/tests/fake_server.js &
  python assignments/tests/live_e2e.py http://localhost:8787 --auto-admin

Standard library only.
"""
import base64
import json
import sys
import urllib.request

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

if len(sys.argv) < 2:
    print(__doc__)
    sys.exit(2)
API = sys.argv[1]
AUTO = "--auto-admin" in sys.argv

STUDENTS = [  # (id, name) - names are what partners type
    ("999990001", "בדיקה אלף"), ("999990002", "בדיקה בית"), ("999990003", "בדיקה גימל"),
    ("999990004", "בדיקה דלת"), ("999990005", "בדיקה הא"), ("999990006", "בדיקה וו"),
    ("999990007", "בדיקה זין"), ("999990008", "בדיקה חית"),
]
S = {i + 1: {"id": sid, "name": name, "secret": "test-" + sid[-4:]} for i, (sid, name) in enumerate(STUDENTS)}
QN = {"gender": "נקבה", "age": 23, "height_cm": 170, "study_hours": 4,
      "screen_est_min": 200, "screen_actual_min": 260, "predicted_score": 75}

passed, failed = 0, []


def check(cond, what, resp=None):
    """resp: the server answer, so a failure shows the server's own error message."""
    global passed
    if cond:
        passed += 1
        print("  ok   " + what)
    else:
        failed.append(what)
        print("  FAIL " + what)
        if isinstance(resp, dict) and resp.get("error"):
            print("       server said: " + resp["error"])


def call(action, who=None, **kw):
    body = {"action": action}
    if who:
        body.update(id=S[who]["id"], secret=S[who]["secret"])
    body.update(kw)
    req = urllib.request.Request(API, data=json.dumps(body).encode("utf-8"),
                                 headers={"Content-Type": "text/plain;charset=utf-8"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:  # network / non-JSON
        return {"ok": False, "error": "request failed: %s" % e}


def pdf(text, author=None):
    """A small valid one-page PDF; optional /Author in the Info dictionary."""
    content = "BT /F1 24 Tf 72 720 Td (%s) Tj ET" % text
    info = "<< /Producer (live_e2e)%s >>" % (" /Author (%s)" % author if author else "")
    objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
            "<< /Length %d >>\nstream\n%s\nendstream" % (len(content), content),
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", info]
    out, offs = "%PDF-1.4\n", []
    for i, o in enumerate(objs):
        offs.append(len(out))
        out += "%d 0 obj\n%s\nendobj\n" % (i + 1, o)
    x = len(out)
    out += "xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1) + "".join("%010d 00000 n \n" % o for o in offs)
    out += "trailer\n<< /Size %d /Root 1 0 R /Info %d 0 R >>\nstartxref\n%d\n%%%%EOF" % (len(objs) + 1, len(objs), x)
    return base64.b64encode(out.encode("latin-1")).decode()


def files(tag, author=None):
    return {"question": {"name": "q.pdf", "data": pdf("Question " + tag, author)},
            "solution": {"name": "s.pdf", "data": pdf("Solution " + tag)}}


def admin(step, instructions, rows=None):
    print()
    if AUTO:
        r = call("__admin", step=step, rows=rows)
        if not r.get("ok"):
            print("  admin step failed: " + str(r.get("error")))
            sys.exit(1)
        return r.get("result")
    print("=" * 70)
    print(instructions)
    print("=" * 70)
    input("Press Enter when done... ")
    return None


def wait_for_phase(want, hint):
    """Ask the server which stage is open; if it is not the expected one, say which setting is off and wait."""
    while True:
        ph = call("config").get("phase", {})
        bad = [k for k, v in want.items() if ph.get(k) is not v]
        if not bad or AUTO:
            return
        print("\n  The server's stage is not what this step needs (%s)." % ", ".join(bad))
        print("  " + hint)
        print("  Tip: a date cell must be a real date (the Sheet aligns it to the right); text such as an odd format is ignored.")
        input("  Fix it in Settings, then press Enter to check again... ")


def submit_a(who, mode="alone", partner="", f=None, qn=None):
    return call("submitStageA", who, workMode=mode, partnerName=partner, questionnaire=qn or QN, files=f)


# ------------------------------------------------------------------ setup
print("Assignment 1 dry run against " + API)
rows = [[s["id"], s["name"], ""] for s in S.values()]
admin("prepare", "In the Sheet, tab Settings:\n"
      "  AUTH_MODE         = register\n"
      "  SUBMIT_DEADLINE   = a date in the future (e.g. next week)\n"
      "  REVIEW_OPEN       = empty\n"
      "  RESULTS_PUBLISHED = FALSE")
admin("addStudents", "Tab Students, below the last row. Paste in two steps so each value lands in its own column:\n"
      "  a) select the first empty cell in column A and paste these 8 IDs:\n" +
      "\n".join("       " + r[0] for r in rows) +
      "\n  b) select the cell next to the first ID, in column B, and paste these 8 names:\n" +
      "\n".join("       " + r[1] for r in rows) +
      "\n  Check: column B holds the names, column C (email) stays empty.", rows)

wait_for_phase({"canSubmit": True}, "Stage A should be open: SUBMIT_DEADLINE must be a future date.")
print("\n[1] config and registration")
c = call("config")
check(c.get("ok") and c.get("authMode") == "register", "config answers, AUTH_MODE is register")
check(c.get("phase", {}).get("canSubmit") is True, "stage A is open")
for k in S:
    r = call("register", k)
    check(r.get("ok"), "register %s" % S[k]["id"])
check(not call("register", None, id="999990099", secret="abcdef").get("ok"), "unknown ID cannot register")
check(not call("register", 1).get("ok"), "second registration is refused")
check(not call("login", None, id=S[1]["id"], secret="wrong-pass").get("ok"), "wrong password is refused")
check(call("login", 1).get("ok"), "login works")

print("\n[2] stage A")
r = submit_a(4, "pair", S[5]["name"])
check(not r.get("ok"), "partner cannot confirm before the uploader uploads")
r = submit_a(6, "pair", "בדיקה לא קיים", files("x"))
check(not r.get("ok") and "אין בקורס" in r.get("error", ""), "unknown partner name is refused")
r = submit_a(6, "pair", S[6]["name"], files("x"))
check(not r.get("ok"), "own name as partner is refused")
r = submit_a(6, f={"question": {"data": base64.b64encode(b"hello").decode()}, "solution": files("x")["solution"]})
check(not r.get("ok"), "a non-PDF file is refused")
r = submit_a(6, f=files("x"), qn=dict(QN, height_cm=""))
check(not r.get("ok"), "a missing questionnaire field is refused")
r = submit_a(6, f=files("x"), qn=dict(QN, gender="אחר"))
check(not r.get("ok"), "gender other than male/female is refused")

swapped = " ".join(reversed(S[2]["name"].split()))
r = submit_a(1, "pair", swapped, files("AB"))
check(r.get("ok"), "pair 1+2: student 1 uploads (partner name typed in reverse order)", r)
r = submit_a(2, "pair", S[1]["name"])
check(r.get("ok") and r["state"]["question"]["iAmUploader"] is False, "pair 1+2: student 2 confirms without files", r)
r = submit_a(5, "pair", S[4]["name"], files("DE"))
check(r.get("ok"), "pair 4+5: student 5 uploads", r)
r = submit_a(4, "pair", S[5]["name"])
check(r.get("ok"), "pair 4+5: student 4 confirms", r)
r = submit_a(3, f=files("C", author="Test Gimel"))
check(r.get("ok"), "student 3 uploads a PDF whose properties hold an author name", r)
for k in (6, 7, 8):
    r = submit_a(k, f=files(str(k)))
    check(r.get("ok"), "student %d uploads alone" % k, r)
st = {k: call("state", k)["state"] for k in S}
qid = {k: (st[k].get("question") or {}).get("id") for k in S}
check(qid[1] and qid[1] == qid[2] and qid[4] and qid[4] == qid[5], "partners share one question")
check(len(set(qid.values())) == 6 and None not in qid.values(), "6 questions in total")
r = submit_a(1, "pair", S[2]["name"], files("AB-v2"))
check(r.get("ok") and r["state"]["question"]["id"] == qid[1], "re-upload keeps the same question id", r)
if len(set(qid.values())) != 6 or None in qid.values():
    print("\nStage A did not produce the 6 questions the next stages need (two pairs + four singles).")
    print("Fix the cause above, run the menu's reset item, set SUBMIT_DEADLINE back to the future, and start again.")
    print("\n%d passed, %d failed" % (passed, len(failed)))
    sys.exit(1)

admin("closeAndAssign", "Close stage A and assign reviewers:\n"
      "  1. Settings: SUBMIT_DEADLINE = a time that has already passed (e.g. yesterday)\n"
      "  2. Menu 'מטלה 1' > item 3 (assign reviewers). Expect: 8 reviewers, 6 questions.")

wait_for_phase({"canSubmit": False, "canReview": True},
               "Stage B should be open: SUBMIT_DEADLINE in the past, REVIEW_DEADLINE in the future, REVIEW_OPEN empty, "
               "and item 3 (assign reviewers) must have run.")
print("\n[3] stage B")
r = submit_a(6, f=files("late"))
check(not r.get("ok"), "stage A is closed after the deadline")
st = {k: call("state", k)["state"] for k in S}
for k in S:
    items = (st[k].get("review") or {}).get("items", [])
    check(len(items) == 4 and qid[k] not in [i["question"] for i in items], "student %d got 4 questions, none their own" % k)
mine1 = [i["question"] for i in st[1]["review"]["items"]]
foreign = [q for q in set(qid.values()) if q not in mine1 and q != qid[1]]
if foreign:
    check(not call("file", 1, question=foreign[0], kind="question").get("ok"), "a question that was not assigned cannot be downloaded")
f1 = call("file", 1, question=mine1[0], kind="question")
check(f1.get("ok") and base64.b64decode(f1["data"]).startswith(b"%PDF"), "an assigned question downloads as a PDF")
check(call("file", 1, question=mine1[0], kind="solution").get("ok"), "the solution downloads (the opening is logged in Assignments)")
holder = next((k for k in S if qid[3] in [i["question"] for i in st[k]["review"]["items"]]), None)
if holder:
    raw = base64.b64decode(call("file", holder, question=qid[3], kind="question")["data"])
    check(b"Test Gimel" not in raw and b"/Author" in raw, "author name was removed from the PDF properties")

bad = [{"question": q, "score": 101, "flagged": False, "aiLike": 2} for q in mine1]
check(not call("submitReview", 1, items=bad, ranking=mine1, justification="x" * 90).get("ok"), "score above 100 is refused")
ok_items = [{"question": q, "score": 70, "flagged": False, "aiLike": 2} for q in mine1]
check(not call("submitReview", 1, items=[{"question": q, "score": 70, "flagged": False} for q in mine1], ranking=mine1,
                justification="x" * 90).get("ok"), "the chatbot-likeness rating is required")
check(not call("submitReview", 1, items=ok_items, ranking=mine1, justification="short").get("ok"), "short justification is refused")

flagged_q = mine1[0]
for k in range(1, 8):  # student 8 does not review
    items = st[k]["review"]["items"]
    qs = [i["question"] for i in items]
    ranking = sorted(qs)  # a consistent "quality" order shared by all reviewers
    its = [{"question": q, "score": 60 + 5 * sorted(qs).index(q), "flagged": False, "aiLike": 1 + sorted(qs).index(q)} for q in qs]
    if k == 1:
        its[0].update(flagged=True, flagText="סעיף ב: התשובה הנכונה היא 3/7 ולא 2/7")
    r = call("submitReview", k, items=its, ranking=ranking,
             justification="הדירוג לפי בהירות, כיסוי החומר והאם צריך להבין ולא רק להציב בנוסחה. " * 2)
    check(r.get("ok"), "student %d submits a review" % k, r)

r = call("submitFeedback", 1, learned=4, fairness=5, comment="בדיקה: משוב אנונימי")
check(r.get("ok") and r["state"]["feedback"]["done"] is True, "student 1 sends anonymous feedback", r)
check(not call("submitFeedback", 1, learned=3, fairness=3).get("ok"), "feedback can be sent only once")
check(not call("submitFeedback", 2, learned=9, fairness=3).get("ok"), "feedback scale is 1-5")

admin("grade", "Grade:\n"
      "  1. Menu 'מטלה 1' > item 4 (refresh flags). Expect 1 flag.\n"
      "  2. Tab Flags: write TRUE in column 'confirmed' of that row.\n"
      "  3. Menu > item 5 (compute grades). It warns about nothing unchecked.\n"
      "  4. Settings: RESULTS_PUBLISHED = TRUE")

wait_for_phase({"resultsPublished": True}, "Results should be published: RESULTS_PUBLISHED = TRUE (after item 5).")
print("\n[4] results")
res = {k: (call("state", k)["state"].get("results")) for k in S}
check(all(res[k] for k in S), "every student sees a result")
if all(res[k] for k in S):
    for k in S:
        g = res[k]
        check(abs(g["total"] - (g["valid"] + g["competitive"] + g["bonus"])) < 1e-9, "student %d: total = 3-part sum (%s)" % (k, g["total"]))
    check(res[1]["bonus"] == 0.5, "student 1 got the 0.5 bonus for the confirmed flag")
    check(res[8]["competitive"] == 0 and res[8]["reviewComplete"] is False, "student 8 (no review) gets no competitive points")
    authors = [k for k in S if qid[k] == flagged_q]
    check(all(res[k]["valid"] == 0 for k in authors), "authors of the flagged question lose the 3 points")
    check(res[1]["competitive"] == res[2]["competitive"] and res[4]["competitive"] == res[5]["competitive"],
          "partners get the same competitive points")
    check({res[k]["competitive"] for k in range(1, 8)} != {0}, "competitive points were handed out")

out = admin("exportAndReset", "Finish:\n"
            "  1. Menu > item 6 (export). Look at Export_Students / Export_Reviews and tab Feedback: no IDs, no names.\n"
            "  2. Menu > last item (reset test data), type מחק.\n"
            "  3. Settings: put back AUTH_MODE = code, the real deadlines, RESULTS_PUBLISHED = FALSE.")
if AUTO and out is not None:
    check(out.get("exportLeaks") == 0, "export holds no IDs or names, and every row has an anonymous id")
    check(out.get("questionsLeft") == 0, "reset removed all test data")

print("\n%d passed, %d failed" % (passed, len(failed)))
for f in failed:
    print("  - " + f)
sys.exit(1 if failed else 0)
