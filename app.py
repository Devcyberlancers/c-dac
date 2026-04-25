import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, abort, jsonify, redirect, request, send_from_directory


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "cdac_ctf.sqlite3"
WIKI_DIR = ROOT / "wiki"

app = Flask(__name__, static_folder="static", static_url_path="/static")

WIKI_PAGES = [
    {
        "id": "wiki-root",
        "title": "Wiki Home",
        "path": "index.html",
        "url": "/wiki/",
    },
    {
        "id": "introduction",
        "title": "Introduction",
        "path": "introduction.html",
        "url": "/wiki/introduction",
    },
    {
        "id": "architecture-application-details",
        "title": "Architecture / Application Details",
        "path": "architecture/application-details.html",
        "url": "/wiki/architecture/application-details",
    },
    {
        "id": "architecture-device-list",
        "title": "Architecture / Device List",
        "path": "architecture/device-list.html",
        "url": "/wiki/architecture/device-list",
    },
    {
        "id": "architecture-networking",
        "title": "Architecture / Networking",
        "path": "architecture/networking.html",
        "url": "/wiki/architecture/networking",
    },
    {
        "id": "sensor-network-hld",
        "title": "Sensor Network / HLD",
        "path": "sensor-network/hld.html",
        "url": "/wiki/sensor-network/hld",
    },
    {
        "id": "device-management-table",
        "title": "Device Management / Table",
        "path": "device-management/table.html",
        "url": "/wiki/device-management/table",
    },
    {
        "id": "operations-manual",
        "title": "Operational Manual",
        "path": "operations/manual.html",
        "url": "/wiki/operations/manual",
    },
    {
        "id": "logs",
        "title": "Logs",
        "path": "logs.html",
        "url": "/wiki/logs",
    },
    {
        "id": "simulations",
        "title": "Simulations",
        "path": "simulations.html",
        "url": "/wiki/simulations",
    },
    {
        "id": "attack-notes",
        "title": "Attack Notes",
        "path": "attack-notes.html",
        "url": "/wiki/attack-notes",
    },
]


SEED = {
    "agriculture": [
        {
            "id": "agri_001",
            "title": "MQTT Eavesdropping",
            "description": "An attacker has breached the LoRaWAN gateway and is intercepting MQTT telemetry messages from soil sensors. Connect to the vulnerable machine, capture the MQTT traffic on topic <code>farm/sensors/#</code>, and extract the flag hidden inside the sensor payload.",
            "points": 100,
            "flag": "FLAG{mqtt_m3ss4ge_interc3pted}",
            "hint": "Check the <code>moisture_level</code> field in the JSON payload - its value is base64-encoded and contains a surprise.",
        },
        {
            "id": "agri_002",
            "title": "Sensor Firmware Backdoor",
            "description": "A malicious firmware update was pushed to field IoT nodes. Download the firmware binary from the vulnerable machine, reverse-engineer it, and recover the hardcoded backdoor credential the attacker left behind.",
            "points": 200,
            "flag": "FLAG{backd00r_cr3d_f0und}",
            "hint": "Run <code>strings firmware.bin | grep -i \"pass\\|key\\|FLAG\"</code> and look for base64-encoded strings.",
        },
        {
            "id": "agri_003",
            "title": "API Command Injection",
            "description": "The farm management REST API has an unvalidated input field. Exploit the <code>/api/v1/field-report?field_id=</code> endpoint on the vulnerable machine to achieve remote code execution and read <code>/root/flag.txt</code>.",
            "points": 150,
            "flag": "FLAG{4pi_inj3ct10n_r00t}",
            "hint": "Try appending <code>; cat /root/flag.txt</code> to the field_id value.",
        },
    ],
    "water": [
        {
            "id": "water_001",
            "title": "SCADA HMI Auth Bypass",
            "description": "The water treatment SCADA HMI uses a legacy session management mechanism. Find the authentication bypass on the vulnerable machine, log in as an operator without valid credentials, and retrieve the session token displayed on the operator dashboard.",
            "points": 100,
            "flag": "FLAG{sc4d4_4uth_bypassed}",
            "hint": "Look at the Set-Cookie header - the session token is predictable. Also try default credentials: admin/admin.",
        },
        {
            "id": "water_002",
            "title": "Modbus Pressure Valve Manipulation",
            "description": "An attacker is sending malformed Modbus RTU packets to override pressure valve setpoints. Open Wireshark on the vulnerable machine, capture the OT network traffic, and decode the flag encoded in the malicious Function Code 0x06 frame.",
            "points": 200,
            "flag": "FLAG{modbUs_v4lv3_0wned}",
            "hint": "Filter by <code>modbus</code> in Wireshark. The Register Value in the write frame is ASCII hex.",
        },
        {
            "id": "water_003",
            "title": "OT Network Lateral Movement",
            "description": "An attacker breached the IT segment and moved laterally into the OT network through a misconfigured jump host. Analyze the audit logs on the vulnerable machine and identify the pivot IP, the protocol used, and reconstruct the flag from the log timestamps.",
            "points": 150,
            "flag": "FLAG{0T_l4ter4l_m0v3}",
            "hint": "Check <code>/var/log/auth.log</code> for SSH login events originating from 192.168.1.x addresses after 02:00 UTC.",
        },
    ],
}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def db():
    DATA_DIR.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS students (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              email TEXT NOT NULL UNIQUE,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS challenges (
              id TEXT PRIMARY KEY,
              category TEXT NOT NULL CHECK (category IN ('agriculture', 'water')),
              title TEXT NOT NULL,
              description TEXT NOT NULL,
              points INTEGER NOT NULL CHECK (points >= 0),
              flag TEXT NOT NULL,
              hint TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS submissions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
              challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
              answer TEXT NOT NULL,
              correct INTEGER NOT NULL,
              awarded_points INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS solves (
              student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
              challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
              awarded_points INTEGER NOT NULL,
              solved_at TEXT NOT NULL,
              PRIMARY KEY (student_id, challenge_id)
            );

            CREATE TABLE IF NOT EXISTS hint_usage (
              student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
              challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
              hint_count INTEGER NOT NULL DEFAULT 0,
              current_award INTEGER NOT NULL,
              updated_at TEXT NOT NULL,
              PRIMARY KEY (student_id, challenge_id)
            );
            """
        )
        count = conn.execute("SELECT COUNT(*) FROM challenges").fetchone()[0]
        if count == 0:
            seed_challenges(conn)


def seed_challenges(conn):
    ts = now_iso()
    for category, items in SEED.items():
        for item in items:
            conn.execute(
                """
                INSERT INTO challenges
                  (id, category, title, description, points, flag, hint, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item["id"],
                    category,
                    item["title"],
                    item["description"],
                    int(item["points"]),
                    item["flag"],
                    item.get("hint", ""),
                    ts,
                    ts,
                ),
            )


def row_to_challenge(row, include_flag=False):
    data = {
        "id": row["id"],
        "category": row["category"],
        "title": row["title"],
        "description": row["description"],
        "points": row["points"],
        "hint": row["hint"] or "",
    }
    if include_flag:
        data["flag"] = row["flag"]
    else:
        data["hasHint"] = bool(row["hint"])
    return data


def wiki_page_record(page_id):
    return next((page for page in WIKI_PAGES if page["id"] == page_id), None)


def wiki_page_path(page):
    path = WIKI_DIR / page["path"]
    resolved = path.resolve()
    if not resolved.is_relative_to(WIKI_DIR.resolve()) or not path.exists():
        abort(404)
    return path


def require_category(value):
    return value if value in ("agriculture", "water") else None


@app.get("/")
def home():
    return send_from_directory(ROOT, "index.html")


@app.get("/index.html")
def index_page():
    return send_from_directory(ROOT, "index.html")


@app.get("/admin.html")
def admin_page():
    return send_from_directory(ROOT, "admin.html")


@app.get("/wiki.html")
def wiki_page():
    return send_from_directory(ROOT, "wiki.html")


@app.get("/wiki")
def wiki_no_slash():
    return redirect("/wiki/")


@app.get("/wiki/")
def wiki_index():
    return send_from_directory(WIKI_DIR, "index.html")


@app.get("/wiki/<path:page>")
def wiki_nested_page(page):
    html_path = WIKI_DIR / f"{page}.html"
    if not html_path.resolve().is_relative_to(WIKI_DIR.resolve()) or not html_path.exists():
        abort(404)
    return send_from_directory(WIKI_DIR, f"{page}.html")


@app.post("/api/students")
def upsert_student():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    if not name or not email or "@" not in email:
        return jsonify({"ok": False, "msg": "Name and a valid email are required."}), 400
    ts = now_iso()
    with db() as conn:
        conn.execute(
            """
            INSERT INTO students (name, email, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(email) DO UPDATE SET name=excluded.name, updated_at=excluded.updated_at
            """,
            (name, email, ts, ts),
        )
        student = conn.execute("SELECT id, name, email FROM students WHERE email = ?", (email,)).fetchone()
    return jsonify({"ok": True, "student": dict(student)})


@app.get("/api/challenges")
def get_challenges():
    category = require_category(request.args.get("category"))
    if not category:
        return jsonify({"ok": False, "msg": "Invalid category."}), 400
    student_id = request.args.get("studentId", type=int)
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM challenges WHERE category = ? ORDER BY created_at, id",
            (category,),
        ).fetchall()
        solved = {}
        attempts = {}
        hints = {}
        if student_id:
            solved = {
                row["challenge_id"]: row["awarded_points"]
                for row in conn.execute(
                    "SELECT challenge_id, awarded_points FROM solves WHERE student_id = ?",
                    (student_id,),
                )
            }
            attempts = {
                row["challenge_id"]: row["attempts"]
                for row in conn.execute(
                    """
                    SELECT challenge_id, COUNT(*) AS attempts
                    FROM submissions
                    WHERE student_id = ?
                    GROUP BY challenge_id
                    """,
                    (student_id,),
                )
            }
            hints = {
                row["challenge_id"]: row
                for row in conn.execute(
                    "SELECT challenge_id, hint_count, current_award FROM hint_usage WHERE student_id = ?",
                    (student_id,),
                )
            }
    challenges = []
    for row in rows:
        item = row_to_challenge(row)
        hint = hints.get(row["id"])
        item["solved"] = row["id"] in solved
        item["awardedPoints"] = solved.get(row["id"], 0)
        item["attempts"] = attempts.get(row["id"], 0)
        item["hintCount"] = int(hint["hint_count"]) if hint else 0
        item["currentAward"] = int(hint["current_award"]) if hint else int(row["points"])
        challenges.append(item)
    return jsonify({"ok": True, "challenges": challenges})


@app.post("/api/hints")
def use_hint():
    payload = request.get_json(silent=True) or {}
    student_id = int(payload.get("studentId") or 0)
    challenge_id = (payload.get("challengeId") or "").strip()
    if not student_id or not challenge_id:
        return jsonify({"ok": False, "msg": "Student and challenge are required."}), 400
    ts = now_iso()
    with db() as conn:
        ch = conn.execute("SELECT id, points, hint FROM challenges WHERE id = ?", (challenge_id,)).fetchone()
        if not ch:
            return jsonify({"ok": False, "msg": "Challenge not found."}), 404
        solved = conn.execute(
            "SELECT 1 FROM solves WHERE student_id = ? AND challenge_id = ?",
            (student_id, challenge_id),
        ).fetchone()
        usage = conn.execute(
            "SELECT hint_count, current_award FROM hint_usage WHERE student_id = ? AND challenge_id = ?",
            (student_id, challenge_id),
        ).fetchone()
        if solved:
            current_award = int(usage["current_award"]) if usage else int(ch["points"])
            hint_count = int(usage["hint_count"]) if usage else 0
        else:
            current_award = (int(usage["current_award"]) if usage else int(ch["points"])) // 2
            hint_count = (int(usage["hint_count"]) if usage else 0) + 1
            conn.execute(
                """
                INSERT INTO hint_usage (student_id, challenge_id, hint_count, current_award, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(student_id, challenge_id)
                DO UPDATE SET hint_count=excluded.hint_count,
                              current_award=excluded.current_award,
                              updated_at=excluded.updated_at
                """,
                (student_id, challenge_id, hint_count, current_award, ts),
            )
    return jsonify({"ok": True, "hint": ch["hint"] or "", "hintCount": hint_count, "currentAward": current_award})


@app.post("/api/submissions")
def submit_answer():
    payload = request.get_json(silent=True) or {}
    student_id = int(payload.get("studentId") or 0)
    challenge_id = (payload.get("challengeId") or "").strip()
    answer = (payload.get("answer") or "").strip()
    if not student_id or not challenge_id or not answer:
        return jsonify({"ok": False, "msg": "Student, challenge, and answer are required."}), 400
    ts = now_iso()
    with db() as conn:
        ch = conn.execute("SELECT * FROM challenges WHERE id = ?", (challenge_id,)).fetchone()
        if not ch:
            return jsonify({"ok": False, "msg": "Challenge not found."}), 404
        solved = conn.execute(
            "SELECT awarded_points FROM solves WHERE student_id = ? AND challenge_id = ?",
            (student_id, challenge_id),
        ).fetchone()
        if solved:
            return jsonify({"ok": True, "already": True, "msg": "Already solved!"})
        correct = answer == ch["flag"].strip()
        awarded = 0
        if correct:
            usage = conn.execute(
                "SELECT current_award FROM hint_usage WHERE student_id = ? AND challenge_id = ?",
                (student_id, challenge_id),
            ).fetchone()
            awarded = int(usage["current_award"]) if usage else int(ch["points"])
            conn.execute(
                "INSERT INTO solves (student_id, challenge_id, awarded_points, solved_at) VALUES (?, ?, ?, ?)",
                (student_id, challenge_id, awarded, ts),
            )
        conn.execute(
            """
            INSERT INTO submissions (student_id, challenge_id, answer, correct, awarded_points, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (student_id, challenge_id, answer, 1 if correct else 0, awarded, ts),
        )
        attempts = conn.execute(
            "SELECT COUNT(*) FROM submissions WHERE student_id = ? AND challenge_id = ?",
            (student_id, challenge_id),
        ).fetchone()[0]
    if correct:
        return jsonify({"ok": True, "correct": True, "points": awarded, "msg": f"Correct! +{awarded} pts"})
    return jsonify({"ok": False, "correct": False, "attempts": attempts, "msg": f"Wrong flag. Attempt #{attempts}"})


@app.get("/api/leaderboard")
def leaderboard():
    category = require_category(request.args.get("category"))
    if not category:
        return jsonify({"ok": False, "msg": "Invalid category."}), 400
    student_id = request.args.get("studentId", type=int)
    with db() as conn:
        rows = conn.execute(
            """
            SELECT s.id, s.name,
                   COALESCE(SUM(CASE WHEN c.category = ? THEN sol.awarded_points ELSE 0 END), 0) AS score,
                   SUM(CASE WHEN c.category = ? THEN 1 ELSE 0 END) AS solved_count,
                   MAX(CASE WHEN c.category = ? THEN sol.solved_at ELSE NULL END) AS last_solved_at
            FROM students s
            LEFT JOIN solves sol ON sol.student_id = s.id
            LEFT JOIN challenges c ON c.id = sol.challenge_id
            GROUP BY s.id
            ORDER BY score DESC,
                     CASE WHEN last_solved_at IS NULL THEN 1 ELSE 0 END ASC,
                     last_solved_at ASC,
                     s.name COLLATE NOCASE ASC
            """,
            (category, category, category),
        ).fetchall()
    entries = []
    for idx, row in enumerate(rows, start=1):
        entries.append(
            {
                "rank": idx,
                "studentId": row["id"],
                "name": row["name"],
                "score": int(row["score"] or 0),
                "solvedCount": int(row["solved_count"] or 0),
            }
        )
    current = next((item for item in entries if item["studentId"] == student_id), None)
    top = [item for item in entries if item["solvedCount"] > 0][:3]
    return jsonify({"ok": True, "top": top, "current": current})


@app.get("/api/admin/challenges")
def admin_challenges():
    with db() as conn:
        rows = conn.execute("SELECT * FROM challenges ORDER BY category, created_at, id").fetchall()
    data = {"agriculture": [], "water": []}
    for row in rows:
        data[row["category"]].append(row_to_challenge(row, include_flag=True))
    return jsonify({"ok": True, "questions": data})


@app.get("/api/admin/students")
def admin_students():
    with db() as conn:
        rows = conn.execute(
            """
            SELECT s.id, s.name, s.email, s.created_at, s.updated_at,
                   COALESCE(SUM(CASE WHEN c.category = 'agriculture' THEN sol.awarded_points ELSE 0 END), 0) AS agriculture_score,
                   COALESCE(SUM(CASE WHEN c.category = 'water' THEN sol.awarded_points ELSE 0 END), 0) AS water_score,
                   SUM(CASE WHEN c.category = 'agriculture' THEN 1 ELSE 0 END) AS agriculture_solved,
                   SUM(CASE WHEN c.category = 'water' THEN 1 ELSE 0 END) AS water_solved,
                   COUNT(sol.challenge_id) AS total_solved,
                   (
                     SELECT COUNT(*)
                     FROM submissions sub
                     WHERE sub.student_id = s.id
                   ) AS attempts,
                   (
                     SELECT MAX(sub.created_at)
                     FROM submissions sub
                     WHERE sub.student_id = s.id
                   ) AS last_activity
            FROM students s
            LEFT JOIN solves sol ON sol.student_id = s.id
            LEFT JOIN challenges c ON c.id = sol.challenge_id
            GROUP BY s.id
            ORDER BY (agriculture_score + water_score) DESC,
                     last_activity DESC,
                     s.created_at DESC
            """
        ).fetchall()
    students = []
    for row in rows:
        students.append(
            {
                "id": row["id"],
                "name": row["name"],
                "email": row["email"],
                "createdAt": row["created_at"],
                "updatedAt": row["updated_at"],
                "agricultureScore": int(row["agriculture_score"] or 0),
                "waterScore": int(row["water_score"] or 0),
                "agricultureSolved": int(row["agriculture_solved"] or 0),
                "waterSolved": int(row["water_solved"] or 0),
                "totalSolved": int(row["total_solved"] or 0),
                "attempts": int(row["attempts"] or 0),
                "totalScore": int((row["agriculture_score"] or 0) + (row["water_score"] or 0)),
                "lastActivity": row["last_activity"],
            }
        )
    return jsonify({"ok": True, "students": students})


@app.get("/api/admin/wiki-pages")
def admin_wiki_pages():
    pages = []
    for page in WIKI_PAGES:
        path = WIKI_DIR / page["path"]
        pages.append(
            {
                "id": page["id"],
                "title": page["title"],
                "path": page["path"],
                "url": page["url"],
                "exists": path.exists(),
            }
        )
    return jsonify({"ok": True, "pages": pages})


@app.get("/api/admin/wiki-pages/<page_id>")
def admin_get_wiki_page(page_id):
    page = wiki_page_record(page_id)
    if not page:
        return jsonify({"ok": False, "msg": "Wiki page not found."}), 404
    path = wiki_page_path(page)
    return jsonify(
        {
            "ok": True,
            "page": {
                "id": page["id"],
                "title": page["title"],
                "path": page["path"],
                "url": page["url"],
                "content": path.read_text(encoding="utf-8"),
            },
        }
    )


@app.put("/api/admin/wiki-pages/<page_id>")
def admin_update_wiki_page(page_id):
    page = wiki_page_record(page_id)
    if not page:
        return jsonify({"ok": False, "msg": "Wiki page not found."}), 404
    payload = request.get_json(silent=True) or {}
    content = payload.get("content")
    if not isinstance(content, str) or not content.strip():
        return jsonify({"ok": False, "msg": "Page content is required."}), 400
    path = wiki_page_path(page)
    path.write_text(content, encoding="utf-8")
    return jsonify({"ok": True, "page": {"id": page["id"], "title": page["title"], "url": page["url"]}})


@app.post("/api/admin/challenges")
def create_challenge():
    payload = request.get_json(silent=True) or {}
    category = require_category(payload.get("category"))
    title = (payload.get("title") or "").strip()
    description = (payload.get("description") or "").strip()
    flag = (payload.get("flag") or "").strip()
    hint = (payload.get("hint") or "").strip()
    points = int(payload.get("points") or 0)
    if not category or not title or not description or not flag or points < 1:
        return jsonify({"ok": False, "msg": "Category, title, description, flag, and points are required."}), 400
    challenge_id = f"{category}_{int(datetime.now(timezone.utc).timestamp() * 1000)}"
    ts = now_iso()
    with db() as conn:
        conn.execute(
            """
            INSERT INTO challenges (id, category, title, description, points, flag, hint, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (challenge_id, category, title, description, points, flag, hint, ts, ts),
        )
    return jsonify({"ok": True, "id": challenge_id})


@app.put("/api/admin/challenges/<challenge_id>")
def update_challenge(challenge_id):
    payload = request.get_json(silent=True) or {}
    category = require_category(payload.get("category"))
    title = (payload.get("title") or "").strip()
    description = (payload.get("description") or "").strip()
    flag = (payload.get("flag") or "").strip()
    hint = (payload.get("hint") or "").strip()
    points = int(payload.get("points") or 0)
    if not category or not title or not description or not flag or points < 1:
        return jsonify({"ok": False, "msg": "Category, title, description, flag, and points are required."}), 400
    with db() as conn:
        cur = conn.execute(
            """
            UPDATE challenges
            SET category=?, title=?, description=?, points=?, flag=?, hint=?, updated_at=?
            WHERE id=?
            """,
            (category, title, description, points, flag, hint, now_iso(), challenge_id),
        )
        if cur.rowcount == 0:
            return jsonify({"ok": False, "msg": "Challenge not found."}), 404
    return jsonify({"ok": True})


@app.delete("/api/admin/challenges/<challenge_id>")
def delete_challenge(challenge_id):
    with db() as conn:
        cur = conn.execute("DELETE FROM challenges WHERE id = ?", (challenge_id,))
        if cur.rowcount == 0:
            return jsonify({"ok": False, "msg": "Challenge not found."}), 404
    return jsonify({"ok": True})


@app.post("/api/admin/reset-progress")
def reset_progress():
    with db() as conn:
        conn.execute("DELETE FROM submissions")
        conn.execute("DELETE FROM solves")
        conn.execute("DELETE FROM hint_usage")
    return jsonify({"ok": True})


@app.post("/api/admin/restore-defaults")
def restore_defaults():
    with db() as conn:
        conn.execute("DELETE FROM submissions")
        conn.execute("DELETE FROM solves")
        conn.execute("DELETE FROM hint_usage")
        conn.execute("DELETE FROM challenges")
        seed_challenges(conn)
    return jsonify({"ok": True})


@app.get("/api/admin/export")
def export_data():
    with db() as conn:
        questions = {"agriculture": [], "water": []}
        for row in conn.execute("SELECT * FROM challenges ORDER BY category, created_at, id"):
            questions[row["category"]].append(row_to_challenge(row, include_flag=True))
        progress = [dict(row) for row in conn.execute("SELECT * FROM solves ORDER BY solved_at")]
    return jsonify({"questions": questions, "progress": progress, "exportedAt": now_iso()})


init_db()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG") == "1")
