window.CTF = (function () {
  'use strict';

  const STUDENT_KEY = 'cdac_ctf_student';
  const SHUFFLE_KEY = 'cdac_ctf_shuffle_seed';
  const SEED = { agriculture: [], water: [] };

  function currentStudent() {
    try {
      const raw = localStorage.getItem(STUDENT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveStudent(student) {
    localStorage.setItem(STUDENT_KEY, JSON.stringify(student));
  }

  async function api(path, options) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...(options || {})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.msg || 'Request failed.');
    }
    return data;
  }

  async function registerStudent(name, email) {
    const data = await api('/api/students', {
      method: 'POST',
      body: JSON.stringify({ name, email })
    });
    saveStudent(data.student);
    return data.student;
  }

  function ensureStudent(category, afterReady) {
    const student = currentStudent();
    if (student && student.id) {
      afterReady(student);
      return;
    }
    openStudentModal(category, afterReady);
  }

  function openStudentModal(category, afterReady) {
    let overlay = document.getElementById('ctf-student-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ctf-student-overlay';
      overlay.innerHTML = `
        <div class="ctf-student-modal" role="dialog" aria-modal="true" aria-labelledby="ctf-student-title">
          <button class="ctf-student-close" type="button" aria-label="Close">&times;</button>
          <div class="ctf-student-kicker">Student Entry</div>
          <h2 id="ctf-student-title">Join the CTF</h2>
          <p>Enter your name and email once. Your score and rank will continue from the same email.</p>
          <label for="ctf-student-name">Name</label>
          <input id="ctf-student-name" type="text" autocomplete="name" placeholder="Student name" />
          <label for="ctf-student-email">Email</label>
          <input id="ctf-student-email" type="email" autocomplete="email" placeholder="name@example.com" />
          <div class="ctf-student-error" id="ctf-student-error"></div>
          <button class="ctf-student-submit" type="button">Start CTF</button>
        </div>`;
      document.body.appendChild(overlay);
    }

    function close() {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
    }

    const closeBtn = overlay.querySelector('.ctf-student-close');
    const submitBtn = overlay.querySelector('.ctf-student-submit');
    const nameInp = overlay.querySelector('#ctf-student-name');
    const emailInp = overlay.querySelector('#ctf-student-email');
    const err = overlay.querySelector('#ctf-student-error');
    closeBtn.onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
    submitBtn.onclick = async () => {
      err.textContent = '';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Starting...';
      try {
        const student = await registerStudent(nameInp.value.trim(), emailInp.value.trim());
        close();
        afterReady(student, category);
      } catch (e) {
        err.textContent = e.message;
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Start CTF';
      }
    };
    [nameInp, emailInp].forEach((inp) => {
      inp.onkeydown = (e) => {
        if (e.key === 'Enter') submitBtn.click();
      };
    });
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => nameInp.focus(), 80);
  }

  async function getData() {
    const data = await api('/api/admin/challenges');
    return data.questions || { agriculture: [], water: [] };
  }

  async function setData(d) {
    return d;
  }

  async function getProgress() {
    return { solved: [], attempts: {} };
  }

  async function saveProgress() {
    await api('/api/admin/reset-progress', { method: 'POST', body: '{}' });
  }

  async function getChallenges(category) {
    const student = currentStudent();
    const qs = new URLSearchParams({ category });
    if (student && student.id) qs.set('studentId', student.id);
    const data = await api('/api/challenges?' + qs.toString());
    return shuffleForBrowser(data.challenges || [], category);
  }

  function getShuffleSeed(category) {
    const student = currentStudent();
    const identity = student && student.id ? `student-${student.id}` : 'anonymous';
    const key = `${SHUFFLE_KEY}_${identity}_${category}`;
    let seed = localStorage.getItem(key);
    if (!seed) {
      seed = String(Date.now() + Math.floor(Math.random() * 1000000));
      localStorage.setItem(key, seed);
    }
    return Number(seed);
  }

  function seededRandom(seed) {
    let value = seed % 2147483647;
    if (value <= 0) value += 2147483646;
    return function () {
      value = value * 16807 % 2147483647;
      return (value - 1) / 2147483646;
    };
  }

  function shuffleForBrowser(items, category) {
    const list = items.slice();
    const random = seededRandom(getShuffleSeed(category));
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  async function submitFlag(challengeId, userFlag) {
    const student = currentStudent();
    if (!student || !student.id) throw new Error('Please enter your student details first.');
    return api('/api/submissions', {
      method: 'POST',
      body: JSON.stringify({ studentId: student.id, challengeId, answer: userFlag })
    });
  }

  async function recordHint(challengeId) {
    const student = currentStudent();
    if (!student || !student.id) throw new Error('Please enter your student details first.');
    return api('/api/hints', {
      method: 'POST',
      body: JSON.stringify({ studentId: student.id, challengeId })
    });
  }

  async function getLeaderboard(category) {
    const student = currentStudent();
    const qs = new URLSearchParams({ category });
    if (student && student.id) qs.set('studentId', student.id);
    return api('/api/leaderboard?' + qs.toString());
  }

  async function renderBoard(category, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const student = currentStudent();
    if (!student || !student.id) {
      container.innerHTML = `
        <div class="ctf-entry-card">
          <h3>Student details required</h3>
          <p>Enter your name and email to start this CTF and appear on the ${labelFor(category)} leaderboard.</p>
          <button class="ctf-start-btn" type="button">Start ${labelFor(category)} CTF</button>
        </div>`;
      const btn = container.querySelector('.ctf-start-btn');
      if (btn) btn.addEventListener('click', () => ensureStudent(category, () => renderBoard(category, containerId)));
      return;
    }

    container.innerHTML = '<div class="ctf-loading">Loading CTF...</div>';
    try {
      const challenges = await getChallenges(category);
      const board = await getLeaderboard(category);
      if (challenges.length === 0) {
        container.innerHTML = `
          <div class="ctf-empty">
            <span class="ctf-empty-icon">!</span>
            <p>No challenges configured yet.<br>
               An administrator needs to add challenges via the
               <a href="admin.html" target="_blank">Admin Panel</a>.</p>
          </div>`;
        return;
      }

      const score = board.current ? board.current.score : 0;
      const solvedCount = challenges.filter(c => c.solved).length;
      const total = challenges.reduce((s, c) => s + c.points, 0);
      const pct = total ? Math.round((score / total) * 100) : 0;

      container.innerHTML = `
        ${renderStudentStrip(student)}
        ${renderLeaderboard(board)}
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
          ${challenges.map(renderChallenge).join('')}
        </div>`;

      bindBoard(container, category, containerId);
    } catch (e) {
      container.innerHTML = `<div class="ctf-empty"><p>${escapeHtml(e.message)}</p></div>`;
    }
  }

  function bindBoard(container, category, containerId) {
    container.querySelectorAll('.ctf-submit-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const inp = container.querySelector(`#ctf-inp-${id}`);
        if (!inp || !inp.value.trim()) {
          shakeInput(inp);
          return;
        }
        await handleSubmit(id, inp.value, category, containerId);
      });
    });

    container.querySelectorAll('.ctf-hint-toggle').forEach(btn => {
      btn.addEventListener('click', async () => {
        const hintEl = container.querySelector(`#ctf-hint-${btn.dataset.id}`);
        if (!hintEl) return;
        const hidden = hintEl.style.display === 'none' || !hintEl.style.display;
        if (hidden) {
          btn.disabled = true;
          try {
            const result = await recordHint(btn.dataset.id);
            hintEl.innerHTML = result.hint || 'No hint available.';
            hintEl.style.display = 'block';
            const ptsEl = container.querySelector(`#ctf-award-${btn.dataset.id}`);
            if (ptsEl) ptsEl.textContent = `${result.currentAward} pts available`;
            btn.textContent = 'Hide Hint';
          } catch (e) {
            hintEl.textContent = e.message;
            hintEl.style.display = 'block';
          } finally {
            btn.disabled = false;
          }
        } else {
          hintEl.style.display = 'none';
          btn.textContent = 'Show Hint';
        }
      });
    });

    container.querySelectorAll('.ctf-flag-input').forEach(inp => {
      inp.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const btn = container.querySelector(`.ctf-submit-btn[data-id="${inp.dataset.id}"]`);
        if (btn) btn.click();
      });
    });
  }

  function renderStudentStrip(student) {
    return `
      <div class="ctf-student-strip">
        <span>Playing as <strong>${escapeHtml(student.name)}</strong></span>
        <button type="button" class="ctf-change-student" onclick="localStorage.removeItem('${STUDENT_KEY}'); location.reload();">Change</button>
      </div>`;
  }

  function renderLeaderboard(board) {
    const top = board.top || [];
    const current = board.current;
    const showCurrent = current && !top.some(row => row.studentId === current.studentId);
    return `
      <div class="ctf-leaderboard">
        <div class="ctf-lb-head">
          <span>Leaderboard</span>
          ${current ? `<strong>Your rank: #${current.rank}</strong>` : '<strong>No rank yet</strong>'}
        </div>
        <div class="ctf-lb-rows">
          ${top.length ? top.map(renderRankRow).join('') : '<div class="ctf-lb-empty">No scores yet.</div>'}
          ${showCurrent ? '<div class="ctf-lb-gap"></div>' + renderRankRow(current, true) : ''}
        </div>
      </div>`;
  }

  function renderRankRow(row, current) {
    return `
      <div class="ctf-lb-row ${current ? 'current' : ''}">
        <span class="ctf-lb-rank">#${row.rank}</span>
        <span class="ctf-lb-name">${escapeHtml(row.name)}</span>
        <span class="ctf-lb-score">${row.score} pts</span>
      </div>`;
  }

  function renderChallenge(ch) {
    const solved = !!ch.solved;
    const attempts = ch.attempts || 0;
    return `
      <div class="ctf-card ${solved ? 'ctf-card-solved' : ''}" id="ctf-card-${ch.id}">
        <div class="ctf-card-head">
          <div class="ctf-card-title-row">
            <span class="ctf-card-title">${ch.title}</span>
            <span class="ctf-card-pts">${ch.points} pts</span>
          </div>
          ${solved ? '<span class="ctf-solved-badge">SOLVED</span>' : ''}
        </div>
        <p class="ctf-card-desc">${ch.description}</p>
        <div class="ctf-card-foot">
          ${ch.hasHint ? `
          <div class="ctf-hint-wrap">
            <button class="ctf-hint-toggle" data-id="${ch.id}" ${solved ? 'disabled' : ''}>Show Hint</button>
            <span class="ctf-award-note" id="ctf-award-${ch.id}">${solved ? `${ch.awardedPoints} pts earned` : `${ch.currentAward} pts available`}</span>
            <p class="ctf-hint-text" id="ctf-hint-${ch.id}" style="display:none"></p>
          </div>` : ''}
          ${solved
            ? `<div class="ctf-solved-banner">Flag accepted - challenge complete!</div>`
            : `<div class="ctf-flag-row">
                 <input type="text" class="ctf-flag-input" id="ctf-inp-${ch.id}"
                        data-id="${ch.id}"
                        placeholder="Enter flag: FLAG{...}"
                        spellcheck="false" autocomplete="off" />
                 <button class="ctf-submit-btn" data-id="${ch.id}">Submit</button>
               </div>
               ${attempts > 0 ? `<span class="ctf-att-count">${attempts} attempt${attempts > 1 ? 's' : ''}</span>` : ''}
               <div class="ctf-result-msg" id="ctf-res-${ch.id}"></div>`
          }
        </div>
      </div>`;
  }

  async function handleSubmit(id, flagVal, category, containerId) {
    const resEl = document.getElementById(`ctf-res-${id}`);
    try {
      const result = await submitFlag(id, flagVal);
      if (resEl) {
        resEl.className = 'ctf-result-msg ' + (result.correct || result.already ? 'ctf-ok' : 'ctf-err');
        resEl.textContent = result.msg;
      }
      if (result.correct) {
        setTimeout(() => renderBoard(category, containerId), 900);
      }
    } catch (e) {
      if (resEl) {
        resEl.className = 'ctf-result-msg ctf-err';
        resEl.textContent = e.message;
      }
    }
  }

  function labelFor(category) {
    return category === 'water' ? 'Water' : 'Agriculture';
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function shakeInput(inp) {
    if (!inp) return;
    inp.style.animation = 'none';
    inp.offsetHeight;
    inp.style.animation = 'ctf-shake 0.35s ease';
  }

  return {
    renderBoard,
    getData,
    setData,
    getProgress,
    saveProgress,
    registerStudent,
    currentStudent,
    ensureStudent,
    SEED
  };
})();
