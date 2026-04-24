/**
 * ctf.js — CDAC Smart Systems CTF Engine
 * All data stored in localStorage (no backend needed).
 * Keys:
 *   cdac_ctf_data     — question bank (admin-managed)
 *   cdac_ctf_progress — user submissions & solved list
 */
window.CTF = (function () {
  'use strict';

  const DATA_KEY     = 'cdac_ctf_data';
  const PROGRESS_KEY = 'cdac_ctf_progress';

  /* ─── Default seed questions ─────────────────────────────── */
  const SEED = {
    agriculture: [
      {
        id: 'agri_001',
        title: 'MQTT Eavesdropping',
        description:
          'An attacker has breached the LoRaWAN gateway and is intercepting ' +
          'MQTT telemetry messages from soil sensors. Connect to the vulnerable ' +
          'machine, capture the MQTT traffic on topic <code>farm/sensors/#</code>, ' +
          'and extract the flag hidden inside the sensor payload.',
        points: 100,
        flag: 'FLAG{mqtt_m3ss4ge_interc3pted}',
        hint: 'Check the <code>moisture_level</code> field in the JSON payload — ' +
              'its value is base64-encoded and contains a surprise.'
      },
      {
        id: 'agri_002',
        title: 'Sensor Firmware Backdoor',
        description:
          'A malicious firmware update was pushed to field IoT nodes. ' +
          'Download the firmware binary from the vulnerable machine, ' +
          'reverse-engineer it, and recover the hardcoded backdoor credential ' +
          'the attacker left behind.',
        points: 200,
        flag: 'FLAG{backd00r_cr3d_f0und}',
        hint: 'Run <code>strings firmware.bin | grep -i "pass\\|key\\|FLAG"</code> ' +
              'and look for base64-encoded strings.'
      },
      {
        id: 'agri_003',
        title: 'API Command Injection',
        description:
          'The farm management REST API has an unvalidated input field. ' +
          'Exploit the <code>/api/v1/field-report?field_id=</code> endpoint ' +
          'on the vulnerable machine to achieve remote code execution ' +
          'and read <code>/root/flag.txt</code>.',
        points: 150,
        flag: 'FLAG{4pi_inj3ct10n_r00t}',
        hint: 'Try appending <code>; cat /root/flag.txt</code> to the field_id value.'
      }
    ],
    water: [
      {
        id: 'water_001',
        title: 'SCADA HMI Auth Bypass',
        description:
          'The water treatment SCADA HMI uses a legacy session management ' +
          'mechanism. Find the authentication bypass on the vulnerable machine, ' +
          'log in as an operator without valid credentials, and retrieve the ' +
          'session token displayed on the operator dashboard.',
        points: 100,
        flag: 'FLAG{sc4d4_4uth_bypassed}',
        hint: 'Look at the Set-Cookie header — the session token is predictable. ' +
              'Also try default credentials: admin/admin.'
      },
      {
        id: 'water_002',
        title: 'Modbus Pressure Valve Manipulation',
        description:
          'An attacker is sending malformed Modbus RTU packets to override ' +
          'pressure valve setpoints. Open Wireshark on the vulnerable machine, ' +
          'capture the OT network traffic, and decode the flag encoded in ' +
          'the malicious Function Code 0x06 frame.',
        points: 200,
        flag: 'FLAG{modbUs_v4lv3_0wned}',
        hint: 'Filter by <code>modbus</code> in Wireshark. ' +
              'The Register Value in the write frame is ASCII hex.'
      },
      {
        id: 'water_003',
        title: 'OT Network Lateral Movement',
        description:
          'An attacker breached the IT segment and moved laterally into the OT ' +
          'network through a misconfigured jump host. Analyze the audit logs ' +
          'on the vulnerable machine and identify the pivot IP, the protocol ' +
          'used, and reconstruct the flag from the log timestamps.',
        points: 150,
        flag: 'FLAG{0T_l4ter4l_m0v3}',
        hint: 'Check <code>/var/log/auth.log</code> for SSH login events ' +
              'originating from 192.168.1.x addresses after 02:00 UTC.'
      }
    ]
  };

  /* ─── Data helpers ───────────────────────────────────────── */
  function getData() {
    try {
      const raw = localStorage.getItem(DATA_KEY);
      return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(SEED));
    } catch (e) { return JSON.parse(JSON.stringify(SEED)); }
  }

  function setData(d) {
    localStorage.setItem(DATA_KEY, JSON.stringify(d));
  }

  function getProgress() {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      return raw ? JSON.parse(raw) : { solved: [], attempts: {} };
    } catch (e) { return { solved: [], attempts: {} }; }
  }

  function saveProgress(p) {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  }

  /* ─── Scoring ────────────────────────────────────────────── */
  function getScore(category) {
    const data     = getData();
    const progress = getProgress();
    return (data[category] || [])
      .filter(c => progress.solved.includes(c.id))
      .reduce((s, c) => s + c.points, 0);
  }

  function getTotalPoints(category) {
    return (getData()[category] || []).reduce((s, c) => s + c.points, 0);
  }

  /* ─── Flag submission ────────────────────────────────────── */
  function submitFlag(challengeId, userFlag, category) {
    const data       = getData();
    const challenges = data[category] || [];
    const ch         = challenges.find(c => c.id === challengeId);
    if (!ch) return { ok: false, msg: 'Challenge not found.' };

    const progress = getProgress();

    if (progress.solved.includes(challengeId)) {
      return { ok: true, already: true, msg: 'Already solved!' };
    }

    progress.attempts[challengeId] = (progress.attempts[challengeId] || 0) + 1;

    const correct = userFlag.trim() === ch.flag.trim();
    if (correct) {
      progress.solved.push(challengeId);
      saveProgress(progress);
      return { ok: true, correct: true, points: ch.points,
               msg: `Correct! +${ch.points} pts` };
    }

    saveProgress(progress);
    const att = progress.attempts[challengeId];
    return { ok: false, correct: false,
             msg: `Wrong flag. Attempt #${att}` };
  }

  /* ─── Render ─────────────────────────────────────────────── */
  function renderBoard(category, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const data       = getData();
    const progress   = getProgress();
    const challenges = data[category] || [];

    if (challenges.length === 0) {
      container.innerHTML = `
        <div class="ctf-empty">
          <span class="ctf-empty-icon">🚩</span>
          <p>No challenges configured yet.<br>
             An administrator needs to add challenges via the
             <a href="admin.html" target="_blank">Admin Panel</a>.</p>
        </div>`;
      return;
    }

    const score       = getScore(category);
    const total       = getTotalPoints(category);
    const solvedCount = challenges.filter(c => progress.solved.includes(c.id)).length;
    const pct         = total ? Math.round((score / total) * 100) : 0;

    container.innerHTML = `
      <div class="ctf-scorebar">
        <div class="ctf-sb-left">
          <span class="ctf-sb-score">${score}</span>
          <span class="ctf-sb-total">/ ${total} pts</span>
        </div>
        <div class="ctf-sb-track">
          <div class="ctf-sb-fill" style="width:${pct}%"></div>
        </div>
        <div class="ctf-sb-solved">${solvedCount} / ${challenges.length} solved</div>
      </div>
      <div class="ctf-challenges">
        ${challenges.map(ch => renderChallenge(ch, progress)).join('')}
      </div>`;

    /* Bind submit buttons */
    container.querySelectorAll('.ctf-submit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id  = btn.dataset.id;
        const cat = btn.dataset.cat;
        const inp = container.querySelector(`#ctf-inp-${id}`);
        if (!inp || !inp.value.trim()) {
          shakeInput(inp); return;
        }
        handleSubmit(id, inp.value, cat, containerId, category);
      });
    });

    /* Hint toggles */
    container.querySelectorAll('.ctf-hint-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const hintEl = container.querySelector(`#ctf-hint-${btn.dataset.id}`);
        if (!hintEl) return;
        const hidden = hintEl.style.display === 'none' || !hintEl.style.display;
        hintEl.style.display = hidden ? 'block' : 'none';
        btn.textContent = hidden ? '🙈 Hide Hint' : '💡 Show Hint';
      });
    });

    /* Enter key */
    container.querySelectorAll('.ctf-flag-input').forEach(inp => {
      inp.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const btn = container.querySelector(`.ctf-submit-btn[data-id="${inp.dataset.id}"]`);
        if (btn) btn.click();
      });
    });
  }

  function renderChallenge(ch, progress) {
    const solved   = progress.solved.includes(ch.id);
    const attempts = progress.attempts[ch.id] || 0;
    return `
      <div class="ctf-card ${solved ? 'ctf-card-solved' : ''}" id="ctf-card-${ch.id}">
        <div class="ctf-card-head">
          <div class="ctf-card-title-row">
            <span class="ctf-card-title">${ch.title}</span>
            <span class="ctf-card-pts">${ch.points} pts</span>
          </div>
          ${solved ? '<span class="ctf-solved-badge">✓ SOLVED</span>' : ''}
        </div>
        <p class="ctf-card-desc">${ch.description}</p>
        <div class="ctf-card-foot">
          ${ch.hint ? `
          <div class="ctf-hint-wrap">
            <button class="ctf-hint-toggle" data-id="${ch.id}">💡 Show Hint</button>
            <p class="ctf-hint-text" id="ctf-hint-${ch.id}" style="display:none">${ch.hint}</p>
          </div>` : ''}
          ${solved
            ? `<div class="ctf-solved-banner">🚩 Flag accepted — challenge complete!</div>`
            : `<div class="ctf-flag-row">
                 <input type="text" class="ctf-flag-input" id="ctf-inp-${ch.id}"
                        data-id="${ch.id}"
                        placeholder="Enter flag: FLAG{...}"
                        spellcheck="false" autocomplete="off" />
                 <button class="ctf-submit-btn" data-id="${ch.id}" data-cat="${ch.category || ch.id.split('_')[0]}">
                   Submit
                 </button>
               </div>
               ${attempts > 0 ? `<span class="ctf-att-count">${attempts} attempt${attempts > 1 ? 's' : ''}</span>` : ''}
               <div class="ctf-result-msg" id="ctf-res-${ch.id}"></div>`
          }
        </div>
      </div>`;
  }

  function handleSubmit(id, flagVal, cat, containerId, category) {
    const result = submitFlag(id, flagVal, cat);
    const resEl  = document.getElementById(`ctf-res-${id}`);
    if (resEl) {
      resEl.className = 'ctf-result-msg ' + (result.correct || result.already ? 'ctf-ok' : 'ctf-err');
      resEl.textContent = result.msg;
    }
    if (result.correct) {
      setTimeout(() => renderBoard(category, containerId), 900);
    }
  }

  function shakeInput(inp) {
    if (!inp) return;
    inp.style.animation = 'none';
    inp.offsetHeight; // reflow
    inp.style.animation = 'ctf-shake 0.35s ease';
  }

  /* ─── Public API ─────────────────────────────────────────── */
  return { renderBoard, getData, setData, getProgress, saveProgress, SEED };
})();
