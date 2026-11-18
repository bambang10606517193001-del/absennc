/* =========================================================
   APP.JS - LOGIKA APLIKASI JURNAL NURUL CHALIK
   ========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ==========================================
// 1. KONFIGURASI FIREBASE & STATE APLIKASI
// ==========================================
// Catatan untuk Deploy GitHub / Cloudflare Pages:
// Jika ingin menghubungkan ke proyek Firebase Anda sendiri, isi objek MANUAL_FIREBASE_CONFIG di bawah ini:
const MANUAL_FIREBASE_CONFIG = null;
/* Contoh pengisian jika memakai proyek Firebase sendiri:
const MANUAL_FIREBASE_CONFIG = {
    apiKey: "AIzaSy...",
    authDomain: "jurnal-kelas-nurul-chalik.firebaseapp.com",
    projectId: "jurnal-kelas-nurul-chalik",
    storageBucket: "jurnal-kelas-nurul-chalik.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef"
};
*/

const LOCAL_STORAGE_KEY = 'jurnal_nurul_chalik_data_v2';
const SESSION_STORAGE_KEY = 'jurnal_nurul_chalik_session_v2';
const appId = typeof __app_id !== 'undefined' ? __app_id : 'jurnal-nurul-chalik-prod';

const defaultData = {
    activeAcademicYear: '2026/2027',
    activeSemester: 'Ganjil',
    operatorAccount: {
        username: 'admin',
        password: '123',
        name: 'Operator Madrasah'
    },
    classesByMadrasah: {
        MTs: ['VII', 'VIII', 'IX'],
        MA: ['X', 'XI', 'XII']
    },
    subjects: [
        'Al-Qur\'an Hadits', 'Aqidah Akhlak', 'Fiqih', 'SKI',
        'Bahasa Arab', 'Bahasa Indonesia', 'Bahasa Inggris',
        'Matematika', 'IPA', 'IPS', 'PKn', 'PJOK', 'Informatika'
    ],
    teachers: [
        {
            id: 't-1',
            name: 'Ustadz Ahmad Fauzi, S.Pd.',
            username: 'guru',
            password: '123',
            madrasah: 'BOTH',
            subjects: ['Matematika', 'IPA', 'Fiqih']
        }
    ],
    studentsByClass: {
        'MTs_VII': [
            { id: 's-1', name: 'Ahmad Zaki Al-Fatih' },
            { id: 's-2', name: 'Aisyah Putri Ramadhani' },
            { id: 's-3', name: 'Muhammad Rizky Pratama' },
            { id: 's-4', name: 'Siti Nurhaliza' }
        ],
        'MTs_VIII': [
            { id: 's-5', name: 'Fajar Nugroho' },
            { id: 's-6', name: 'Nabila Zahra' }
        ],
        'MTs_IX': [
            { id: 's-7', name: 'Rafi Akbar' },
            { id: 's-8', name: 'Zahra Aulia' }
        ],
        'MA_X': [
            { id: 's-9', name: 'Dimas Anggara' },
            { id: 's-10', name: 'Putri Melati' }
        ],
        'MA_XI': [
            { id: 's-11', name: 'Ilham Maulana' }
        ],
        'MA_XII': [
            { id: 's-12', name: 'Annisa Fitri' }
        ]
    },
    journals: []
};

let appData = loadInitialLocalCache();
let selectedLoginRole = 'guru';
let currentUser = null;
let currentMadrasah = 'MTs';
let currentClass = 'VII';
let currentAttendanceMap = {};
let currentLocationData = null;
let gpsWatchId = null;

let db = null;
let auth = null;
let firebaseUser = null;

// ==========================================
// 2. PENYIMPANAN LOKAL & PERSISTENT SESSION
// ==========================================
function loadInitialLocalCache() {
    try {
        const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            return { ...defaultData, ...parsed };
        }
    } catch (e) {
        console.warn('Local cache tidak tersedia:', e);
    }
    return JSON.parse(JSON.stringify(defaultData));
}

function saveLocalCacheOnly() {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(appData));
    } catch (e) {
        console.warn('Gagal menulis cache lokal:', e);
    }
}

async function saveData() {
    saveLocalCacheOnly();
    if (db && firebaseUser) {
        try {
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'master', 'state');
            await setDoc(docRef, appData, { merge: true });
        } catch (err) {
            console.warn('Sinkronisasi cloud tertunda (mode lokal aktif):', err.message);
        }
    }
}

function saveActiveSession(userObj) {
    const serialized = userObj ? JSON.stringify(userObj) : '';
    try {
        if (userObj) {
            localStorage.setItem(SESSION_STORAGE_KEY, serialized);
            sessionStorage.setItem(SESSION_STORAGE_KEY, serialized);
            window.name = 'JNC_SESSION:' + serialized;
            window.location.hash = 'session=' + encodeURIComponent(btoa(serialized));
        } else {
            localStorage.removeItem(SESSION_STORAGE_KEY);
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
            window.name = '';
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    } catch (e) {
        console.warn('Peringatan penyimpanan sesi:', e);
    }
}

function restoreActiveSession() {
    let raw = null;
    try {
        raw = localStorage.getItem(SESSION_STORAGE_KEY) || sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (!raw && window.name && window.name.startsWith('JNC_SESSION:')) {
            raw = window.name.replace('JNC_SESSION:', '');
        }
        if (!raw && window.location.hash.includes('session=')) {
            const encoded = window.location.hash.split('session=')[1]?.split('&')[0];
            if (encoded) raw = atob(decodeURIComponent(encoded));
        }
    } catch (e) {
        console.warn('Gagal membaca sesi tersimpan:', e);
    }

    if (raw) {
        try {
            const userObj = JSON.parse(raw);
            if (userObj && userObj.role && userObj.name) {
                currentUser = userObj;
                enterMainApp(true);
            }
        } catch (e) {
            saveActiveSession(null);
        }
    }
}

// ==========================================
// 3. KONEKSI FIREBASE CLOUD
// ==========================================
async function initFirebaseConnection() {
    const syncDot = document.getElementById('login-sync-dot');
    const syncText = document.getElementById('login-sync-text');

    try {
        const rawConfig = typeof __firebase_config !== 'undefined'
            ? JSON.parse(__firebase_config)
            : MANUAL_FIREBASE_CONFIG;

        if (!rawConfig) {
            if (syncDot) syncDot.className = 'w-2 h-2 rounded-full bg-emerald-400';
            if (syncText) syncText.textContent = 'Mode Penyimpanan Perangkat Siap';
            return;
        }

        const app = initializeApp(rawConfig);
        auth = getAuth(app);
        db = getFirestore(app);

        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            const cred = await signInWithCustomToken(auth, __initial_auth_token);
            firebaseUser = cred.user;
        } else {
            const cred = await signInAnonymously(auth);
            firebaseUser = cred.user;
        }

        if (syncDot) syncDot.className = 'w-2 h-2 rounded-full bg-emerald-400';
        if (syncText) syncText.textContent = 'Terhubung ke Cloud Firebase';

        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'master', 'state');
        onSnapshot(docRef, (snap) => {
            if (snap.exists()) {
                appData = { ...defaultData, ...snap.data() };
                saveLocalCacheOnly();
                if (currentUser) refreshAllViews();
            } else {
                saveData();
            }
        }, (err) => {
            console.warn('Firestore listener fallback ke mode lokal:', err.message);
        });
    } catch (err) {
        if (syncDot) syncDot.className = 'w-2 h-2 rounded-full bg-emerald-400';
        if (syncText) syncText.textContent = 'Mode Lokal Aktif';
    }
}

// ==========================================
// 4. NOTIFIKASI TOAST & UTILITAS UI
// ==========================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const colors = {
        success: 'bg-emerald-600 text-white border-emerald-500',
        error: 'bg-rose-600 text-white border-rose-500',
        info: 'bg-slate-800 text-white border-slate-700'
    };

    const toast = document.createElement('div');
    toast.className = `pointer-events-auto px-4 py-3 rounded-xl shadow-xl border text-xs font-semibold flex items-center justify-between gap-3 fade-in ${colors[type] || colors.info}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3200);
}

function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
}

// ==========================================
// 5. AUTENTIKASI LOGIN & LOGOUT
// ==========================================
function selectLoginRole(role) {
    selectedLoginRole = role;
    const btnGuru = document.getElementById('role-btn-guru');
    const btnOp = document.getElementById('role-btn-operator');
    const label = document.getElementById('login-username-label');
    const input = document.getElementById('login-username');

    if (role === 'guru') {
        btnGuru.className = 'py-2.5 px-3 rounded-lg text-xs sm:text-sm font-bold transition-all bg-white text-brand-700 shadow-sm flex items-center justify-center gap-2';
        btnOp.className = 'py-2.5 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all text-slate-600 hover:text-slate-800 flex items-center justify-center gap-2';
        label.textContent = 'Username / Kode Guru';
        input.placeholder = 'Contoh: guru';
    } else {
        btnOp.className = 'py-2.5 px-3 rounded-lg text-xs sm:text-sm font-bold transition-all bg-white text-brand-700 shadow-sm flex items-center justify-center gap-2';
        btnGuru.className = 'py-2.5 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all text-slate-600 hover:text-slate-800 flex items-center justify-center gap-2';
        label.textContent = 'Username Operator / Admin';
        input.placeholder = 'Contoh: admin';
    }
}

function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();

    if (selectedLoginRole === 'operator') {
        const op = appData.operatorAccount;
        if (username === op.username && password === op.password) {
            currentUser = {
                role: 'operator',
                name: op.name,
                username: op.username,
                madrasah: 'BOTH'
            };
            saveActiveSession(currentUser);
            enterMainApp(false);
            return;
        }
        showToast('Username atau Password Operator salah!', 'error');
        return;
    }

    const foundTeacher = (appData.teachers || []).find(
        t => t.username.toLowerCase() === username.toLowerCase() && t.password === password
    );

    if (foundTeacher) {
        currentUser = {
            role: 'guru',
            id: foundTeacher.id,
            name: foundTeacher.name,
            username: foundTeacher.username,
            madrasah: foundTeacher.madrasah || 'BOTH',
            subjects: foundTeacher.subjects || appData.subjects
        };
        saveActiveSession(currentUser);
        enterMainApp(false);
    } else {
        showToast('Username atau PIN Guru tidak ditemukan!', 'error');
    }
}

function enterMainApp(isRestored = false) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');

    document.getElementById('user-display-name').textContent = currentUser.name;
    document.getElementById('user-display-role').textContent =
        currentUser.role === 'operator' ? 'Administrator / Operator' : 'Guru Mata Pelajaran';
    document.getElementById('user-avatar-initial').textContent =
        currentUser.name.substring(0, 2).toUpperCase();

    document.querySelectorAll('.operator-only').forEach(el => {
        if (currentUser.role === 'operator') {
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    });

    currentMadrasah = currentUser.madrasah === 'MA' ? 'MA' : 'MTs';

    const today = new Date().toISOString().split('T')[0];
    document.getElementById('input-date').value = today;
    if (currentUser.role === 'guru') {
        document.getElementById('input-teacher-name').value = currentUser.name;
    }

    // Aktifkan GPS Real-Time
    captureAttendanceLocation(false);
    startLiveGpsTracking();

    switchTab('tab-input');
    refreshAllViews();
    if (window.lucide) lucide.createIcons();

    if (!isRestored) {
        showToast(`Selamat datang, ${currentUser.name}!`, 'success');
    }
}

function handleLogout() {
    currentUser = null;
    if (gpsWatchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
    }
    saveActiveSession(null);
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('main-app').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    showToast('Anda telah keluar dari aplikasi.', 'info');
}

// ==========================================
// 6. NAVIGASI TAB
// ==========================================
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(sec => sec.classList.add('hidden'));
    const activeSec = document.getElementById(tabId);
    if (activeSec) activeSec.classList.remove('hidden');

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.className = 'nav-btn w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors whitespace-nowrap';
    });
    const activeBtn = document.getElementById('nav-' + tabId);
    if (activeBtn) {
        activeBtn.className = 'nav-btn w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-brand-600 text-white shadow-sm whitespace-nowrap';
    }

    if (tabId === 'tab-recap-journal') renderJournalRecap();
    if (tabId === 'tab-recap-teacher') renderTeacherRecap();
    if (tabId === 'tab-master') renderMasterViews();
}

// ==========================================
// 7. DETEKSI LOKASI GPS REAL-TIME
// ==========================================
function updateGpsIndicatorBadge(state) {
    const dot = document.getElementById('gps-indicator-dot');
    if (!dot) return;
    dot.className = 'gps-pulse-dot w-2.5 h-2.5 rounded-full inline-block';
    if (state === 'active') {
        dot.classList.add('bg-emerald-500', 'text-emerald-500');
    } else if (state === 'searching') {
        dot.classList.add('bg-amber-500', 'text-amber-500');
    } else {
        dot.classList.remove('gps-pulse-dot');
        dot.classList.add('bg-rose-500');
    }
}

function handleGpsSuccess(pos, notifyUser = false) {
    const lat = pos.coords.latitude.toFixed(6);
    const lng = pos.coords.longitude.toFixed(6);
    const acc = Math.round(pos.coords.accuracy || 0);

    currentLocationData = {
        lat,
        lng,
        accuracy: acc,
        url: `https://maps.google.com/?q=${lat},${lng}`
    };

    updateGpsIndicatorBadge('active');
    const statusEl = document.getElementById('location-status-text');
    if (statusEl) {
        statusEl.innerHTML = `
            <div class="flex flex-wrap items-center justify-between gap-1">
                <span class="text-emerald-700 font-bold">GPS Terkunci: ${lat}, ${lng} <span class="font-normal text-slate-500">(±${acc}m)</span></span>
                <a href="${currentLocationData.url}" target="_blank" rel="noopener" class="underline font-semibold text-sky-700 hover:text-sky-800">Buka Peta ↗</a>
            </div>
        `;
    }

    if (notifyUser) {
        showToast(`Koordinat GPS terkunci (${lat}, ${lng})`, 'success');
    }
}

function handleGpsError(err, notifyUser = false) {
    updateGpsIndicatorBadge('error');
    const statusEl = document.getElementById('location-status-text');
    let reason = 'Izin lokasi belum diaktifkan pada browser/perangkat.';
    if (err && err.code === 1) {
        reason = 'Izin lokasi ditolak. Aktifkan izin Lokasi (GPS) pada pengaturan browser/HP Anda.';
    } else if (err && err.code === 2) {
        reason = 'Sinyal GPS perangkat tidak tersedia. Pastikan fitur Lokasi/GPS HP aktif.';
    } else if (err && err.code === 3) {
        reason = 'Waktu pencarian GPS habis. Tekan "Segarkan GPS" atau isi keterangan ruang.';
    }

    if (statusEl) {
        statusEl.innerHTML = `<span class="text-amber-700 font-medium">${reason}</span>`;
    }
    if (notifyUser) {
        showToast(reason, 'info');
    }
}

function startLiveGpsTracking() {
    if (!navigator.geolocation) {
        updateGpsIndicatorBadge('error');
        return;
    }
    if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
    }
    updateGpsIndicatorBadge('searching');
    gpsWatchId = navigator.geolocation.watchPosition(
        (pos) => handleGpsSuccess(pos, false),
        (err) => handleGpsError(err, false),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
}

function captureAttendanceLocation(isManualTrigger = false) {
    const statusEl = document.getElementById('location-status-text');
    if (!statusEl) return;

    if (!navigator.geolocation) {
        currentLocationData = null;
        updateGpsIndicatorBadge('error');
        statusEl.innerHTML = `<span class="text-amber-700 font-medium">Peramban tidak mendukung GPS. Isi keterangan ruang di bawah.</span>`;
        return;
    }

    updateGpsIndicatorBadge('searching');
    statusEl.textContent = 'Mendeteksi koordinat lokasi GPS...';
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            handleGpsSuccess(pos, isManualTrigger);
            if (gpsWatchId === null) startLiveGpsTracking();
        },
        (err) => {
            if (!currentLocationData) {
                handleGpsError(err, isManualTrigger);
            } else if (isManualTrigger) {
                showToast('Menggunakan koordinat GPS terakhir yang terkunci.', 'info');
            }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

// ==========================================
// 8. INPUT ABSENSI SISWA & JURNAL KELAS
// ==========================================
function switchMadrasah(unit) {
    if (currentUser && currentUser.role === 'guru' && currentUser.madrasah !== 'BOTH' && currentUser.madrasah !== unit) {
        showToast(`Akun Anda terdaftar khusus untuk unit ${currentUser.madrasah}.`, 'info');
        return;
    }
    currentMadrasah = unit;
    const btnMts = document.getElementById('btn-unit-mts');
    const btnMa = document.getElementById('btn-unit-ma');

    if (unit === 'MTs') {
        btnMts.className = 'py-1.5 px-2 rounded-lg text-xs font-bold bg-brand-600 text-white shadow-xs transition-all';
        btnMa.className = 'py-1.5 px-2 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 transition-all';
    } else {
        btnMa.className = 'py-1.5 px-2 rounded-lg text-xs font-bold bg-brand-600 text-white shadow-xs transition-all';
        btnMts.className = 'py-1.5 px-2 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 transition-all';
    }

    populateClassSelect();
    handleClassChange();
}

function populateClassSelect() {
    const select = document.getElementById('select-class');
    const classes = appData.classesByMadrasah[currentMadrasah] || [];
    select.innerHTML = classes.map(cls => `<option value="${cls}">Kelas ${cls} (${currentMadrasah})</option>`).join('');
    currentClass = classes[0] || '';
}

function populateSubjectSelect() {
    const select = document.getElementById('input-subject');
    const allowedSubjects = (currentUser && currentUser.role === 'guru' && currentUser.subjects?.length)
        ? currentUser.subjects
        : appData.subjects;
    select.innerHTML = allowedSubjects.map(sub => `<option value="${sub}">${sub}</option>`).join('');
}

function handleClassChange() {
    currentClass = document.getElementById('select-class').value;
    document.getElementById('attendance-class-title').textContent = `${currentMadrasah} - Kelas ${currentClass}`;
    initAttendanceForClass();
    renderStudentAttendanceList();
}

function initAttendanceForClass() {
    const key = `${currentMadrasah}_${currentClass}`;
    const students = appData.studentsByClass[key] || [];
    currentAttendanceMap = {};
    students.forEach(s => {
        currentAttendanceMap[s.id] = 'H';
    });
}

function markAllPresent() {
    Object.keys(currentAttendanceMap).forEach(id => {
        currentAttendanceMap[id] = 'H';
    });
    renderStudentAttendanceList();
    showToast('Semua siswa ditandai Hadir (H).', 'success');
}

function setStudentStatus(studentId, status) {
    currentAttendanceMap[studentId] = status;
    renderStudentAttendanceList();
}

function renderStudentAttendanceList() {
    const key = `${currentMadrasah}_${currentClass}`;
    const students = appData.studentsByClass[key] || [];
    const container = document.getElementById('student-attendance-list');

    if (students.length === 0) {
        container.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">Belum ada data siswa di kelas ini. Tambahkan melalui menu Data Master.</div>`;
        updateAttendanceStats(students);
        return;
    }

    container.innerHTML = students.map((s, idx) => {
        const st = currentAttendanceMap[s.id] || 'H';
        const btnClass = (target, activeColor) =>
            st === target
                ? `${activeColor} text-white font-bold shadow-xs`
                : `bg-slate-100 text-slate-600 hover:bg-slate-200 font-semibold`;

        return `
            <div class="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-100 hover:bg-slate-50/80 transition-colors">
                <div class="flex items-center gap-2.5 min-w-0">
                    <span class="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold flex items-center justify-center shrink-0">${idx + 1}</span>
                    <span class="text-xs sm:text-sm font-semibold text-slate-800 truncate">${s.name}</span>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                    <button type="button" onclick="setStudentStatus('${s.id}', 'H')" class="w-8 h-8 rounded-lg text-xs transition-all ${btnClass('H', 'bg-emerald-600')}">H</button>
                    <button type="button" onclick="setStudentStatus('${s.id}', 'S')" class="w-8 h-8 rounded-lg text-xs transition-all ${btnClass('S', 'bg-amber-500')}">S</button>
                    <button type="button" onclick="setStudentStatus('${s.id}', 'I')" class="w-8 h-8 rounded-lg text-xs transition-all ${btnClass('I', 'bg-sky-600')}">I</button>
                    <button type="button" onclick="setStudentStatus('${s.id}', 'A')" class="w-8 h-8 rounded-lg text-xs transition-all ${btnClass('A', 'bg-rose-600')}">A</button>
                </div>
            </div>
        `;
    }).join('');

    updateAttendanceStats(students);
}

function updateAttendanceStats(students) {
    let h = 0, s = 0, i = 0, a = 0;
    const absentNames = [];

    students.forEach(st => {
        const status = currentAttendanceMap[st.id] || 'H';
        if (status === 'H') h++;
        else if (status === 'S') { s++; absentNames.push(`${st.name} (S)`); }
        else if (status === 'I') { i++; absentNames.push(`${st.name} (I)`); }
        else if (status === 'A') { a++; absentNames.push(`${st.name} (A)`); }
    });

    document.getElementById('stat-hadir').textContent = h;
    document.getElementById('stat-sakit').textContent = s;
    document.getElementById('stat-izin').textContent = i;
    document.getElementById('stat-alfa').textContent = a;
    document.getElementById('absent-summary-text').textContent =
        absentNames.length > 0 ? absentNames.join(', ') : 'Nihil (Semua Hadir)';
}

async function saveAttendanceAndJournal(event) {
    event.preventDefault();
    const key = `${currentMadrasah}_${currentClass}`;
    const students = appData.studentsByClass[key] || [];
    const manualLoc = document.getElementById('manual-location-input').value.trim();

    let locationSummary = manualLoc || `Ruang Kelas ${currentClass}`;
    if (currentLocationData) {
        locationSummary += ` [GPS: ${currentLocationData.lat}, ${currentLocationData.lng} ±${currentLocationData.accuracy}m]`;
    }

    let h = 0, s = 0, i = 0, a = 0;
    const absentList = [];
    students.forEach(st => {
        const status = currentAttendanceMap[st.id] || 'H';
        if (status === 'H') h++;
        else {
            if (status === 'S') s++;
            if (status === 'I') i++;
            if (status === 'A') a++;
            absentList.push(`${st.name} (${status})`);
        }
    });

    const newJournal = {
        id: 'j-' + Date.now(),
        madrasah: currentMadrasah,
        className: currentClass,
        date: document.getElementById('input-date').value,
        jam: document.getElementById('input-jam').value.trim(),
        subject: document.getElementById('input-subject').value,
        teacherName: document.getElementById('input-teacher-name').value.trim(),
        topic: document.getElementById('input-topic').value.trim(),
        notes: document.getElementById('input-notes').value.trim(),
        location: locationSummary,
        gpsUrl: currentLocationData ? currentLocationData.url : '',
        stats: { h, s, i, a },
        absentSummary: absentList.length ? absentList.join(', ') : 'Hadir Semua',
        createdAt: new Date().toISOString()
    };

    appData.journals.unshift(newJournal);
    await saveData();

    document.getElementById('input-topic').value = '';
    document.getElementById('input-notes').value = '';
    showToast('Absensi & Jurnal Mengajar berhasil disimpan!', 'success');
}

// ==========================================
// 9. ARSIP JURNAL, REKAP GURU & DATA MASTER
// ==========================================
function renderJournalRecap() {
    const tbody = document.getElementById('journal-recap-tbody');
    const filterUnit = document.getElementById('filter-journal-madrasah').value;
    const filterDate = document.getElementById('filter-journal-date').value;

    let list = appData.journals || [];
    if (currentUser && currentUser.role === 'guru') {
        list = list.filter(j => j.teacherName === currentUser.name);
    }
    if (filterUnit !== 'ALL') {
        list = list.filter(j => j.madrasah === filterUnit);
    }
    if (filterDate) {
        list = list.filter(j => j.date === filterDate);
    }

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400">Belum ada data jurnal yang sesuai filter.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(j => `
        <tr class="hover:bg-slate-50/80 transition-colors">
            <td class="p-3.5 whitespace-nowrap">
                <div class="font-bold text-slate-800">${j.date}</div>
                <div class="text-[11px] text-slate-500">Jam ke-${j.jam}</div>
            </td>
            <td class="p-3.5 whitespace-nowrap">
                <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${j.madrasah === 'MTs' ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800'}">${j.madrasah}</span>
                <span class="font-bold text-slate-800 ml-1">Kelas ${j.className}</span>
            </td>
            <td class="p-3.5">
                <div class="font-bold text-slate-800">${j.subject}</div>
                <div class="text-[11px] text-slate-500">${j.teacherName}</div>
            </td>
            <td class="p-3.5 max-w-xs">
                <div class="text-slate-800 font-medium">${j.topic}</div>
                <div class="text-[11px] text-sky-700 mt-0.5 flex items-center gap-1">
                    <span>📍 ${j.location}</span>
                    ${j.gpsUrl ? `<a href="${j.gpsUrl}" target="_blank" class="underline font-bold">[Peta]</a>` : ''}
                </div>
            </td>
            <td class="p-3.5">
                <div class="font-bold text-emerald-700">H:${j.stats.h} | S:${j.stats.s} | I:${j.stats.i} | A:${j.stats.a}</div>
                <div class="text-[11px] text-slate-500 truncate max-w-[180px]" title="${j.absentSummary}">${j.absentSummary}</div>
            </td>
            <td class="p-3.5 text-right no-print">
                <button type="button" onclick="deleteJournal('${j.id}')" class="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg" title="Hapus Jurnal">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </td>
        </tr>
    `).join('');
    if (window.lucide) lucide.createIcons();
}

function resetJournalFilters() {
    document.getElementById('filter-journal-madrasah').value = 'ALL';
    document.getElementById('filter-journal-date').value = '';
    renderJournalRecap();
}

async function deleteJournal(id) {
    appData.journals = (appData.journals || []).filter(j => j.id !== id);
    await saveData();
    renderJournalRecap();
    showToast('Jurnal dihapus.', 'info');
}

function exportJournalsToCSV() {
    const rows = [['Tanggal', 'Jam', 'Unit', 'Kelas', 'Mapel', 'Guru', 'Materi', 'Lokasi', 'Hadir', 'Sakit', 'Izin', 'Alfa', 'Keterangan Tidak Hadir']];
    (appData.journals || []).forEach(j => {
        rows.push([
            j.date, j.jam, j.madrasah, j.className, j.subject, j.teacherName,
            `"${(j.topic || '').replace(/"/g, '""')}"`,
            `"${(j.location || '').replace(/"/g, '""')}"`,
            j.stats.h, j.stats.s, j.stats.i, j.stats.a,
            `"${(j.absentSummary || '').replace(/"/g, '""')}"`
        ]);
    });
    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `Arsip_Jurnal_Nurul_Chalik_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
}

function renderTeacherRecap() {
    const tbody = document.getElementById('teacher-recap-tbody');
    const teachers = appData.teachers || [];
    tbody.innerHTML = teachers.map((t, idx) => {
        const logs = (appData.journals || []).filter(j => j.teacherName === t.name);
        const lastDate = logs.length > 0 ? logs[0].date : '-';
        return `
            <tr>
                <td class="p-3.5 font-bold">${idx + 1}</td>
                <td class="p-3.5 font-bold text-slate-800">${t.name}</td>
                <td class="p-3.5">${t.madrasah === 'BOTH' ? 'MTs & MA' : t.madrasah}</td>
                <td class="p-3.5"><span class="px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 font-bold">${logs.length} Sesi</span></td>
                <td class="p-3.5 text-slate-500">${lastDate}</td>
            </tr>
        `;
    }).join('');
}

// ==========================================
// 10. DATA MASTER (GURU & SISWA)
// ==========================================
async function handleAddTeacher(event) {
    event.preventDefault();
    const name = document.getElementById('new-teacher-name').value.trim();
    const username = document.getElementById('new-teacher-user').value.trim();
    const password = document.getElementById('new-teacher-pass').value.trim();
    const madrasah = document.getElementById('new-teacher-unit').value;
    const subjectsRaw = document.getElementById('new-teacher-subjects').value;
    const subjects = subjectsRaw.split(',').map(s => s.trim()).filter(Boolean);

    appData.teachers.push({
        id: 't-' + Date.now(),
        name,
        username,
        password,
        madrasah,
        subjects: subjects.length ? subjects : appData.subjects
    });

    await saveData();
    event.target.reset();
    renderMasterViews();
    showToast(`Akun guru ${name} berhasil ditambahkan.`, 'success');
}

async function deleteTeacher(id) {
    appData.teachers = appData.teachers.filter(t => t.id !== id);
    await saveData();
    renderMasterViews();
    showToast('Akun guru dihapus.', 'info');
}

function populateMasterClassDropdown() {
    const unit = document.getElementById('master-student-unit').value;
    const sel = document.getElementById('master-student-class');
    const classes = appData.classesByMadrasah[unit] || [];
    sel.innerHTML = classes.map(c => `<option value="${c}">Kelas ${c}</option>`).join('');
    renderMasterStudentList();
}

async function handleAddStudent(event) {
    event.preventDefault();
    const unit = document.getElementById('master-student-unit').value;
    const cls = document.getElementById('master-student-class').value;
    const name = document.getElementById('new-student-name').value.trim();
    const key = `${unit}_${cls}`;

    if (!appData.studentsByClass[key]) appData.studentsByClass[key] = [];
    appData.studentsByClass[key].push({ id: 's-' + Date.now(), name });

    await saveData();
    document.getElementById('new-student-name').value = '';
    renderMasterStudentList();
    showToast(`Siswa ${name} ditambahkan ke ${unit} Kelas ${cls}.`, 'success');
}

async function deleteStudent(unit, cls, id) {
    const key = `${unit}_${cls}`;
    appData.studentsByClass[key] = (appData.studentsByClass[key] || []).filter(s => s.id !== id);
    await saveData();
    renderMasterStudentList();
    showToast('Data siswa dihapus.', 'info');
}

function renderMasterStudentList() {
    const unit = document.getElementById('master-student-unit').value;
    const cls = document.getElementById('master-student-class').value;
    const key = `${unit}_${cls}`;
    const list = appData.studentsByClass[key] || [];
    document.getElementById('master-student-count').textContent = list.length;

    document.getElementById('master-student-list').innerHTML = list.map((s, idx) => `
        <div class="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs">
            <span><b>${idx + 1}.</b> ${s.name}</span>
            <button type="button" onclick="deleteStudent('${unit}', '${cls}', '${s.id}')" class="text-rose-600 hover:underline font-semibold">Hapus</button>
        </div>
    `).join('');
}

function renderMasterViews() {
    document.getElementById('master-teacher-list').innerHTML = (appData.teachers || []).map(t => `
        <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 text-xs">
            <div>
                <div class="font-bold text-slate-800">${t.name}</div>
                <div class="text-[11px] text-slate-500">User: <b>${t.username}</b> | PIN: <b>${t.password}</b> | Unit: ${t.madrasah}</div>
            </div>
            <button type="button" onclick="deleteTeacher('${t.id}')" class="text-rose-600 hover:underline font-bold">Hapus</button>
        </div>
    `).join('');
    populateMasterClassDropdown();
}

function refreshAllViews() {
    switchMadrasah(currentMadrasah);
    populateSubjectSelect();
    renderJournalRecap();
}

// Ekspos fungsi ke window agar bisa dipanggil dari HTML
Object.assign(window, {
    selectLoginRole,
    handleLogin,
    handleLogout,
    togglePasswordVisibility,
    switchTab,
    switchMadrasah,
    handleClassChange,
    markAllPresent,
    setStudentStatus,
    captureAttendanceLocation,
    saveAttendanceAndJournal,
    renderJournalRecap,
    resetJournalFilters,
    deleteJournal,
    exportJournalsToCSV,
    handleAddTeacher,
    deleteTeacher,
    populateMasterClassDropdown,
    handleAddStudent,
    deleteStudent,
    renderMasterStudentList
});

// Inisialisasi saat halaman dimuat
window.addEventListener('DOMContentLoaded', () => {
    if (window.lucide) lucide.createIcons();
    restoreActiveSession();
    initFirebaseConnection();
});