/* =========================================================
   APP.JS - LOGIKA APLIKASI JURNAL NURUL CHALIK
   ========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ==========================================
// 1. INISIALISASI FIREBASE & FIRESTORE REAL-TIME
// ==========================================
const appId = typeof __app_id !== 'undefined' ? __app_id : 'jurnal-kelas-nurul-chalik';

// Konfigurasi Firebase Proyek Jurnal Kelas Nurul Chalik
const EMBEDDED_FIREBASE_CONFIG = {
    apiKey: "AIzaSyB21CXI-Qc8Ff3SxrCBxDiTD3Zmh1MzdzM",
    authDomain: "jurnal-kelas-nurul-chalik.firebaseapp.com",
    projectId: "jurnal-kelas-nurul-chalik",
    storageBucket: "jurnal-kelas-nurul-chalik.firebasestorage.app",
    messagingSenderId: "628374094263",
    appId: "1:628374094263:web:31bd729503d2e8df2b2832"
};

let firebaseApp = null;
let auth = null;
let db = null;
let currentAuthUser = null;
let unsubscribeMasterDoc = null;
let isFirebaseReady = false;
let lastCloudSyncTime = null;

function getResolvedFirebaseConfig() {
    try {
        const savedCustom = localStorage.getItem('jnc_custom_firebase_config');
        if (savedCustom) return JSON.parse(savedCustom);
    } catch (e) {}

    if (EMBEDDED_FIREBASE_CONFIG && EMBEDDED_FIREBASE_CONFIG.apiKey && EMBEDDED_FIREBASE_CONFIG.projectId) {
        return EMBEDDED_FIREBASE_CONFIG;
    }

    if (typeof __firebase_config !== 'undefined' && __firebase_config) {
        try {
            return JSON.parse(__firebase_config);
        } catch (e) {
            console.error('Error parsing __firebase_config:', e);
        }
    }
    return null;
}

async function initFirebaseConnection(customConfigObj = null) {
    const config = customConfigObj || getResolvedFirebaseConfig();
    if (!config || !config.apiKey || !config.projectId) {
        updateCloudSyncIndicator('offline', 'Firebase Belum Dikonfigurasi');
        return;
    }

    try {
        updateCloudSyncIndicator('syncing', 'Menghubungkan Firebase...');
        if (unsubscribeMasterDoc) {
            unsubscribeMasterDoc();
            unsubscribeMasterDoc = null;
        }
        firebaseApp = initializeApp(config, 'JurnalNurulChalikApp-' + Date.now());
        auth = getAuth(firebaseApp);
        db = getFirestore(firebaseApp);

        const isUsingDefaultPreviewConfig = typeof __firebase_config !== 'undefined' &&
            __firebase_config &&
            JSON.parse(__firebase_config).projectId === config.projectId;

        if (isUsingDefaultPreviewConfig && typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            try {
                await signInWithCustomToken(auth, __initial_auth_token);
            } catch (tokenErr) {
                await signInAnonymously(auth);
            }
        } else {
            await signInAnonymously(auth);
        }

        onAuthStateChanged(auth, (user) => {
            currentAuthUser = user;
            if (user) {
                subscribeToFirestoreMasterDoc();
            }
        });
    } catch (err) {
        console.error('Firebase init error:', err);
        updateCloudSyncIndicator('error', 'Gagal Terhubung Firebase');
        showToast('Gagal menghubungkan ke Firebase: ' + (err.message || 'Periksa pengaturan Auth & Rules'), 'error');
    }
}

function getMasterDocRef() {
    const safeAppId = String(appId).replace(/[\/\.#\$\[\]]/g, '_');
    return doc(db, 'artifacts', safeAppId, 'public', 'data', 'jurnal_nurul_chalik', 'master_database');
}

function subscribeToFirestoreMasterDoc() {
    if (!db || !currentAuthUser) return;
    const masterRef = getMasterDocRef();

    unsubscribeMasterDoc = onSnapshot(masterRef, async (snapshot) => {
        isFirebaseReady = true;
        lastCloudSyncTime = new Date();
        updateCloudSyncIndicator('connected', 'Firebase Terhubung');

        if (snapshot.exists()) {
            const cloudData = snapshot.data();
            appData = mergeWithSchema(cloudData);
            saveLocalCacheOnly();
            if (!currentUser) {
                restoreCloudDeviceSession();
            }
        } else {
            await saveData();
        }

        if (currentUser) {
            refreshAllViews();
        }
    }, (error) => {
        console.error('Firestore onSnapshot error:', error);
        updateCloudSyncIndicator('error', 'Error Izin Firestore');
        showToast('Gagal sinkronisasi Firestore: ' + error.message, 'error');
    });
}

function updateCloudSyncIndicator(status, text) {
    const dot = document.getElementById('cloud-sync-dot');
    const label = document.getElementById('cloud-sync-text');
    const detail = document.getElementById('firebase-detail-status');
    if (label) label.textContent = text;
    if (detail) detail.textContent = text;

    if (dot) {
        dot.className = 'w-2 h-2 rounded-full';
        if (status === 'connected') dot.classList.add('bg-emerald-500');
        else if (status === 'syncing') dot.classList.add('bg-amber-500', 'animate-pulse');
        else if (status === 'error') dot.classList.add('bg-rose-500');
        else dot.classList.add('bg-slate-400');
    }
}

// ==========================================
// 2. STATE & STRUKTUR DATA UTAMA
// ==========================================
const LOCAL_CACHE_KEY = 'jurnal_nurul_chalik_master_data';
const SESSION_STORAGE_KEY = 'jurnal_nurul_chalik_active_session';

const defaultData = {
    academicYears: ['2025/2026', '2026/2027', '2027/2028'],
    activeAcademicYear: '2026/2027',
    activeSemester: 'Ganjil',
    activeMadrasah: 'MTs',
    madrasahList: ['MTs', 'MA'],
    kepalaMadrasah: {
        MTs: {
            name: 'Kepala MTs Nurul Chalik',
            nip: '-',
            city: 'Nurul Chalik'
        },
        MA: {
            name: 'Kepala MA Nurul Chalik',
            nip: '-',
            city: 'Nurul Chalik'
        },
        city: 'Nurul Chalik'
    },
    classesByMadrasah: {
        MTs: ['VII', 'VIII', 'IX'],
        MA: ['X', 'XI', 'XII']
    },
    classes: ['VII', 'VIII', 'IX', 'X', 'XI', 'XII'],
    subjects: [
        { id: 'MP01', code: 'PAI', name: 'Pendidikan Agama Islam' },
        { id: 'MP02', code: 'PKN', name: 'Pendidikan Pancasila' },
        { id: 'MP03', code: 'BIND', name: 'Bahasa Indonesia' },
        { id: 'MP04', code: 'MTK', name: 'Matematika' },
        { id: 'MP05', code: 'IPA', name: 'Ilmu Pengetahuan Alam' },
        { id: 'MP06', code: 'IPS', name: 'Ilmu Pengetahuan Sosial' },
        { id: 'MP07', code: 'BING', name: 'Bahasa Inggris' },
        { id: 'MP08', code: 'PJOK', name: 'Pendidikan Jasmani & Kesehatan' },
        { id: 'MP09', code: 'INF', name: 'Informatika' }
    ],
    teachers: [
        { id: 'G01', madrasah: 'MTs', name: 'Ust. Ahmad Fauzi, S.Pd.I.', nip: '198501102010011001', subject: 'Pendidikan Agama Islam', subjects: ['Pendidikan Agama Islam'], username: 'guru1', password: '123' },
        { id: 'G02', madrasah: 'MA', name: 'Siti Aminah, S.Pd.', nip: '198805152012022003', subject: 'Matematika, Informatika', subjects: ['Matematika', 'Informatika'], username: 'guru2', password: '123' }
    ],
    operators: [
        { id: 'OP01', name: 'Bambang (Operator Sekolah)', username: 'bambang', password: '321' }
    ],
    activeSessions: {},
    students: {
        'VII': [
            { id: 'S001', nis: '2026001', name: 'Ahmad Zulfikar', gender: 'L' },
            { id: 'S002', nis: '2026002', name: 'Aisyah Putri Rahma', gender: 'P' },
            { id: 'S003', nis: '2026003', name: 'Muhammad Rizki', gender: 'L' },
            { id: 'S004', nis: '2026004', name: 'Nurul Hidayah', gender: 'P' }
        ],
        'VIII': [
            { id: 'S005', nis: '2025001', name: 'Dimas Pratama', gender: 'L' },
            { id: 'S006', nis: '2025002', name: 'Fatimah Azzahra', gender: 'P' }
        ],
        'IX': [],
        'X': [
            { id: 'S007', nis: '2026101', name: 'Fajar Ramadhan', gender: 'L' },
            { id: 'S008', nis: '2026102', name: 'Salsabila Putri', gender: 'P' }
        ],
        'XI': [],
        'XII': []
    },
    attendance: {},
    journals: []
};

function getMadrasahFullName(code) {
    return code === 'MA' ? 'Madrasah Aliyah (MA) Nurul Chalik' : 'Madrasah Tsanawiyah (MTs) Nurul Chalik';
}

function inferMadrasahFromClass(cls) {
    if (!cls) return 'MTs';
    const cleanCls = normalizeClassToken(cls);
    if (appData?.classesByMadrasah) {
        if (Array.isArray(appData.classesByMadrasah.MA) && appData.classesByMadrasah.MA.some(c => normalizeClassToken(c) === cleanCls)) return 'MA';
        if (Array.isArray(appData.classesByMadrasah.MTs) && appData.classesByMadrasah.MTs.some(c => normalizeClassToken(c) === cleanCls)) return 'MTs';
    }
    if (/^(X|XI|XII)(\b|-|\s|$)/.test(cleanCls)) return 'MA';
    return 'MTs';
}

function normalizeClassToken(rawCls) {
    return String(rawCls || '')
        .toUpperCase()
        .replace(/^KELAS\s+/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function mergeWithSchema(raw) {
    const merged = JSON.parse(JSON.stringify(defaultData));
    if (!raw || typeof raw !== 'object') return merged;

    if (Array.isArray(raw.academicYears) && raw.academicYears.length > 0) merged.academicYears = raw.academicYears;
    if (typeof raw.activeAcademicYear === 'string' && raw.activeAcademicYear) merged.activeAcademicYear = raw.activeAcademicYear;
    if (raw.activeSemester === 'Ganjil' || raw.activeSemester === 'Genap') merged.activeSemester = raw.activeSemester;
    if (raw.activeMadrasah === 'MTs' || raw.activeMadrasah === 'MA') merged.activeMadrasah = raw.activeMadrasah;

    if (raw.kepalaMadrasah && typeof raw.kepalaMadrasah === 'object') {
        if (raw.kepalaMadrasah.MTs || raw.kepalaMadrasah.MA) {
            merged.kepalaMadrasah = {
                MTs: { ...merged.kepalaMadrasah.MTs, ...(raw.kepalaMadrasah.MTs || {}) },
                MA: { ...merged.kepalaMadrasah.MA, ...(raw.kepalaMadrasah.MA || {}) },
                city: raw.kepalaMadrasah.city || raw.kepalaMadrasah.MTs?.city || 'Nurul Chalik'
            };
        } else if (raw.kepalaMadrasah.name) {
            merged.kepalaMadrasah.MTs.name = raw.kepalaMadrasah.name;
            merged.kepalaMadrasah.MTs.nip = raw.kepalaMadrasah.nip || '-';
            merged.kepalaMadrasah.city = raw.kepalaMadrasah.city || 'Nurul Chalik';
        }
    }

    if (raw.classesByMadrasah && typeof raw.classesByMadrasah === 'object') {
        merged.classesByMadrasah = {
            MTs: Array.isArray(raw.classesByMadrasah.MTs) && raw.classesByMadrasah.MTs.length > 0 ? raw.classesByMadrasah.MTs : ['VII', 'VIII', 'IX'],
            MA: Array.isArray(raw.classesByMadrasah.MA) && raw.classesByMadrasah.MA.length > 0 ? raw.classesByMadrasah.MA : ['X', 'XI', 'XII']
        };
    } else if (Array.isArray(raw.classes) && raw.classes.length > 0) {
        const mtsList = [];
        const maList = [];
        raw.classes.forEach(c => {
            if (/^(X|XI|XII)(\b|-|\s)/i.test(c)) maList.push(c);
            else mtsList.push(c);
        });
        merged.classesByMadrasah = {
            MTs: mtsList.length > 0 ? mtsList : ['VII', 'VIII', 'IX'],
            MA: maList.length > 0 ? maList : ['X', 'XI', 'XII']
        };
    }

    merged.classes = Array.from(new Set([...merged.classesByMadrasah.MTs, ...merged.classesByMadrasah.MA]));
    if (Array.isArray(raw.subjects)) merged.subjects = raw.subjects;
    if (Array.isArray(raw.teachers)) {
        merged.teachers = raw.teachers.map(t => {
            const subjList = Array.isArray(t.subjects) && t.subjects.length > 0
                ? t.subjects
                : (t.subject ? String(t.subject).split(/[;|,]/).map(s => s.trim()).filter(Boolean) : []);
            const unit = (t.madrasah === 'MA' || t.madrasah === 'MTs' || t.madrasah === 'MTs & MA') ? t.madrasah : 'MTs';
            const rawSubByMad = (t.subjectsByMadrasah && typeof t.subjectsByMadrasah === 'object') ? t.subjectsByMadrasah : {};
            const mtsSubj = Array.isArray(rawSubByMad.MTs) && rawSubByMad.MTs.length > 0
                ? rawSubByMad.MTs
                : (unit === 'MTs' || unit === 'MTs & MA' ? subjList : []);
            const maSubj = Array.isArray(rawSubByMad.MA) && rawSubByMad.MA.length > 0
                ? rawSubByMad.MA
                : (unit === 'MA' || unit === 'MTs & MA' ? subjList : []);
            const rawSubByClass = (t.subjectsByClass && typeof t.subjectsByClass === 'object') ? t.subjectsByClass : {};
            const cleanSubByClass = {};
            const classMappedSubjects = [];
            const mappedMadrasahs = new Set();
            Object.entries(rawSubByClass).forEach(([clsKey, val]) => {
                const normCls = normalizeClassToken(clsKey);
                const arr = Array.isArray(val) ? val.filter(Boolean) : String(val || '').split(/[;|,]/).map(s => s.trim()).filter(Boolean);
                if (normCls && arr.length > 0) {
                    cleanSubByClass[normCls] = arr;
                    classMappedSubjects.push(...arr);
                    mappedMadrasahs.add(inferMadrasahFromClass(normCls));
                }
            });
            let resolvedUnit = unit;
            if (mappedMadrasahs.has('MTs') && mappedMadrasahs.has('MA')) {
                resolvedUnit = 'MTs & MA';
            } else if (mappedMadrasahs.has('MTs') && resolvedUnit === 'MA') {
                resolvedUnit = 'MTs & MA';
            } else if (mappedMadrasahs.has('MA') && resolvedUnit === 'MTs') {
                resolvedUnit = 'MTs & MA';
            }
            const combinedAll = Array.from(new Set([...subjList, ...mtsSubj, ...maSubj, ...classMappedSubjects]));
            return {
                ...t,
                madrasah: resolvedUnit,
                subjects: combinedAll,
                subjectsByMadrasah: {
                    MTs: mtsSubj,
                    MA: maSubj
                },
                subjectsByClass: cleanSubByClass,
                subject: combinedAll.join(', ') || t.subject || ''
            };
        });
    }
    if (Array.isArray(raw.operators) && raw.operators.length > 0) merged.operators = raw.operators;
    if (raw.activeSessions && typeof raw.activeSessions === 'object') merged.activeSessions = raw.activeSessions;
    if (raw.students && typeof raw.students === 'object') merged.students = raw.students;
    if (raw.attendance && typeof raw.attendance === 'object') merged.attendance = raw.attendance;
    if (Array.isArray(raw.journals)) merged.journals = raw.journals;
    return merged;
}

function getSubjectsForTeacherInContext(teacherObj, madrasahCode, className = currentClass) {
    if (!teacherObj) return [];
    const normCls = normalizeClassToken(className);
    const byClass = teacherObj.subjectsByClass;
    if (normCls && byClass && typeof byClass === 'object') {
        const matchedKey = Object.keys(byClass).find(k => normalizeClassToken(k) === normCls);
        if (matchedKey && Array.isArray(byClass[matchedKey]) && byClass[matchedKey].length > 0) {
            return byClass[matchedKey];
        }
    }
    const unit = teacherObj.madrasah || 'MTs';
    const byMad = teacherObj.subjectsByMadrasah;
    if (unit === 'MTs & MA' && byMad && typeof byMad === 'object') {
        const specific = Array.isArray(byMad[madrasahCode]) ? byMad[madrasahCode] : [];
        if (specific.length > 0) return specific;
    }
    if (Array.isArray(teacherObj.subjects) && teacherObj.subjects.length > 0) {
        return teacherObj.subjects;
    }
    return teacherObj.subject
        ? String(teacherObj.subject).split(/[;|,]/).map(s => s.trim()).filter(Boolean)
        : [];
}

function addClassSubjectMappingRow(containerId, presetClass = '', presetSubject = '') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const allClasses = Array.from(new Set([
        ...(appData.classesByMadrasah?.MTs || []),
        ...(appData.classesByMadrasah?.MA || []),
        ...(appData.classes || [])
    ]));
    const classOptions = allClasses.map(c => {
        const mad = inferMadrasahFromClass(c);
        const selected = normalizeClassToken(c) === normalizeClassToken(presetClass) ? 'selected' : '';
        return `<option value="${c}" ${selected}>${mad} - Kelas ${c}</option>`;
    }).join('');

    const subjectOptions = appData.subjects.map(s => {
        const selected = s.name === presetSubject ? 'selected' : '';
        return `<option value="${s.name}" ${selected}>${s.name}</option>`;
    }).join('');

    const row = document.createElement('div');
    row.className = 'class-subject-map-row flex items-center gap-1.5 bg-white p-1.5 rounded-lg border border-amber-200';
    row.innerHTML = `
        <select onchange="syncTeacherUnitFromClassMappings('${containerId}')" class="map-class-select w-1/3 text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-slate-50 font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-500">
            ${classOptions}
        </select>
        <select class="map-subject-select flex-1 text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-500">
            ${subjectOptions}
        </select>
        <button type="button" onclick="this.parentElement.remove(); syncTeacherUnitFromClassMappings('${containerId}')" class="text-rose-500 hover:bg-rose-50 p-1 rounded-md shrink-0" title="Hapus Aturan Kelas">
            <i data-lucide="x" class="w-3.5 h-3.5"></i>
        </button>
    `;
    container.appendChild(row);
    syncTeacherUnitFromClassMappings(containerId);
    if (window.lucide) lucide.createIcons();
}

function syncTeacherUnitFromClassMappings(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const unitSelectId = containerId.startsWith('edit-') ? 'edit-teacher-madrasah' : 'new-teacher-madrasah';
    const unitSelect = document.getElementById(unitSelectId);
    if (!unitSelect) return;

    const mappedMads = new Set();
    container.querySelectorAll('.map-class-select').forEach(sel => {
        if (sel.value) mappedMads.add(inferMadrasahFromClass(sel.value));
    });
    if (mappedMads.size === 0) return;

    const currentUnit = unitSelect.value;
    let nextUnit = currentUnit;
    if ((mappedMads.has('MTs') && mappedMads.has('MA')) ||
        (mappedMads.has('MTs') && currentUnit === 'MA') ||
        (mappedMads.has('MA') && currentUnit === 'MTs')) {
        nextUnit = 'MTs & MA';
    }

    if (nextUnit !== currentUnit) {
        unitSelect.value = nextUnit;
        if (containerId.startsWith('edit-')) {
            toggleEditTeacherSubjectMode();
        } else {
            toggleTeacherSubjectMode();
        }
    }
}

function collectClassSubjectMappings(containerId) {
    const container = document.getElementById(containerId);
    const result = {};
    if (!container) return result;
    container.querySelectorAll('.class-subject-map-row').forEach(row => {
        const cls = normalizeClassToken(row.querySelector('.map-class-select')?.value);
        const subj = (row.querySelector('.map-subject-select')?.value || '').trim();
        if (cls && subj) {
            if (!Array.isArray(result[cls])) result[cls] = [];
            if (!result[cls].includes(subj)) result[cls].push(subj);
        }
    });
    return result;
}

function toggleTeacherSubjectMode() {
    const unit = document.getElementById('new-teacher-madrasah')?.value || 'MTs';
    const singleGroup = document.getElementById('teacher-single-subject-group');
    const dualGroup = document.getElementById('teacher-dual-subject-group');
    if (!singleGroup || !dualGroup) return;

    if (unit === 'MTs & MA') {
        singleGroup.classList.add('hidden');
        dualGroup.classList.remove('hidden');
    } else {
        dualGroup.classList.add('hidden');
        singleGroup.classList.remove('hidden');
    }
    updateSelectedTeacherSubjectsCount();
}

function updateSelectedTeacherSubjectsCount() {
    const countSingle = document.querySelectorAll('input[name="new_teacher_subject"]:checked').length;
    const countMts = document.querySelectorAll('input[name="new_teacher_subject_mts"]:checked').length;
    const countMa = document.querySelectorAll('input[name="new_teacher_subject_ma"]:checked').length;

    const badge = document.getElementById('teacher-selected-subjects-count');
    const badgeMts = document.getElementById('teacher-selected-subjects-mts-count');
    const badgeMa = document.getElementById('teacher-selected-subjects-ma-count');
    if (badge) badge.textContent = `${countSingle} Mapel`;
    if (badgeMts) badgeMts.textContent = `${countMts} Mapel`;
    if (badgeMa) badgeMa.textContent = `${countMa} Mapel`;
}

function populateSubjectDropdowns() {
    const subjSel = document.getElementById('journal-subject');
    const allSubjects = Array.isArray(appData.subjects) ? appData.subjects : [];

    let activeTeacherObj = null;
    if (currentUser && currentUser.role === 'guru') {
        activeTeacherObj = appData.teachers.find(t => t.id === currentUser.id) || currentUser;
    } else {
        const selectedTeacherName = document.getElementById('journal-teacher-name')?.value || '';
        if (selectedTeacherName) {
            activeTeacherObj = appData.teachers.find(t => t.name === selectedTeacherName) || null;
        }
    }

    if (subjSel) {
        const prevVal = subjSel.value;
        let availableNames = allSubjects.map(s => s.name);
        if (activeTeacherObj) {
            const contextSubjects = getSubjectsForTeacherInContext(activeTeacherObj, currentMadrasah, currentClass);
            if (contextSubjects.length > 0) {
                availableNames = contextSubjects;
            }
        }
        subjSel.innerHTML = availableNames.length > 0
            ? availableNames.map(name => `<option value="${name}">${name}</option>`).join('')
            : `<option value="">Belum ada mata pelajaran</option>`;
        if (prevVal && availableNames.includes(prevVal)) {
            subjSel.value = prevVal;
        }
    }

    const renderTeacherCheckboxes = (containerId, inputName) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        const previouslyChecked = new Set(Array.from(container.querySelectorAll(`input[name="${inputName}"]:checked`)).map(cb => cb.value));
        if (allSubjects.length === 0) {
            container.innerHTML = '<p class="text-xs text-slate-400 p-2">Belum ada data mata pelajaran.</p>';
            return;
        }
        container.innerHTML = allSubjects.map(s => `
            <label class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100/80 cursor-pointer text-xs text-slate-700 select-none">
                <input type="checkbox" name="${inputName}" value="${s.name}" ${previouslyChecked.has(s.name) ? 'checked' : ''} onchange="updateSelectedTeacherSubjectsCount()" class="rounded border-slate-300 text-brand-600 focus:ring-brand-500">
                <span class="font-medium">${s.name}</span>
            </label>
        `).join('');
    };

    renderTeacherCheckboxes('new-teacher-subjects-list', 'new_teacher_subject');
    renderTeacherCheckboxes('new-teacher-subjects-mts-list', 'new_teacher_subject_mts');
    renderTeacherCheckboxes('new-teacher-subjects-ma-list', 'new_teacher_subject_ma');
    updateSelectedTeacherSubjectsCount();
}

// ==========================================
// 3. INISIALISASI STATE RUNTIME & PENYIMPANAN
// ==========================================
function loadInitialLocalCache() {
    try {
        const raw = localStorage.getItem(LOCAL_CACHE_KEY);
        if (raw) {
            return mergeWithSchema(JSON.parse(raw));
        }
    } catch (e) {
        console.warn('Gagal membaca cache lokal:', e);
    }
    return JSON.parse(JSON.stringify(defaultData));
}

function saveLocalCacheOnly() {
    try {
        localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(appData));
    } catch (e) {
        console.warn('Gagal menyimpan cache lokal:', e);
    }
}

async function saveData() {
    saveLocalCacheOnly();
    if (db && currentAuthUser) {
        try {
            const masterRef = getMasterDocRef();
            await setDoc(masterRef, JSON.parse(JSON.stringify(appData)));
        } catch (err) {
            console.warn('Gagal menyimpan ke Firestore (menggunakan cache lokal):', err);
        }
    }
}

let appData = loadInitialLocalCache();
let currentUser = null;
let selectedLoginRole = 'guru';
let currentMadrasah = appData.activeMadrasah || 'MTs';
let currentAcademicYear = appData.activeAcademicYear || '2026/2027';
let currentSemester = appData.activeSemester || 'Ganjil';
let currentClass = (appData.classesByMadrasah?.[currentMadrasah]?.[0]) || 'VII';
let currentAttendanceMap = {};
let currentLocationData = null;
let manageTeacherMadrasahTab = 'MTs';

function getDeviceFingerprintKey() {
    const raw = [
        navigator.userAgent || '',
        navigator.language || '',
        screen.width + 'x' + screen.height,
        Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    ].join('|');
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
        hash = ((hash << 5) - hash) + raw.charCodeAt(i);
        hash |= 0;
    }
    return 'DEV_' + Math.abs(hash).toString(36);
}

function saveActiveSession(userObj) {
    const sessionData = userObj ? {
        role: userObj.role,
        id: userObj.id,
        username: userObj.username,
        name: userObj.name,
        madrasah: userObj.madrasah || 'MTs',
        nip: userObj.nip || '-',
        subject: userObj.subject || '',
        subjects: userObj.subjects || [],
        subjectsByMadrasah: userObj.subjectsByMadrasah || null,
        subjectsByClass: userObj.subjectsByClass || null,
        updatedAt: Date.now()
    } : null;
    const payload = sessionData ? JSON.stringify(sessionData) : '';

    try {
        if (payload) localStorage.setItem(SESSION_STORAGE_KEY, payload);
        else localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (e) {}

    try {
        if (payload) sessionStorage.setItem(SESSION_STORAGE_KEY, payload);
        else sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (e) {}

    try {
        if (payload) {
            window.name = 'JNC_SESSION::' + encodeURIComponent(payload);
        } else if (window.name && window.name.startsWith('JNC_SESSION::')) {
            window.name = '';
        }
    } catch (e) {}

    try {
        if (sessionData && sessionData.username && sessionData.role) {
            const token = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify({
                r: sessionData.role,
                u: sessionData.username,
                i: sessionData.id
            })))));
            history.replaceState(null, '', '#jnc_auth=' + token);
        } else if (window.location.hash.startsWith('#jnc_auth=')) {
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    } catch (e) {}

    try {
        const devKey = getDeviceFingerprintKey();
        if (!appData.activeSessions || typeof appData.activeSessions !== 'object') {
            appData.activeSessions = {};
        }
        if (sessionData) {
            appData.activeSessions[devKey] = sessionData;
        } else {
            delete appData.activeSessions[devKey];
        }
        saveData();
    } catch (e) {}
}

function readRawActiveSession() {
    try {
        if (window.location.hash && window.location.hash.startsWith('#jnc_auth=')) {
            const encoded = decodeURIComponent(window.location.hash.slice('#jnc_auth='.length));
            const mini = JSON.parse(decodeURIComponent(escape(atob(encoded))));
            if (mini && mini.r && mini.u) {
                return JSON.stringify({ role: mini.r, username: mini.u, id: mini.i });
            }
        }
    } catch (e) {}

    try {
        const ls = localStorage.getItem(SESSION_STORAGE_KEY);
        if (ls) return ls;
    } catch (e) {}

    try {
        const ss = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (ss) return ss;
    } catch (e) {}

    try {
        if (window.name && window.name.startsWith('JNC_SESSION::')) {
            return decodeURIComponent(window.name.slice('JNC_SESSION::'.length));
        }
    } catch (e) {}

    try {
        const match = document.cookie.split('; ').find(row => row.startsWith(SESSION_STORAGE_KEY + '='));
        if (match) return decodeURIComponent(match.split('=')[1]);
    } catch (e) {}

    return null;
}

function applyRestoredUser(saved) {
    if (!saved || !saved.role) return false;
    if (saved.role === 'guru') {
        const foundTeacher = appData.teachers.find(t => t.id === saved.id || t.username?.toLowerCase() === saved.username?.toLowerCase());
        const activeTeacher = foundTeacher || (saved.name ? saved : null);
        if (activeTeacher) {
            currentUser = { role: 'guru', ...activeTeacher };
            if (activeTeacher.madrasah === 'MTs' || activeTeacher.madrasah === 'MA') {
                currentMadrasah = activeTeacher.madrasah;
                appData.activeMadrasah = activeTeacher.madrasah;
                const clsList = appData.classesByMadrasah?.[currentMadrasah] || (currentMadrasah === 'MA' ? ['X', 'XI', 'XII'] : ['VII', 'VIII', 'IX']);
                if (!clsList.includes(currentClass)) {
                    currentClass = clsList[0];
                }
            }
            enterApp(true);
            return true;
        }
    } else if (saved.role === 'operator') {
        const foundOp = appData.operators.find(o => o.id === saved.id || o.username?.toLowerCase() === saved.username?.toLowerCase());
        const activeOp = foundOp || (saved.name ? saved : null);
        if (activeOp) {
            currentUser = { role: 'operator', ...activeOp };
            enterApp(true);
            return true;
        }
    }
    return false;
}

function restoreCloudDeviceSession() {
    if (currentUser) return;
    try {
        const devKey = getDeviceFingerprintKey();
        const cloudSess = appData.activeSessions?.[devKey];
        if (cloudSess && cloudSess.role) {
            applyRestoredUser(cloudSess);
        }
    } catch (e) {}
}

function restoreActiveSession() {
    try {
        const rawSession = readRawActiveSession();
        if (rawSession) {
            const saved = JSON.parse(rawSession);
            if (applyRestoredUser(saved)) return;
        }
        restoreCloudDeviceSession();
    } catch (e) {
        console.warn('Gagal memulihkan sesi login:', e);
    }
}

// ==========================================
// 4. AUTENTIKASI & SIDEBAR
// ==========================================
function selectLoginRole(role) {
    selectedLoginRole = role;
    const btnGuru = document.getElementById('role-btn-guru');
    const btnOp = document.getElementById('role-btn-operator');
    if (role === 'guru') {
        btnGuru.className = 'py-2 text-xs sm:text-sm font-semibold rounded-lg bg-white text-brand-600 shadow-sm transition-all flex items-center justify-center gap-1.5';
        btnOp.className = 'py-2 text-xs sm:text-sm font-semibold rounded-lg text-slate-600 hover:text-slate-800 transition-all flex items-center justify-center gap-1.5';
    } else {
        btnOp.className = 'py-2 text-xs sm:text-sm font-semibold rounded-lg bg-white text-brand-600 shadow-sm transition-all flex items-center justify-center gap-1.5';
        btnGuru.className = 'py-2 text-xs sm:text-sm font-semibold rounded-lg text-slate-600 hover:text-slate-800 transition-all flex items-center justify-center gap-1.5';
    }
}

function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();

    if (selectedLoginRole === 'guru') {
        const foundTeacher = appData.teachers.find(t => t.username.toLowerCase() === username.toLowerCase() && t.password === password);
        if (!foundTeacher) {
            showToast('Username atau password Guru tidak sesuai!', 'error');
            return;
        }
        currentUser = { role: 'guru', ...foundTeacher };
        saveActiveSession(currentUser);
        if (foundTeacher.madrasah === 'MTs' || foundTeacher.madrasah === 'MA') {
            currentMadrasah = foundTeacher.madrasah;
            appData.activeMadrasah = foundTeacher.madrasah;
            const clsList = appData.classesByMadrasah?.[currentMadrasah] || (currentMadrasah === 'MA' ? ['X', 'XI', 'XII'] : ['VII', 'VIII', 'IX']);
            if (!clsList.includes(currentClass)) {
                currentClass = clsList[0];
            }
        }
        enterApp(false);
    } else {
        const foundOp = appData.operators.find(o => o.username.toLowerCase() === username.toLowerCase() && o.password === password);
        if (!foundOp) {
            showToast('Username atau password Operator tidak sesuai!', 'error');
            return;
        }
        currentUser = { role: 'operator', ...foundOp };
        saveActiveSession(currentUser);
        enterApp(false);
    }
}

function enterApp(isRestored = false) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-wrapper').classList.remove('hidden');
    document.getElementById('app-wrapper').classList.add('flex');

    document.getElementById('header-user-name').textContent = currentUser.name;
    document.getElementById('header-user-role').textContent = currentUser.role === 'operator' ? 'Operator Sekolah' : 'Guru Pengajar';

    const isOperator = currentUser.role === 'operator';
    document.querySelectorAll('.operator-only').forEach(el => {
        if (isOperator) el.classList.remove('hidden');
        else el.classList.add('hidden');
    });

    const guruBanner = document.getElementById('guru-mobile-banner');
    const opCards = document.getElementById('operator-summary-cards');
    if (guruBanner && opCards) {
        if (isOperator) {
            guruBanner.classList.add('hidden');
            opCards.classList.remove('hidden');
        } else {
            guruBanner.classList.remove('hidden');
            opCards.classList.add('hidden');
        }
    }

    const madSelect = document.getElementById('global-madrasah-select');
    if (madSelect) {
        if (!isOperator && (currentUser.madrasah === 'MTs' || currentUser.madrasah === 'MA')) {
            madSelect.disabled = true;
            madSelect.classList.add('opacity-80', 'cursor-default');
        } else {
            madSelect.disabled = false;
            madSelect.classList.remove('opacity-80', 'cursor-default');
        }
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('attendance-date');
    if (dateInput && !dateInput.value) dateInput.value = todayStr;

    switchMobileInputStep('absen');
    populateMadrasahDropdown();
    populateAcademicYearDropdown();
    populateSemesterDropdown();
    populateClassDropdown();
    populateSubjectDropdowns();
    setupTeacherJournalField();
    renderLessonHourCheckboxes();
    switchTab('tab-input');
    captureAttendanceLocation(false);
    refreshAllViews();
    if (window.lucide) lucide.createIcons();
    if (!isRestored) {
        showToast('Selamat datang, ' + currentUser.name, 'success');
    }
}

function switchMobileInputStep(step) {
    const absenPanel = document.getElementById('mobile-step-panel-absen');
    const jurnalPanel = document.getElementById('mobile-step-panel-jurnal');
    const btnAbsen = document.getElementById('mobile-step-btn-absen');
    const btnJurnal = document.getElementById('mobile-step-btn-jurnal');
    if (!absenPanel || !jurnalPanel) return;

    if (step === 'jurnal') {
        absenPanel.classList.add('hidden', 'lg:flex');
        absenPanel.classList.remove('flex');
        jurnalPanel.classList.remove('hidden');
        jurnalPanel.classList.add('flex');

        if (btnJurnal && btnAbsen) {
            btnJurnal.className = 'py-2.5 px-3 rounded-xl text-xs font-bold bg-brand-600 text-white shadow-xs transition-all flex items-center justify-center gap-1.5';
            btnAbsen.className = 'py-2.5 px-3 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all flex items-center justify-center gap-1.5';
        }
    } else {
        jurnalPanel.classList.add('hidden', 'lg:flex');
        jurnalPanel.classList.remove('flex');
        absenPanel.classList.remove('hidden');
        absenPanel.classList.add('flex');

        if (btnAbsen && btnJurnal) {
            btnAbsen.className = 'py-2.5 px-3 rounded-xl text-xs font-bold bg-brand-600 text-white shadow-xs transition-all flex items-center justify-center gap-1.5';
            btnJurnal.className = 'py-2.5 px-3 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all flex items-center justify-center gap-1.5';
        }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handleLogout() {
    currentUser = null;
    saveActiveSession(null);
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('app-wrapper').classList.add('hidden');
    document.getElementById('app-wrapper').classList.remove('flex');
    document.getElementById('login-screen').classList.remove('hidden');
    toggleSidebar(false);
}

function toggleSidebar(open) {
    const sidebar = document.getElementById('app-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (!sidebar || !backdrop) return;
    if (open) {
        sidebar.classList.remove('-translate-x-full');
        backdrop.classList.remove('hidden');
    } else {
        sidebar.classList.add('-translate-x-full');
        backdrop.classList.add('hidden');
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(sec => sec.classList.add('hidden'));
    const target = document.getElementById(tabId);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('bg-brand-600', 'text-white', 'shadow-sm');
        btn.classList.add('text-slate-600', 'hover:bg-slate-100');
    });
    const activeBtn = document.getElementById('btn-' + tabId);
    if (activeBtn) {
        activeBtn.classList.add('bg-brand-600', 'text-white', 'shadow-sm');
        activeBtn.classList.remove('text-slate-600', 'hover:bg-slate-100');
    }

    const titles = {
        'tab-input': 'Input Absen & Jurnal Kelas',
        'tab-rekap-guru': 'Rekap Kehadiran Guru Masuk Kelas',
        'tab-rekap-absen': 'Rekapitulasi Kehadiran Siswa',
        'tab-rekap-jurnal': 'Arsip Jurnal Kegiatan Mengajar',
        'tab-siswa': 'Manajemen Data Siswa',
        'tab-guru': 'Manajemen Data & Akun Guru',
        'tab-mapel': 'Manajemen Mata Pelajaran',
        'tab-gdrive': 'Koneksi Firebase Cloud'
    };
    const topbarTitle = document.getElementById('topbar-page-title');
    if (topbarTitle) topbarTitle.textContent = titles[tabId] || 'Jurnal Nurul Chalik';

    if (tabId === 'tab-rekap-absen') renderAttendanceRecap();
    if (tabId === 'tab-rekap-jurnal') {
        populateJournalRecapFilters();
        renderJournalRecap();
    }
    if (tabId === 'tab-rekap-guru') {
        populateTeacherRecapFilters();
        renderTeacherClassRecap();
    }
    if (tabId === 'tab-siswa') renderManageStudents();
    if (tabId === 'tab-guru') renderManageTeachers();
    if (tabId === 'tab-mapel') renderManageSubjects();
}

// ==========================================
// 5. SINKRONISASI DROPDOWN MADRASAH, TAHUN, SEMESTER, KELAS & MAPEL
// ==========================================
function populateMadrasahDropdown() {
    const madSel = document.getElementById('global-madrasah-select');
    if (currentMadrasah !== 'MTs' && currentMadrasah !== 'MA') {
        currentMadrasah = appData.activeMadrasah || 'MTs';
    }
    if (madSel) madSel.value = currentMadrasah;
}

async function handleMadrasahChange(newMadrasah) {
    currentMadrasah = newMadrasah;
    appData.activeMadrasah = newMadrasah;
    const classesForMadrasah = appData.classesByMadrasah?.[currentMadrasah] || (currentMadrasah === 'MA' ? ['X', 'XI', 'XII'] : ['VII', 'VIII', 'IX']);
    if (!classesForMadrasah.includes(currentClass)) {
        currentClass = classesForMadrasah[0] || (currentMadrasah === 'MA' ? 'X' : 'VII');
    }
    populateMadrasahDropdown();
    populateClassDropdown();
    setupTeacherJournalField();
    await saveData();
    refreshAllViews();
    showToast(`Jenjang aktif: ${getMadrasahFullName(currentMadrasah)}`, 'info');
}

function populateAcademicYearDropdown() {
    const yearSel = document.getElementById('global-academic-year-select');
    if (!Array.isArray(appData.academicYears) || appData.academicYears.length === 0) {
        appData.academicYears = ['2025/2026', '2026/2027', '2027/2028'];
    }
    if (!appData.academicYears.includes(currentAcademicYear)) {
        currentAcademicYear = appData.activeAcademicYear || appData.academicYears[0] || '2026/2027';
    }
    if (yearSel) {
        yearSel.innerHTML = appData.academicYears.map(yr => `<option value="${yr}">TP ${yr}</option>`).join('');
        yearSel.value = currentAcademicYear;
    }
}

function populateSemesterDropdown() {
    const semSel = document.getElementById('global-semester-select');
    if (currentSemester !== 'Ganjil' && currentSemester !== 'Genap') {
        currentSemester = appData.activeSemester || 'Ganjil';
    }
    if (semSel) {
        semSel.value = currentSemester;
    }
}

async function handleSemesterChange(newSem) {
    currentSemester = newSem;
    appData.activeSemester = newSem;
    populateSemesterDropdown();
    await saveData();
    refreshAllViews();
    showToast(`Semester aktif: Semester ${currentSemester}`, 'info');
}

async function handleAcademicYearChange(newYear) {
    currentAcademicYear = newYear;
    appData.activeAcademicYear = newYear;
    const yearSel = document.getElementById('global-academic-year-select');
    if (yearSel) yearSel.value = currentAcademicYear;
    await saveData();
    refreshAllViews();
    showToast(`Tahun Pelajaran aktif: ${currentAcademicYear}`, 'info');
}

async function addNewAcademicYear(e) {
    e.preventDefault();
    const raw = document.getElementById('new-academic-year-name').value.trim();
    if (!raw) return;
    if (!appData.academicYears.includes(raw)) {
        appData.academicYears.push(raw);
        appData.academicYears.sort();
        currentAcademicYear = raw;
        appData.activeAcademicYear = raw;
        await saveData();
        populateAcademicYearDropdown();
        refreshAllViews();
        showToast(`Tahun Pelajaran ${raw} berhasil ditambahkan`, 'success');
    } else {
        showToast(`Tahun Pelajaran ${raw} sudah terdaftar`, 'info');
    }
    document.getElementById('new-academic-year-name').value = '';
    closeModal('modal-add-year');
}

function populateClassDropdown() {
    const globalSel = document.getElementById('global-class-select');
    const inputSel = document.getElementById('input-class-filter');
    const manageSel = document.getElementById('manage-students-class-filter');
    const datalist = document.getElementById('class-suggestions-list');

    const activeMadrasahClasses = appData.classesByMadrasah?.[currentMadrasah] || (currentMadrasah === 'MA' ? ['X', 'XI', 'XII'] : ['VII', 'VIII', 'IX']);
    if (!activeMadrasahClasses.includes(currentClass)) {
        currentClass = activeMadrasahClasses[0] || (currentMadrasah === 'MA' ? 'X' : 'VII');
    }

    const activeClassOptionsHtml = activeMadrasahClasses.map(cls => `<option value="${cls}">Kelas ${cls} (${currentMadrasah})</option>`).join('');
    const allClassOptionsHtml = [
        ...(appData.classesByMadrasah?.MTs || []).map(cls => `<option value="${cls}">MTs - Kelas ${cls}</option>`),
        ...(appData.classesByMadrasah?.MA || []).map(cls => `<option value="${cls}">MA - Kelas ${cls}</option>`)
    ].join('');

    if (globalSel) {
        globalSel.innerHTML = activeClassOptionsHtml;
        globalSel.value = currentClass;
    }
    if (inputSel) {
        inputSel.innerHTML = activeClassOptionsHtml;
        inputSel.value = currentClass;
    }
    if (manageSel) {
        const prevVal = manageSel.value || 'ALL';
        manageSel.innerHTML = `<option value="ALL">Semua Kelas (MTs & MA)</option>` + allClassOptionsHtml;
        manageSel.value = prevVal;
    }
    if (datalist) {
        datalist.innerHTML = activeMadrasahClasses.map(cls => `<option value="${cls}">`).join('');
    }
    populateJournalRecapFilters();
}

function updateNewStudentClassSuggestions() {
    const mad = document.getElementById('new-student-madrasah')?.value || 'MTs';
    const datalist = document.getElementById('class-suggestions-list');
    const list = appData.classesByMadrasah?.[mad] || (mad === 'MA' ? ['X', 'XI', 'XII'] : ['VII', 'VIII', 'IX']);
    if (datalist) {
        datalist.innerHTML = list.map(cls => `<option value="${cls}">`).join('');
    }
}

function handleClassChange(newClass) {
    currentClass = newClass;
    const inferred = inferMadrasahFromClass(newClass);
    if (inferred !== currentMadrasah) {
        currentMadrasah = inferred;
        appData.activeMadrasah = inferred;
        populateMadrasahDropdown();
        populateClassDropdown();
    }
    const globalSel = document.getElementById('global-class-select');
    const inputSel = document.getElementById('input-class-filter');
    if (globalSel) globalSel.value = currentClass;
    if (inputSel) inputSel.value = currentClass;
    populateSubjectDropdowns();
    refreshAllViews();
}

function setupTeacherJournalField() {
    const container = document.getElementById('teacher-input-container');
    if (!container || !currentUser) return;

    if (currentUser.role === 'guru') {
        container.innerHTML = `<input type="text" id="journal-teacher-name" value="${currentUser.name}" readonly class="w-full text-sm border border-slate-200 bg-slate-100 text-slate-700 font-semibold rounded-xl px-3 py-2 cursor-not-allowed">`;
    } else {
        const filteredTeachers = appData.teachers.filter(t => {
            const unit = t.madrasah || 'MTs';
            return unit === currentMadrasah || unit === 'MTs & MA';
        });
        const options = filteredTeachers.length > 0
            ? filteredTeachers.map(t => `<option value="${t.name}">${t.name} (${t.madrasah || 'MTs'})</option>`).join('')
            : `<option value="">Belum ada guru terdaftar di unit ${currentMadrasah}</option>`;
        container.innerHTML = `<select id="journal-teacher-name" onchange="populateSubjectDropdowns()" required class="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">${options}</select>`;
    }
    populateSubjectDropdowns();
}

function renderLessonHourCheckboxes() {
    const container = document.getElementById('journal-hours-checkboxes');
    if (!container) return;
    let html = '';
    for (let i = 1; i <= 8; i++) {
        html += `
            <label class="cursor-pointer select-none">
                <input type="checkbox" name="lesson_hour" value="${i}" onchange="updateSelectedHoursCount()" class="peer sr-only">
                <div class="text-center py-2 px-1 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-600 peer-checked:bg-brand-600 peer-checked:text-white peer-checked:border-brand-600 transition-all shadow-2xs">
                    Jam ${i}
                </div>
            </label>
        `;
    }
    container.innerHTML = html;
    updateSelectedHoursCount();
}

function updateSelectedHoursCount() {
    const checked = document.querySelectorAll('input[name="lesson_hour"]:checked');
    const badge = document.getElementById('selected-hours-badge');
    if (badge) badge.textContent = `${checked.length} Jam dipilih`;
}

// ==========================================
// 6. DETEKSI LOKASI GPS & MANUAL
// ==========================================
function captureAttendanceLocation(isManualTrigger = false) {
    const statusEl = document.getElementById('location-status-text');
    if (!statusEl) return;

    if (!navigator.geolocation) {
        currentLocationData = null;
        statusEl.innerHTML = `<span class="text-amber-700 font-medium">Peramban tidak mendukung GPS. Silakan isi keterangan ruang di bawah.</span>`;
        return;
    }

    statusEl.textContent = 'Mendeteksi koordinat lokasi GPS...';
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = pos.coords.latitude.toFixed(6);
            const lng = pos.coords.longitude.toFixed(6);
            currentLocationData = { lat, lng, url: `https://maps.google.com/?q=${lat},${lng}` };
            statusEl.innerHTML = `<span class="text-emerald-700 font-semibold">GPS Aktif: ${lat}, ${lng}</span> <a href="${currentLocationData.url}" target="_blank" class="underline text-sky-700 ml-1">Lihat Peta</a>`;
            if (isManualTrigger) showToast('Koordinat lokasi GPS berhasil diperbarui', 'success');
        },
        () => {
            currentLocationData = null;
            statusEl.innerHTML = `<span class="text-amber-700 font-medium">Akses GPS tidak aktif atau dibatasi. Silakan isi keterangan ruang manual di bawah.</span>`;
            if (isManualTrigger) showToast('Akses lokasi GPS tidak tersedia. Gunakan keterangan ruang manual.', 'info');
        },
        { enableHighAccuracy: true, timeout: 8000 }
    );
}

// ==========================================
// 7. INPUT ABSENSI & JURNAL KELAS
// ==========================================
function getAttendanceKey(cls, date, year = currentAcademicYear, sem = currentSemester) {
    return `${year}__${sem}__${cls}__${date}`;
}

function findAttendanceRecord(cls, date, year = currentAcademicYear, sem = currentSemester) {
    const fullKey = getAttendanceKey(cls, date, year, sem);
    if (appData.attendance[fullKey]) return appData.attendance[fullKey];
    if (sem === 'Ganjil') {
        const yearOnlyKey = `${year}__${cls}__${date}`;
        if (appData.attendance[yearOnlyKey]) return appData.attendance[yearOnlyKey];
        const legacyKey = `${cls}__${date}`;
        if (year === '2026/2027' && appData.attendance[legacyKey]) return appData.attendance[legacyKey];
    }
    return null;
}

function getMatchingAttendanceKeysForClass(cls, year = currentAcademicYear, sem = currentSemester, monthFilter = 'ALL') {
    return Object.keys(appData.attendance).filter(k => {
        const parts = k.split('__');
        if (parts.length === 4) {
            const [recYear, recSem, recCls, dt] = parts;
            if (recYear !== year || recSem !== sem || recCls !== cls) return false;
            return monthFilter === 'ALL' || (dt || '').startsWith(monthFilter);
        } else if (parts.length === 3 && sem === 'Ganjil') {
            const [recYear, recCls, dt] = parts;
            if (recYear !== year || recCls !== cls) return false;
            return monthFilter === 'ALL' || (dt || '').startsWith(monthFilter);
        } else if (parts.length === 2 && year === '2026/2027' && sem === 'Ganjil') {
            const [recCls, dt] = parts;
            if (recCls !== cls) return false;
            return monthFilter === 'ALL' || (dt || '').startsWith(monthFilter);
        }
        return false;
    });
}

function loadAttendanceForDate() {
    const dateVal = document.getElementById('attendance-date').value;
    const students = appData.students[currentClass] || [];
    const savedRecord = findAttendanceRecord(currentClass, dateVal, currentAcademicYear, currentSemester) || {};

    currentAttendanceMap = {};
    students.forEach(s => {
        currentAttendanceMap[s.id] = savedRecord[s.id] || 'H';
    });

    renderAttendanceTable();
}

function renderAttendanceTable() {
    const tbody = document.getElementById('attendance-list-body');
    if (!tbody) return;
    const students = appData.students[currentClass] || [];

    if (students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-xs text-slate-400">Belum ada data siswa di Kelas ${currentClass}.</td></tr>`;
        updateLiveAttendanceSummary();
        return;
    }

    tbody.innerHTML = students.map((s, idx) => {
        const st = currentAttendanceMap[s.id] || 'H';
        const btnStyle = (code, activeBg) => st === code
            ? `${activeBg} text-white font-bold shadow-xs scale-105`
            : `bg-slate-100 text-slate-600 hover:bg-slate-200 font-semibold`;

        return `
            <tr class="hover:bg-slate-50/80 transition-colors">
                <td class="py-3 px-2.5 sm:px-4 text-center text-xs font-semibold text-slate-500">${idx + 1}</td>
                <td class="py-3 px-2 sm:px-4">
                    <div class="font-semibold text-slate-800 text-xs sm:text-sm leading-snug">${s.name}</div>
                    <div class="text-[11px] text-slate-400">NIS: ${s.nis}</div>
                </td>
                <td class="py-3 px-2.5 sm:px-4">
                    <div class="flex items-center justify-center gap-1.5 sm:gap-2">
                        <button type="button" onclick="setStudentStatus('${s.id}', 'H')" title="Hadir" class="w-9 h-9 rounded-xl text-xs transition-all ${btnStyle('H', 'bg-emerald-600')}">H</button>
                        <button type="button" onclick="setStudentStatus('${s.id}', 'S')" title="Sakit" class="w-9 h-9 rounded-xl text-xs transition-all ${btnStyle('S', 'bg-amber-500')}">S</button>
                        <button type="button" onclick="setStudentStatus('${s.id}', 'I')" title="Izin" class="w-9 h-9 rounded-xl text-xs transition-all ${btnStyle('I', 'bg-sky-600')}">I</button>
                        <button type="button" onclick="setStudentStatus('${s.id}', 'A')" title="Alpa" class="w-9 h-9 rounded-xl text-xs transition-all ${btnStyle('A', 'bg-rose-600')}">A</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    updateLiveAttendanceSummary();
}

function setStudentStatus(studentId, status) {
    currentAttendanceMap[studentId] = status;
    renderAttendanceTable();
}

function markAllPresent() {
    const students = appData.students[currentClass] || [];
    students.forEach(s => { currentAttendanceMap[s.id] = 'H'; });
    renderAttendanceTable();
    showToast('Semua siswa ditandai Hadir (H)', 'success');
}

function updateLiveAttendanceSummary() {
    const students = appData.students[currentClass] || [];
    const counts = { H: 0, S: 0, I: 0, A: 0 };
    const absentList = [];

    students.forEach(s => {
        const st = currentAttendanceMap[s.id] || 'H';
        counts[st] = (counts[st] || 0) + 1;
        if (st !== 'H') {
            absentList.push(`${s.name} (${st})`);
        }
    });

    ['H', 'S', 'I', 'A'].forEach(code => {
        const el = document.getElementById(`live-count-${code}`);
        if (el) el.textContent = counts[code];
    });

    const preview = document.getElementById('absent-students-preview');
    if (preview) {
        preview.textContent = absentList.length > 0 ? absentList.join(', ') : 'Semua siswa hadir.';
    }
}

async function saveAttendanceOnly() {
    const dateVal = document.getElementById('attendance-date').value;
    if (!dateVal) {
        showToast('Pilih tanggal absensi terlebih dahulu!', 'error');
        return;
    }
    const key = getAttendanceKey(currentClass, dateVal, currentAcademicYear, currentSemester);
    appData.attendance[key] = { ...currentAttendanceMap };
    await saveData();
    refreshAllViews();
    showToast(`Absensi Kelas ${currentClass} (TP ${currentAcademicYear} - ${currentSemester}) tanggal ${dateVal} berhasil disimpan!`, 'success');
}

async function saveAttendanceAndJournal(e) {
    e.preventDefault();
    const dateVal = document.getElementById('attendance-date').value;
    const teacherName = document.getElementById('journal-teacher-name').value.trim();
    const subject = document.getElementById('journal-subject').value;
    const checkedHours = Array.from(document.querySelectorAll('input[name="lesson_hour"]:checked')).map(cb => cb.value);
    const topic = document.getElementById('journal-topic').value.trim();
    const activity = document.getElementById('journal-activity').value.trim();
    const notes = document.getElementById('journal-notes').value.trim();
    const manualLoc = document.getElementById('manual-location-input').value.trim();

    if (checkedHours.length === 0) {
        showToast('Pilih minimal 1 jam pelajaran (Jam 1 - 8)!', 'error');
        return;
    }

    const key = getAttendanceKey(currentClass, dateVal, currentAcademicYear, currentSemester);
    appData.attendance[key] = { ...currentAttendanceMap };

    const students = appData.students[currentClass] || [];
    const summary = { H: 0, S: 0, I: 0, A: 0 };
    const absentDetails = [];
    students.forEach(s => {
        const st = currentAttendanceMap[s.id] || 'H';
        summary[st]++;
        if (st !== 'H') absentDetails.push(`${s.name} (${st})`);
    });

    let locationSummary = manualLoc || `Ruang Kelas ${currentClass}`;
    if (currentLocationData) {
        locationSummary += ` [GPS: ${currentLocationData.lat}, ${currentLocationData.lng}]`;
    }

    const newJournal = {
        id: 'JRN-' + Date.now(),
        madrasah: currentMadrasah,
        academicYear: currentAcademicYear,
        semester: currentSemester,
        date: dateVal,
        className: currentClass,
        teacherName,
        subject,
        hours: checkedHours.join(', '),
        hourCount: checkedHours.length,
        topic,
        activity,
        notes,
        location: locationSummary,
        mapUrl: currentLocationData ? currentLocationData.url : '',
        attendanceSummary: summary,
        absentDetails: absentDetails.join(', ') || 'Nihil (Hadir Semua)',
        createdAt: new Date().toISOString()
    };

    appData.journals.unshift(newJournal);
    await saveData();

    document.getElementById('journal-topic').value = '';
    document.getElementById('journal-activity').value = '';
    document.getElementById('journal-notes').value = '';
    document.querySelectorAll('input[name="lesson_hour"]:checked').forEach(cb => cb.checked = false);
    updateSelectedHoursCount();

    showToast('Absensi & Jurnal Mengajar berhasil disimpan!', 'success');
    refreshAllViews();
}

// ==========================================
// 8. DASHBOARD SUMMARY & REKAPITULASI
// ==========================================
function updateDashboardStats() {
    const students = appData.students[currentClass] || [];
    const totalStudentsEl = document.getElementById('stat-total-students');
    const activeClassEl = document.getElementById('stat-active-class');
    if (totalStudentsEl) totalStudentsEl.textContent = students.length;
    if (activeClassEl) activeClassEl.textContent = `${currentMadrasah} • Kelas ${currentClass} • TP ${currentAcademicYear} (${currentSemester})`;

    const guruClassInfo = document.getElementById('guru-banner-class-info');
    const guruPeriodInfo = document.getElementById('guru-banner-period-info');
    const guruStudentCount = document.getElementById('guru-banner-student-count');
    if (guruClassInfo) guruClassInfo.textContent = `${currentMadrasah} • Kelas ${currentClass}`;
    if (guruPeriodInfo) guruPeriodInfo.textContent = `TP ${currentAcademicYear} • Semester ${currentSemester}`;
    if (guruStudentCount) guruStudentCount.textContent = students.length;

    const classJournals = appData.journals.filter(j =>
        (j.madrasah || inferMadrasahFromClass(j.className)) === currentMadrasah &&
        j.className === currentClass &&
        (j.academicYear || '2026/2027') === currentAcademicYear &&
        (j.semester || 'Ganjil') === currentSemester
    );
    const totalJournalsEl = document.getElementById('stat-total-journals');
    if (totalJournalsEl) totalJournalsEl.textContent = classJournals.length;

    let totalH = 0, totalAll = 0;
    const yearKeys = getMatchingAttendanceKeysForClass(currentClass, currentAcademicYear, currentSemester, 'ALL');
    yearKeys.forEach(key => {
        const record = appData.attendance[key] || {};
        Object.values(record).forEach(st => {
            totalAll++;
            if (st === 'H') totalH++;
        });
    });
    const avgPct = totalAll > 0 ? Math.round((totalH / totalAll) * 100) : 0;
    const avgEl = document.getElementById('stat-avg-attendance');
    if (avgEl) avgEl.textContent = `${avgPct}%`;

    const today = new Date().toISOString().split('T')[0];
    const todayRecord = findAttendanceRecord(currentClass, today, currentAcademicYear, currentSemester);
    const todayStatusEl = document.getElementById('stat-today-status');
    const todayDetailEl = document.getElementById('stat-today-detail');
    if (todayRecord) {
        const vals = Object.values(todayRecord);
        const hCount = vals.filter(v => v === 'H').length;
        if (todayStatusEl) {
            todayStatusEl.textContent = 'Sudah Diisi';
            todayStatusEl.className = 'text-lg font-bold text-emerald-600 mt-1';
        }
        if (todayDetailEl) todayDetailEl.textContent = `${hCount}/${vals.length} siswa hadir`;
    } else {
        if (todayStatusEl) {
            todayStatusEl.textContent = 'Belum Diisi';
            todayStatusEl.className = 'text-lg font-bold text-amber-600 mt-1';
        }
        if (todayDetailEl) todayDetailEl.textContent = today;
    }
}

function populateMonthFilters() {
    const months = new Set();
    Object.keys(appData.attendance).forEach(k => {
        const parts = k.split('__');
        const datePart = parts[parts.length - 1];
        if (datePart && /^\d{4}-\d{2}/.test(datePart)) months.add(datePart.slice(0, 7));
    });
    appData.journals.forEach(j => {
        if (j.date && (j.academicYear || '2026/2027') === currentAcademicYear && (j.semester || 'Ganjil') === currentSemester) {
            months.add(j.date.slice(0, 7));
        }
    });

    const monthNames = {
        '01': 'Januari', '02': 'Februari', '03': 'Maret', '04': 'April',
        '05': 'Mei', '06': 'Juni', '07': 'Juli', '08': 'Agustus',
        '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Desember'
    };
    const formatMonthLabel = (ym) => {
        const [y, m] = ym.split('-');
        return `${monthNames[m] || m} ${y}`;
    };

    const sortedMonths = Array.from(months).sort().reverse();
    const optionsHtml = `<option value="ALL">Semua Bulan</option>` + sortedMonths.map(m => `<option value="${m}">${formatMonthLabel(m)} (${m})</option>`).join('');

    ['rekap-month-filter', 'jurnal-month-filter', 'filter-rg-month'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const prev = el.value || 'ALL';
            el.innerHTML = optionsHtml;
            el.value = sortedMonths.includes(prev) ? prev : 'ALL';
        }
    });
}

function renderAttendanceRecap() {
    const label = document.getElementById('rekap-class-label');
    if (label) label.textContent = `${currentClass} (${currentMadrasah})`;
    const yearLabel = document.getElementById('rekap-year-label');
    if (yearLabel) yearLabel.textContent = currentAcademicYear;
    const semLabel = document.getElementById('rekap-semester-label');
    if (semLabel) semLabel.textContent = `Semester ${currentSemester}`;

    const tbody = document.getElementById('rekap-absen-body');
    if (!tbody) return;

    const students = appData.students[currentClass] || [];
    const monthFilter = document.getElementById('rekap-month-filter')?.value || 'ALL';
    const matchingKeys = getMatchingAttendanceKeysForClass(currentClass, currentAcademicYear, currentSemester, monthFilter);

    if (students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="py-8 text-center text-xs text-slate-400">Belum ada data siswa di Kelas ${currentClass}.</td></tr>`;
        return;
    }

    tbody.innerHTML = students.map((s, idx) => {
        let H = 0, S = 0, I = 0, A = 0;
        matchingKeys.forEach(k => {
            const st = appData.attendance[k][s.id];
            if (st === 'H') H++;
            else if (st === 'S') S++;
            else if (st === 'I') I++;
            else if (st === 'A') A++;
        });
        const total = H + S + I + A;
        const pct = total > 0 ? Math.round((H / total) * 100) : 0;

        return `
            <tr class="hover:bg-slate-50">
                <td class="py-3 px-4 text-center text-xs font-semibold text-slate-500">${idx + 1}</td>
                <td class="py-3 px-4 text-xs font-mono text-slate-600">${s.nis}</td>
                <td class="py-3 px-4 font-semibold text-slate-800">${s.name}</td>
                <td class="py-3 px-4 text-center font-bold text-emerald-700 bg-emerald-50/30">${H}</td>
                <td class="py-3 px-4 text-center font-bold text-amber-700 bg-amber-50/30">${S}</td>
                <td class="py-3 px-4 text-center font-bold text-sky-700 bg-sky-50/30">${I}</td>
                <td class="py-3 px-4 text-center font-bold text-rose-700 bg-rose-50/30">${A}</td>
                <td class="py-3 px-4 text-center font-semibold text-slate-700">${total}</td>
                <td class="py-3 px-4 text-center font-bold text-brand-600">${pct}%</td>
                <td class="py-3 px-4 text-center no-print">
                    <button type="button" onclick="deleteStudentAttendanceRecap('${s.id}', '${s.name.replace(/'/g, "\\'")}')" class="text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg" title="Hapus Riwayat Absensi Siswa Ini">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    if (window.lucide) lucide.createIcons();
}

function deleteStudentAttendanceRecap(studentId, studentName) {
    const monthFilter = document.getElementById('rekap-month-filter')?.value || 'ALL';
    const periodLabel = monthFilter === 'ALL' ? `TP ${currentAcademicYear} (${currentSemester})` : `Bulan ${monthFilter}`;
    openConfirmModal('Hapus Riwayat Absensi Siswa', `Hapus seluruh catatan kehadiran untuk ${studentName} (Kelas ${currentClass}) pada ${periodLabel}?`, async () => {
        const matchingKeys = getMatchingAttendanceKeysForClass(currentClass, currentAcademicYear, currentSemester, monthFilter);
        matchingKeys.forEach(k => {
            if (appData.attendance[k] && studentId in appData.attendance[k]) {
                delete appData.attendance[k][studentId];
                if (Object.keys(appData.attendance[k]).length === 0) {
                    delete appData.attendance[k];
                }
            }
        });
        await saveData();
        refreshAllViews();
        showToast(`Riwayat absensi ${studentName} berhasil dihapus`, 'success');
    });
}

function deleteAllFilteredAttendance() {
    const monthFilter = document.getElementById('rekap-month-filter')?.value || 'ALL';
    const matchingKeys = getMatchingAttendanceKeysForClass(currentClass, currentAcademicYear, currentSemester, monthFilter);

    if (matchingKeys.length === 0) {
        showToast('Tidak ada data absensi pada filter ini untuk dihapus.', 'info');
        return;
    }
    const periodLabel = monthFilter === 'ALL' ? `seluruh TP ${currentAcademicYear} (${currentSemester})` : `Bulan ${monthFilter}`;
    openConfirmModal('Hapus Semua Absensi Periode Ini', `Yakin ingin menghapus ${matchingKeys.length} pertemuan absensi Kelas ${currentClass} pada ${periodLabel}?`, async () => {
        matchingKeys.forEach(k => {
            delete appData.attendance[k];
        });
        await saveData();
        refreshAllViews();
        showToast('Data absensi periode terpilih berhasil dihapus', 'success');
    });
}

// ==========================================
// 9. REKAP GURU MASUK KELAS & ARSIP JURNAL
// ==========================================
function handleTeacherRecapMadrasahFilterChange() {
    populateTeacherRecapFilters();
    renderTeacherClassRecap();
}

function populateTeacherRecapFilters() {
    const madSel = document.getElementById('filter-rg-madrasah');
    const clsSel = document.getElementById('filter-rg-class');
    const tchSel = document.getElementById('filter-rg-teacher');
    const monthSel = document.getElementById('filter-rg-month');

    const selectedMadFilter = madSel?.value || 'ALL';

    if (clsSel) {
        const prev = clsSel.value || 'ALL';
        const mtsClasses = appData.classesByMadrasah?.MTs || [];
        const maClasses = appData.classesByMadrasah?.MA || [];
        let validClasses = [];
        let allOpts = '';

        if (selectedMadFilter === 'MTs') {
            validClasses = mtsClasses;
            allOpts = mtsClasses.map(c => `<option value="${c}">MTs - Kelas ${c}</option>`).join('');
        } else if (selectedMadFilter === 'MA') {
            validClasses = maClasses;
            allOpts = maClasses.map(c => `<option value="${c}">MA - Kelas ${c}</option>`).join('');
        } else {
            validClasses = [...mtsClasses, ...maClasses];
            allOpts = [
                ...mtsClasses.map(c => `<option value="${c}">MTs - Kelas ${c}</option>`),
                ...maClasses.map(c => `<option value="${c}">MA - Kelas ${c}</option>`)
            ].join('');
        }

        clsSel.innerHTML = `<option value="ALL">Semua Kelas</option>` + allOpts;
        clsSel.value = validClasses.includes(prev) ? prev : 'ALL';
    }

    if (tchSel) {
        const prevT = tchSel.value || 'ALL';
        const filteredTeacherObjs = selectedMadFilter === 'ALL'
            ? appData.teachers
            : appData.teachers.filter(t => {
                const unit = t.madrasah || 'MTs';
                return unit === selectedMadFilter || unit === 'MTs & MA';
            });
        const teacherNames = new Set(filteredTeacherObjs.map(t => t.name));
        appData.journals.forEach(j => {
            const jMad = j.madrasah || inferMadrasahFromClass(j.className);
            if (selectedMadFilter === 'ALL' || jMad === selectedMadFilter) {
                if (j.teacherName) teacherNames.add(j.teacherName);
            }
        });
        const sortedNames = Array.from(teacherNames).sort();
        tchSel.innerHTML = `<option value="ALL">Semua Guru</option>` + sortedNames.map(n => `<option value="${n}">${n}</option>`).join('');
        tchSel.value = sortedNames.includes(prevT) ? prevT : 'ALL';
    }

    if (monthSel && monthSel.options.length <= 1) {
        populateMonthFilters();
    }
}

function getFilteredTeacherJournals() {
    const madFilter = document.getElementById('filter-rg-madrasah')?.value || 'ALL';
    const clsFilter = document.getElementById('filter-rg-class')?.value || 'ALL';
    const tchFilter = document.getElementById('filter-rg-teacher')?.value || 'ALL';
    const monthFilter = document.getElementById('filter-rg-month')?.value || 'ALL';

    return appData.journals.filter(j => {
        if ((j.academicYear || '2026/2027') !== currentAcademicYear) return false;
        if ((j.semester || 'Ganjil') !== currentSemester) return false;
        const jMad = j.madrasah || inferMadrasahFromClass(j.className);
        if (madFilter !== 'ALL' && jMad !== madFilter) return false;
        if (clsFilter !== 'ALL' && j.className !== clsFilter) return false;
        if (tchFilter !== 'ALL' && j.teacherName !== tchFilter) return false;
        if (monthFilter !== 'ALL' && !(j.date || '').startsWith(monthFilter)) return false;
        return true;
    });
}

function renderJournalRecap() {
    const madFilter = document.getElementById('jurnal-madrasah-filter')?.value || 'ALL';
    const clsFilter = document.getElementById('jurnal-class-filter')?.value || 'ALL';
    const monthFilter = document.getElementById('jurnal-month-filter')?.value || 'ALL';

    const label = document.getElementById('jurnal-class-label');
    if (label) {
        const madText = madFilter === 'ALL' ? 'MTs & MA' : madFilter;
        const clsText = clsFilter === 'ALL' ? 'Semua Kelas' : `Kelas ${clsFilter}`;
        const monthText = monthFilter === 'ALL' ? '' : ` • Bulan ${monthFilter}`;
        label.textContent = `${clsText} (${madText})${monthText}`;
    }
    const yearLabel = document.getElementById('jurnal-year-label');
    if (yearLabel) yearLabel.textContent = currentAcademicYear;
    const semLabel = document.getElementById('jurnal-semester-label');
    if (semLabel) semLabel.textContent = `Semester ${currentSemester}`;

    const tbody = document.getElementById('rekap-jurnal-body');
    if (!tbody) return;

    const filtered = getFilteredArchiveJournals();
    const countEl = document.getElementById('jurnal-filtered-count');
    const totalPeriodEl = document.getElementById('jurnal-total-period-count');
    if (countEl) countEl.textContent = filtered.length;
    if (totalPeriodEl) totalPeriodEl.textContent = appData.journals.length;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-xs text-slate-400">Belum ada arsip jurnal kelas tercatat sesuai filter yang dipilih.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(j => {
        const sum = j.attendanceSummary || { H: 0, S: 0, I: 0, A: 0 };
        const jMad = resolveJournalMadrasah(j);
        const badgeClass = jMad === 'MA' ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700';
        const absentText = j.absentDetails && j.absentDetails !== 'Nihil (Hadir Semua)'
            ? `<span class="text-rose-700 font-semibold">${j.absentDetails}</span>`
            : `<span class="text-emerald-700 font-medium">Nihil (Hadir Semua)</span>`;
        return `
            <tr class="hover:bg-slate-50 align-top">
                <td class="py-3.5 px-4 text-xs">
                    <div class="font-bold text-slate-800">${j.date || '-'}</div>
                    <span class="inline-block mt-1 text-[11px] font-semibold bg-brand-50 text-brand-700 px-2 py-0.5 rounded-md">Jam ke: ${j.hours || '-'}</span>
                    <div class="text-[10px] text-slate-400 mt-1">TP ${j.academicYear || currentAcademicYear} (${j.semester || currentSemester})</div>
                </td>
                <td class="py-3.5 px-4 text-xs font-bold">
                    <span class="px-2 py-0.5 rounded-md ${badgeClass}">${jMad} - ${j.className || '-'}</span>
                </td>
                <td class="py-3.5 px-4 text-xs">
                    <div class="font-bold text-slate-800">${j.teacherName || '-'}</div>
                    <div class="text-brand-600 font-semibold mt-0.5">${j.subject || '-'}</div>
                </td>
                <td class="py-3.5 px-4 text-xs">
                    <div class="font-bold text-slate-800">${j.topic || '-'}</div>
                    <p class="text-slate-600 mt-1 leading-relaxed">${j.activity || '-'}</p>
                </td>
                <td class="py-3.5 px-4 text-xs">
                    <div class="font-semibold text-slate-700">H:${sum.H} S:${sum.S} I:${sum.I} A:${sum.A}</div>
                    <div class="text-[11px] mt-1 leading-snug">${absentText}</div>
                </td>
                <td class="py-3.5 px-4 text-xs">
                    <div class="text-slate-600">${j.notes || '-'}</div>
                    <div class="text-[11px] text-sky-700 mt-1">${j.location || ''}</div>
                </td>
                <td class="py-3.5 px-4 text-center no-print">
                    <button type="button" onclick="deleteJournal('${j.id}')" class="text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg" title="Hapus Jurnal">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    if (window.lucide) lucide.createIcons();
}

function handleJournalMadrasahFilterChange() {
    populateJournalRecapFilters();
    renderJournalRecap();
}

function handleJournalClassFilterChange() {
    const clsVal = document.getElementById('jurnal-class-filter')?.value || 'ALL';
    const madSel = document.getElementById('jurnal-madrasah-filter');
    if (clsVal !== 'ALL' && madSel && madSel.value !== 'ALL') {
        const inferredMad = inferMadrasahFromClass(clsVal);
        if (madSel.value.toUpperCase() !== inferredMad.toUpperCase()) {
            madSel.value = inferredMad;
        }
    }
    renderJournalRecap();
}

function resolveJournalMadrasah(j) {
    const rawMad = String(j.madrasah || '').trim().toUpperCase();
    if (rawMad.includes('MA') && !rawMad.includes('MTS')) return 'MA';
    if (rawMad.includes('MTS')) return 'MTs';
    return inferMadrasahFromClass(j.className);
}

function populateJournalRecapFilters() {
    const madSel = document.getElementById('jurnal-madrasah-filter');
    const clsSel = document.getElementById('jurnal-class-filter');
    const monthSel = document.getElementById('jurnal-month-filter');

    const selectedMad = (madSel?.value || 'ALL').trim();

    if (clsSel) {
        const prevCls = clsSel.value || 'ALL';
        const mtsMap = new Map();
        const maMap = new Map();

        (appData.classesByMadrasah?.MTs || []).forEach(c => {
            const norm = normalizeClassToken(c);
            if (norm) mtsMap.set(norm, norm);
        });
        (appData.classesByMadrasah?.MA || []).forEach(c => {
            const norm = normalizeClassToken(c);
            if (norm) maMap.set(norm, norm);
        });

        appData.journals.forEach(j => {
            const norm = normalizeClassToken(j.className);
            if (!norm) return;
            const jMad = resolveJournalMadrasah(j);
            if (jMad === 'MA') {
                if (!maMap.has(norm)) maMap.set(norm, norm);
            } else {
                if (!mtsMap.has(norm)) mtsMap.set(norm, norm);
            }
        });

        const mtsClasses = Array.from(mtsMap.values());
        const maClasses = Array.from(maMap.values());
        let validClasses = [];
        let opts = '';

        if (selectedMad === 'MTs') {
            validClasses = mtsClasses;
            opts = mtsClasses.map(c => `<option value="${c}">MTs - Kelas ${c}</option>`).join('');
        } else if (selectedMad === 'MA') {
            validClasses = maClasses;
            opts = maClasses.map(c => `<option value="${c}">MA - Kelas ${c}</option>`).join('');
        } else {
            validClasses = [...mtsClasses, ...maClasses];
            opts = [
                ...mtsClasses.map(c => `<option value="${c}">MTs - Kelas ${c}</option>`),
                ...maClasses.map(c => `<option value="${c}">MA - Kelas ${c}</option>`)
            ].join('');
        }

        clsSel.innerHTML = `<option value="ALL">Semua Kelas</option>` + opts;
        if (prevCls === 'ALL') {
            clsSel.value = 'ALL';
        } else {
            const matchedCls = validClasses.find(c => normalizeClassToken(c) === normalizeClassToken(prevCls));
            clsSel.value = matchedCls || 'ALL';
        }
    }

    if (monthSel) {
        const prevMonth = (monthSel.value || 'ALL').trim();
        const monthsSet = new Set();
        appData.journals.forEach(j => {
            const jDate = String(j.date || '').trim();
            if (/^\d{4}-\d{2}/.test(jDate)) {
                monthsSet.add(jDate.slice(0, 7));
            }
        });
        const monthNames = {
            '01': 'Januari', '02': 'Februari', '03': 'Maret', '04': 'April',
            '05': 'Mei', '06': 'Juni', '07': 'Juli', '08': 'Agustus',
            '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Desember'
        };
        const sortedMonths = Array.from(monthsSet).sort().reverse();
        monthSel.innerHTML = `<option value="ALL">Semua Bulan</option>` + sortedMonths.map(ym => {
            const [y, m] = ym.split('-');
            return `<option value="${ym}">${monthNames[m] || m} ${y} (${ym})</option>`;
        }).join('');
        monthSel.value = (prevMonth !== 'ALL' && sortedMonths.includes(prevMonth)) ? prevMonth : 'ALL';
    }
}

function getFilteredArchiveJournals() {
    const madFilter = (document.getElementById('jurnal-madrasah-filter')?.value || 'ALL').trim().toUpperCase();
    const rawClsFilter = (document.getElementById('jurnal-class-filter')?.value || 'ALL').trim();
    const clsFilter = rawClsFilter.toUpperCase() === 'ALL' ? 'ALL' : normalizeClassToken(rawClsFilter);
    const rawMonthFilter = (document.getElementById('jurnal-month-filter')?.value || 'ALL').trim();
    const monthFilter = rawMonthFilter.toUpperCase() === 'ALL' ? 'ALL' : rawMonthFilter;

    return appData.journals.filter(j => {
        if (madFilter !== 'ALL') {
            const jMad = resolveJournalMadrasah(j).toUpperCase();
            if (jMad !== madFilter) return false;
        }

        if (clsFilter !== 'ALL') {
            const jCls = normalizeClassToken(j.className);
            if (jCls !== clsFilter) return false;
        }

        if (monthFilter !== 'ALL') {
            const jDate = String(j.date || '').trim();
            if (!jDate.startsWith(monthFilter)) return false;
        }

        return true;
    });
}

function resetJournalFilters() {
    const madEl = document.getElementById('jurnal-madrasah-filter');
    const clsEl = document.getElementById('jurnal-class-filter');
    const monthEl = document.getElementById('jurnal-month-filter');
    if (madEl) madEl.value = 'ALL';
    if (clsEl) clsEl.value = 'ALL';
    if (monthEl) monthEl.value = 'ALL';
    populateJournalRecapFilters();
    renderJournalRecap();
    showToast('Menampilkan seluruh arsip jurnal kelas', 'info');
}

function deleteJournal(journalId) {
    openConfirmModal('Hapus Jurnal', 'Apakah Anda yakin ingin menghapus catatan jurnal ini?', async () => {
        appData.journals = appData.journals.filter(j => j.id !== journalId);
        await saveData();
        refreshAllViews();
        showToast('Jurnal berhasil dihapus', 'success');
    });
}

function deleteAllFilteredJournals() {
    const toDelete = getFilteredArchiveJournals();

    if (toDelete.length === 0) {
        showToast('Tidak ada arsip jurnal pada filter ini untuk dihapus.', 'info');
        return;
    }

    const idsToDelete = new Set(toDelete.map(j => j.id));
    openConfirmModal('Hapus Arsip Jurnal', `Yakin ingin menghapus ${toDelete.length} arsip jurnal yang tampil sesuai filter saat ini?`, async () => {
        appData.journals = appData.journals.filter(j => !idsToDelete.has(j.id));
        await saveData();
        refreshAllViews();
        showToast(`${toDelete.length} arsip jurnal berhasil dihapus`, 'success');
    });
}

function renderTeacherClassRecap() {
    const list = getFilteredTeacherJournals();
    const cardsContainer = document.getElementById('teacher-summary-cards');
    const tbody = document.getElementById('rekap-guru-body');

    const statsByTeacher = {};
    list.forEach(j => {
        if (!statsByTeacher[j.teacherName]) {
            statsByTeacher[j.teacherName] = { meetings: 0, hours: 0 };
        }
        statsByTeacher[j.teacherName].meetings += 1;
        const hCnt = j.hourCount || (j.hours ? String(j.hours).split(',').length : 1);
        statsByTeacher[j.teacherName].hours += hCnt;
    });

    if (cardsContainer) {
        const entries = Object.entries(statsByTeacher);
        cardsContainer.innerHTML = entries.length === 0
            ? `<p class="text-xs text-slate-400 col-span-full">Belum ada data pertemuan guru untuk filter ini.</p>`
            : entries.map(([name, st]) => `
                <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                    <div class="text-xs font-bold text-slate-800 truncate">${name}</div>
                    <div class="flex items-center justify-between mt-2 text-xs">
                        <span class="text-slate-500">${st.meetings} Pertemuan</span>
                        <span class="font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-md">${st.hours} Jam Pelajaran</span>
                    </div>
                </div>
            `).join('');
    }

    if (tbody) {
        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-xs text-slate-400">Tidak ada riwayat guru mengajar yang sesuai filter.</td></tr>`;
            return;
        }
        tbody.innerHTML = list.map((j, idx) => {
            const sum = j.attendanceSummary || { H: 0, S: 0, I: 0, A: 0 };
            return `
                <tr class="hover:bg-slate-50 align-top">
                    <td class="py-3 px-4 text-center text-xs font-semibold text-slate-500">${idx + 1}</td>
                    <td class="py-3 px-4 text-xs">
                        <div class="font-bold text-slate-800">${j.date}</div>
                        <span class="inline-block mt-1 text-[11px] font-semibold bg-brand-50 text-brand-700 px-2 py-0.5 rounded-md">Jam ke: ${j.hours}</span>
                    </td>
                    <td class="py-3 px-4 text-xs font-bold text-slate-700">
                        <span class="text-[10px] px-1.5 py-0.5 rounded ${(j.madrasah || inferMadrasahFromClass(j.className)) === 'MA' ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700'}">${j.madrasah || inferMadrasahFromClass(j.className)}</span>
                        <div class="mt-0.5">Kelas ${j.className}</div>
                    </td>
                    <td class="py-3 px-4 text-xs font-bold text-slate-800">${j.teacherName}</td>
                    <td class="py-3 px-4 text-xs">
                        <div class="font-semibold text-brand-700">${j.subject}</div>
                        <div class="text-slate-600 mt-0.5">${j.topic}</div>
                    </td>
                    <td class="py-3 px-4 text-xs">
                        <div class="font-semibold text-slate-700">H:${sum.H} S:${sum.S} I:${sum.I} A:${sum.A}</div>
                        <div class="text-[11px] text-sky-700 mt-0.5">${j.location || '-'}</div>
                    </td>
                    <td class="py-3 px-4 text-center no-print">
                        <button type="button" onclick="deleteJournal('${j.id}')" class="text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg" title="Hapus Data Guru Masuk Kelas">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
        if (window.lucide) lucide.createIcons();
    }
}

function resetTeacherRecapFilters() {
    const madEl = document.getElementById('filter-rg-madrasah');
    const clsEl = document.getElementById('filter-rg-class');
    const tchEl = document.getElementById('filter-rg-teacher');
    const monthEl = document.getElementById('filter-rg-month');
    if (madEl) madEl.value = 'ALL';
    if (clsEl) clsEl.value = 'ALL';
    if (tchEl) tchEl.value = 'ALL';
    if (monthEl) monthEl.value = 'ALL';
    populateTeacherRecapFilters();
    renderTeacherClassRecap();
    showToast('Filter rekap guru telah direset', 'info');
}

// ==========================================
// 10. MANAJEMEN DATA SISWA, GURU, MAPEL & KELAS
// ==========================================
async function addNewClass(e) {
    e.preventDefault();
    const mad = document.getElementById('new-class-madrasah')?.value || currentMadrasah;
    const raw = document.getElementById('new-class-name').value.trim().toUpperCase();
    if (!raw) return;

    if (!appData.classesByMadrasah) appData.classesByMadrasah = { MTs: ['VII', 'VIII', 'IX'], MA: ['X', 'XI', 'XII'] };
    if (!Array.isArray(appData.classesByMadrasah[mad])) appData.classesByMadrasah[mad] = [];

    if (!appData.classesByMadrasah[mad].includes(raw)) {
        appData.classesByMadrasah[mad].push(raw);
    }
    if (!appData.classes.includes(raw)) {
        appData.classes.push(raw);
        appData.students[raw] = [];
    }

    currentMadrasah = mad;
    appData.activeMadrasah = mad;
    await saveData();
    populateMadrasahDropdown();
    populateClassDropdown();
    handleClassChange(raw);
    showToast(`Kelas ${raw} (${mad}) berhasil ditambahkan`, 'success');
    document.getElementById('new-class-name').value = '';
    closeModal('modal-add-class');
}

async function addStudent(e) {
    e.preventDefault();
    const mad = document.getElementById('new-student-madrasah')?.value || inferMadrasahFromClass(document.getElementById('new-student-class').value);
    const cls = document.getElementById('new-student-class').value.trim().toUpperCase();
    const nis = document.getElementById('new-student-nis').value.trim();
    const name = document.getElementById('new-student-name').value.trim();
    const gender = document.getElementById('new-student-gender').value;

    if (!cls || !nis || !name) return;

    if (!appData.classesByMadrasah) appData.classesByMadrasah = { MTs: ['VII', 'VIII', 'IX'], MA: ['X', 'XI', 'XII'] };
    if (!appData.classesByMadrasah[mad].includes(cls)) {
        appData.classesByMadrasah[mad].push(cls);
    }
    if (!appData.classes.includes(cls)) {
        appData.classes.push(cls);
        appData.students[cls] = [];
    }
    if (!Array.isArray(appData.students[cls])) appData.students[cls] = [];

    appData.students[cls].push({
        id: 'S' + Date.now() + Math.floor(Math.random() * 100),
        madrasah: mad,
        nis,
        name,
        gender
    });

    await saveData();
    populateClassDropdown();
    document.getElementById('new-student-nis').value = '';
    document.getElementById('new-student-name').value = '';
    refreshAllViews();
    showToast(`Siswa ${name} ditambahkan ke ${mad} - Kelas ${cls}`, 'success');
}

function openBulkStudentModal() {
    const defCls = document.getElementById('bulk-default-class');
    if (defCls) defCls.value = currentClass;
    openModal('modal-bulk-students');
}

function fillBulkExample() {
    const ta = document.getElementById('bulk-students-textarea');
    if (ta) {
        ta.value = `VII, 2026101, Ahmad Zulfikar, L\nVII, 2026102, Nurul Hidayah, P\nVIII, 2026103, Muhammad Akbar, L`;
    }
}

async function processBulkStudents(e) {
    e.preventDefault();
    const defaultCls = (document.getElementById('bulk-default-class').value.trim() || currentClass).toUpperCase();
    const rawLines = document.getElementById('bulk-students-textarea').value.split('\n').map(l => l.trim()).filter(Boolean);

    let addedCount = 0;
    rawLines.forEach((line, idx) => {
        const parts = line.includes('\t') ? line.split('\t') : line.split(',');
        const clean = parts.map(p => p.trim());
        let cls = defaultCls, nis = '', name = '', gender = 'L';

        if (clean.length >= 4) {
            cls = clean[0].toUpperCase() || defaultCls;
            nis = clean[1];
            name = clean[2];
            gender = (clean[3] || 'L').toUpperCase().startsWith('P') ? 'P' : 'L';
        } else if (clean.length === 3) {
            nis = clean[0];
            name = clean[1];
            gender = (clean[2] || 'L').toUpperCase().startsWith('P') ? 'P' : 'L';
        } else if (clean.length === 2) {
            nis = clean[0];
            name = clean[1];
        } else {
            nis = String(Date.now()).slice(-6) + idx;
            name = clean[0];
        }

        if (name) {
            if (!appData.classes.includes(cls)) {
                appData.classes.push(cls);
                appData.students[cls] = [];
            }
            appData.students[cls].push({
                id: 'S' + Date.now() + '_' + idx,
                nis: nis || '-',
                name,
                gender
            });
            addedCount++;
        }
    });

    if (addedCount > 0) {
        await saveData();
        populateClassDropdown();
        refreshAllViews();
        document.getElementById('bulk-students-textarea').value = '';
        closeModal('modal-bulk-students');
        showToast(`${addedCount} siswa berhasil ditambahkan secara massal!`, 'success');
    } else {
        showToast('Tidak ada data siswa yang valid untuk diproses.', 'error');
    }
}

function renderManageStudents() {
    const tbody = document.getElementById('manage-students-body');
    const badge = document.getElementById('student-count-badge');
    const filterCls = document.getElementById('manage-students-class-filter')?.value || 'ALL';
    if (!tbody) return;

    let rows = [];
    appData.classes.forEach(cls => {
        if (filterCls !== 'ALL' && cls !== filterCls) return;
        const mad = inferMadrasahFromClass(cls);
        (appData.students[cls] || []).forEach(s => {
            rows.push({ ...s, className: cls, madrasah: s.madrasah || mad });
        });
    });

    if (badge) badge.textContent = `${rows.length} Siswa`;

    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-xs text-slate-400">Belum ada data siswa terdaftar.</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map((s, idx) => `
        <tr class="hover:bg-slate-50">
            <td class="py-3 px-4 text-center text-xs font-semibold text-slate-500">${idx + 1}</td>
            <td class="py-3 px-4"><span class="text-[11px] font-bold px-2 py-0.5 rounded-md ${s.madrasah === 'MA' ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700'}">${s.madrasah}</span></td>
            <td class="py-3 px-4"><span class="text-xs font-bold bg-brand-50 text-brand-700 px-2.5 py-1 rounded-lg">${s.className}</span></td>
            <td class="py-3 px-4 text-xs font-mono text-slate-600">${s.nis}</td>
            <td class="py-3 px-4 font-semibold text-slate-800">${s.name}</td>
            <td class="py-3 px-4 text-center text-xs font-bold">${s.gender}</td>
            <td class="py-3 px-4 text-center">
                <button type="button" onclick="deleteStudent('${s.className}', '${s.id}')" class="text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg" title="Hapus Siswa">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </td>
        </tr>
    `).join('');
    if (window.lucide) lucide.createIcons();
}

function deleteStudent(cls, studentId) {
    openConfirmModal('Hapus Siswa', 'Hapus data siswa ini dari daftar kelas?', async () => {
        appData.students[cls] = (appData.students[cls] || []).filter(s => s.id !== studentId);
        await saveData();
        refreshAllViews();
        showToast('Siswa berhasil dihapus', 'success');
    });
}

async function addTeacherAccount(e) {
    e.preventDefault();
    let madrasah = document.getElementById('new-teacher-madrasah')?.value || 'MTs';
    const name = document.getElementById('new-teacher-name').value.trim();
    const nip = document.getElementById('new-teacher-nip').value.trim();
    const username = document.getElementById('new-teacher-username').value.trim();
    const password = document.getElementById('new-teacher-password').value.trim();
    const classMappings = collectClassSubjectMappings('new-teacher-class-mappings');
    const classMappedSubjects = Object.values(classMappings).flat();

    const mappedMads = new Set(Object.keys(classMappings).map(cls => inferMadrasahFromClass(cls)));
    if ((mappedMads.has('MTs') && mappedMads.has('MA')) ||
        (mappedMads.has('MTs') && madrasah === 'MA') ||
        (mappedMads.has('MA') && madrasah === 'MTs')) {
        madrasah = 'MTs & MA';
    }

    let mtsSubjects = [];
    let maSubjects = [];
    let combinedSubjects = [];

    if (madrasah === 'MTs & MA') {
        const checkedMts = Array.from(document.querySelectorAll('input[name="new_teacher_subject_mts"]:checked')).map(cb => cb.value);
        const checkedMa = Array.from(document.querySelectorAll('input[name="new_teacher_subject_ma"]:checked')).map(cb => cb.value);
        const checkedSingle = Array.from(document.querySelectorAll('input[name="new_teacher_subject"]:checked')).map(cb => cb.value);
        const mappedMts = Object.entries(classMappings).filter(([cls]) => inferMadrasahFromClass(cls) === 'MTs').flatMap(([, s]) => s);
        const mappedMa = Object.entries(classMappings).filter(([cls]) => inferMadrasahFromClass(cls) === 'MA').flatMap(([, s]) => s);

        mtsSubjects = Array.from(new Set([...checkedMts, ...checkedSingle, ...mappedMts]));
        maSubjects = Array.from(new Set([...checkedMa, ...checkedSingle, ...mappedMa]));

        if (mtsSubjects.length === 0 && maSubjects.length === 0) {
            showToast('Pilih minimal 1 mata pelajaran untuk MTs atau MA!', 'error');
            return;
        }
        combinedSubjects = Array.from(new Set([...mtsSubjects, ...maSubjects, ...classMappedSubjects]));
    } else {
        const selectedSubjects = Array.from(document.querySelectorAll('input[name="new_teacher_subject"]:checked')).map(cb => cb.value);
        if (selectedSubjects.length === 0 && classMappedSubjects.length === 0) {
            showToast('Pilih minimal 1 mata pelajaran yang diampu!', 'error');
            return;
        }
        combinedSubjects = Array.from(new Set([...selectedSubjects, ...classMappedSubjects]));
        if (madrasah === 'MTs') mtsSubjects = combinedSubjects;
        if (madrasah === 'MA') maSubjects = combinedSubjects;
    }

    if (appData.teachers.some(t => t.username.toLowerCase() === username.toLowerCase())) {
        showToast('Username sudah digunakan oleh guru lain!', 'error');
        return;
    }

    appData.teachers.push({
        id: 'G' + Date.now(),
        madrasah,
        name,
        nip,
        subjects: combinedSubjects,
        subjectsByMadrasah: {
            MTs: mtsSubjects,
            MA: maSubjects
        },
        subjectsByClass: classMappings,
        subject: combinedSubjects.join(', '),
        username,
        password
    });

    manageTeacherMadrasahTab = madrasah;
    await saveData();
    setupTeacherJournalField();
    renderManageTeachers();
    e.target.reset();
    const newMapContainer = document.getElementById('new-teacher-class-mappings');
    if (newMapContainer) newMapContainer.innerHTML = '';
    document.querySelectorAll('input[name="new_teacher_subject"], input[name="new_teacher_subject_mts"], input[name="new_teacher_subject_ma"]').forEach(cb => cb.checked = false);
    updateSelectedTeacherSubjectsCount();
    const madSelect = document.getElementById('new-teacher-madrasah');
    if (madSelect) madSelect.value = madrasah;
    toggleTeacherSubjectMode();
    showToast(`Akun guru ${name} (${combinedSubjects.length} mapel) berhasil disimpan`, 'success');
}

function switchManageTeacherMadrasah(madrasah) {
    manageTeacherMadrasahTab = madrasah;
    const formMadSelect = document.getElementById('new-teacher-madrasah');
    if (formMadSelect) formMadSelect.value = madrasah;
    toggleTeacherSubjectMode();
    renderManageTeachers();
}

function renderManageTeachers() {
    const km = appData.kepalaMadrasah || {
        MTs: { name: 'Kepala MTs Nurul Chalik', nip: '-' },
        MA: { name: 'Kepala MA Nurul Chalik', nip: '-' },
        city: 'Nurul Chalik'
    };
    const kmMtsNameEl = document.getElementById('km-mts-name-input');
    const kmMtsNipEl = document.getElementById('km-mts-nip-input');
    const kmMaNameEl = document.getElementById('km-ma-name-input');
    const kmMaNipEl = document.getElementById('km-ma-nip-input');
    const kmCityEl = document.getElementById('km-city-input');

    if (kmMtsNameEl && document.activeElement !== kmMtsNameEl) kmMtsNameEl.value = km.MTs?.name || '';
    if (kmMtsNipEl && document.activeElement !== kmMtsNipEl) kmMtsNipEl.value = km.MTs?.nip || '';
    if (kmMaNameEl && document.activeElement !== kmMaNameEl) kmMaNameEl.value = km.MA?.name || '';
    if (kmMaNipEl && document.activeElement !== kmMaNipEl) kmMaNipEl.value = km.MA?.nip || '';
    if (kmCityEl && document.activeElement !== kmCityEl) kmCityEl.value = km.city || 'Nurul Chalik';

    const mtsTeachers = appData.teachers.filter(t => (t.madrasah || 'MTs') === 'MTs');
    const maTeachers = appData.teachers.filter(t => (t.madrasah || 'MTs') === 'MA');
    const bothTeachers = appData.teachers.filter(t => (t.madrasah || 'MTs') === 'MTs & MA');

    const countMtsEl = document.getElementById('teacher-count-mts');
    const countMaEl = document.getElementById('teacher-count-ma');
    const countBothEl = document.getElementById('teacher-count-both');
    if (countMtsEl) countMtsEl.textContent = mtsTeachers.length;
    if (countMaEl) countMaEl.textContent = maTeachers.length;
    if (countBothEl) countBothEl.textContent = bothTeachers.length;

    const btnMts = document.getElementById('btn-filter-guru-MTs');
    const btnMa = document.getElementById('btn-filter-guru-MA');
    const btnBoth = document.getElementById('btn-filter-guru-BOTH');
    if (btnMts && btnMa && btnBoth) {
        const inactiveClass = 'px-3 py-2 text-xs sm:text-sm font-bold rounded-lg text-slate-600 hover:text-slate-800 transition-all';
        btnMts.className = manageTeacherMadrasahTab === 'MTs'
            ? 'px-3 py-2 text-xs sm:text-sm font-bold rounded-lg bg-emerald-600 text-white shadow-xs transition-all'
            : inactiveClass;
        btnMa.className = manageTeacherMadrasahTab === 'MA'
            ? 'px-3 py-2 text-xs sm:text-sm font-bold rounded-lg bg-sky-600 text-white shadow-xs transition-all'
            : inactiveClass;
        btnBoth.className = manageTeacherMadrasahTab === 'MTs & MA'
            ? 'px-3 py-2 text-xs sm:text-sm font-bold rounded-lg bg-brand-600 text-white shadow-xs transition-all'
            : inactiveClass;
    }

    const headingEl = document.getElementById('manage-teachers-heading');
    if (headingEl) {
        if (manageTeacherMadrasahTab === 'MA') headingEl.textContent = 'Daftar Guru Madrasah Aliyah (MA)';
        else if (manageTeacherMadrasahTab === 'MTs & MA') headingEl.textContent = 'Daftar Guru Mengajar di MTs & MA (1 Akun)';
        else headingEl.textContent = 'Daftar Guru Madrasah Tsanawiyah (MTs)';
    }

    const tbody = document.getElementById('manage-teachers-body');
    const badge = document.getElementById('teacher-count-badge');
    if (!tbody) return;
    if (badge) badge.textContent = `Total: ${appData.teachers.length} Akun (MTs: ${mtsTeachers.length} | MA: ${maTeachers.length} | Keduanya: ${bothTeachers.length})`;

    const displayedTeachers = manageTeacherMadrasahTab === 'MA'
        ? maTeachers
        : (manageTeacherMadrasahTab === 'MTs & MA' ? bothTeachers : mtsTeachers);

    if (displayedTeachers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-xs text-slate-400">Belum ada akun guru terdaftar untuk kategori <strong>${manageTeacherMadrasahTab}</strong>.</td></tr>`;
        return;
    }

    tbody.innerHTML = displayedTeachers.map((t, idx) => {
        const unit = t.madrasah || 'MTs';
        const unitBadge = unit === 'MA'
            ? 'bg-sky-100 text-sky-700'
            : (unit === 'MTs & MA' ? 'bg-brand-100 text-brand-700' : 'bg-emerald-100 text-emerald-700');

        let subjBadges = '';
        if (unit === 'MTs & MA' && t.subjectsByMadrasah) {
            const mtsList = t.subjectsByMadrasah.MTs || [];
            const maList = t.subjectsByMadrasah.MA || [];
            const mtsHtml = mtsList.length > 0
                ? `<div class="mb-1"><span class="text-[10px] font-bold text-emerald-700 mr-1">MTs:</span>${mtsList.map(s => `<span class="inline-block bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded text-[11px] font-semibold mr-1 mb-0.5">${s}</span>`).join('')}</div>`
                : '';
            const maHtml = maList.length > 0
                ? `<div><span class="text-[10px] font-bold text-sky-700 mr-1">MA:</span>${maList.map(s => `<span class="inline-block bg-sky-50 text-sky-700 border border-sky-200 px-1.5 py-0.5 rounded text-[11px] font-semibold mr-1 mb-0.5">${s}</span>`).join('')}</div>`
                : '';
            subjBadges = mtsHtml + maHtml;
        } else {
            const subjList = Array.isArray(t.subjects) && t.subjects.length > 0
                ? t.subjects
                : (t.subject ? String(t.subject).split(/[;|,]/).map(s => s.trim()).filter(Boolean) : []);
            subjBadges = subjList.map(s => `<span class="inline-block bg-brand-50 text-brand-700 border border-brand-200/70 px-2 py-0.5 rounded-md text-[11px] font-semibold mr-1 mb-1">${s}</span>`).join('');
        }

        const classMapEntries = Object.entries(t.subjectsByClass || {});
        const classMapBadges = classMapEntries.length > 0
            ? `<div class="mt-1 pt-1 border-t border-slate-100 flex flex-wrap gap-1">${classMapEntries.map(([cls, sArr]) => `<span class="inline-block bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded text-[10px] font-bold">Kls ${cls}: ${sArr.join(', ')}</span>`).join('')}</div>`
            : '';

        return `
            <tr class="hover:bg-slate-50">
                <td class="py-3 px-4 text-center text-xs font-semibold text-slate-500">${idx + 1}</td>
                <td class="py-3 px-4 text-center"><span class="text-[11px] font-bold px-2 py-0.5 rounded-md ${unitBadge}">${unit}</span></td>
                <td class="py-3 px-4">
                    <div class="font-bold text-slate-800 text-xs sm:text-sm">${t.name}</div>
                    <div class="text-[11px] text-slate-400">NIP: ${t.nip}</div>
                </td>
                <td class="py-3 px-4">${subjBadges || '<span class="text-xs text-slate-400">-</span>'}${classMapBadges}</td>
                <td class="py-3 px-4 text-xs font-mono">
                    <span class="bg-slate-100 px-2 py-0.5 rounded">${t.username}</span> / <span class="text-slate-500">${t.password}</span>
                </td>
                <td class="py-3 px-4 text-center">
                    <div class="inline-flex items-center justify-center gap-1">
                        <button type="button" onclick="openEditTeacherModal('${t.id}')" class="text-brand-600 hover:bg-brand-50 p-1.5 rounded-lg" title="Edit Akun Guru">
                            <i data-lucide="pencil" class="w-4 h-4"></i>
                        </button>
                        <button type="button" onclick="deleteTeacher('${t.id}')" class="text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg" title="Hapus Akun Guru">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    if (window.lucide) lucide.createIcons();
}

function openEditTeacherModal(id) {
    const teacher = appData.teachers.find(t => t.id === id);
    if (!teacher) {
        showToast('Data guru tidak ditemukan!', 'error');
        return;
    }

    document.getElementById('edit-teacher-id').value = teacher.id;
    const unit = (teacher.madrasah === 'MA' || teacher.madrasah === 'MTs' || teacher.madrasah === 'MTs & MA') ? teacher.madrasah : 'MTs';
    document.getElementById('edit-teacher-madrasah').value = unit;
    document.getElementById('edit-teacher-name').value = teacher.name || '';
    document.getElementById('edit-teacher-nip').value = teacher.nip || '';
    document.getElementById('edit-teacher-username').value = teacher.username || '';
    document.getElementById('edit-teacher-password').value = teacher.password || '';

    const defaultSubj = Array.isArray(teacher.subjects) && teacher.subjects.length > 0
        ? teacher.subjects
        : (teacher.subject ? String(teacher.subject).split(/[;|,]/).map(s => s.trim()).filter(Boolean) : []);
    const mtsSubj = Array.isArray(teacher.subjectsByMadrasah?.MTs) && teacher.subjectsByMadrasah.MTs.length > 0
        ? teacher.subjectsByMadrasah.MTs
        : (unit !== 'MA' ? defaultSubj : []);
    const maSubj = Array.isArray(teacher.subjectsByMadrasah?.MA) && teacher.subjectsByMadrasah.MA.length > 0
        ? teacher.subjectsByMadrasah.MA
        : (unit !== 'MTs' ? defaultSubj : []);

    const renderEditCheckboxes = (containerId, inputName, selectedArr) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        const selectedSet = new Set(selectedArr);
        if (appData.subjects.length === 0) {
            container.innerHTML = '<p class="text-xs text-slate-400 p-2">Belum ada data mata pelajaran.</p>';
            return;
        }
        container.innerHTML = appData.subjects.map(s => `
            <label class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100/80 cursor-pointer text-xs text-slate-700 select-none">
                <input type="checkbox" name="${inputName}" value="${s.name}" ${selectedSet.has(s.name) ? 'checked' : ''} onchange="updateEditTeacherSubjectsCount()" class="rounded border-slate-300 text-brand-600 focus:ring-brand-500">
                <span class="font-medium">${s.name}</span>
            </label>
        `).join('');
    };

    renderEditCheckboxes('edit-teacher-subjects-list', 'edit_teacher_subject', defaultSubj);
    renderEditCheckboxes('edit-teacher-subjects-mts-list', 'edit_teacher_subject_mts', mtsSubj);
    renderEditCheckboxes('edit-teacher-subjects-ma-list', 'edit_teacher_subject_ma', maSubj);

    const editMapContainer = document.getElementById('edit-teacher-class-mappings');
    if (editMapContainer) {
        editMapContainer.innerHTML = '';
        Object.entries(teacher.subjectsByClass || {}).forEach(([clsKey, sArr]) => {
            (Array.isArray(sArr) ? sArr : [sArr]).forEach(subjName => {
                if (subjName) addClassSubjectMappingRow('edit-teacher-class-mappings', clsKey, subjName);
            });
        });
    }

    toggleEditTeacherSubjectMode();
    updateEditTeacherSubjectsCount();
    openModal('modal-edit-teacher');
    if (window.lucide) lucide.createIcons();
}

function toggleEditTeacherSubjectMode() {
    const unit = document.getElementById('edit-teacher-madrasah')?.value || 'MTs';
    const singleGroup = document.getElementById('edit-teacher-single-subject-group');
    const dualGroup = document.getElementById('edit-teacher-dual-subject-group');
    if (!singleGroup || !dualGroup) return;

    if (unit === 'MTs & MA') {
        singleGroup.classList.add('hidden');
        dualGroup.classList.remove('hidden');
    } else {
        dualGroup.classList.add('hidden');
        singleGroup.classList.remove('hidden');
    }
}

function updateEditTeacherSubjectsCount() {
    const countSingle = document.querySelectorAll('input[name="edit_teacher_subject"]:checked').length;
    const countMts = document.querySelectorAll('input[name="edit_teacher_subject_mts"]:checked').length;
    const countMa = document.querySelectorAll('input[name="edit_teacher_subject_ma"]:checked').length;

    const badge = document.getElementById('edit-teacher-subjects-count');
    const badgeMts = document.getElementById('edit-teacher-subjects-mts-count');
    const badgeMa = document.getElementById('edit-teacher-subjects-ma-count');
    if (badge) badge.textContent = `${countSingle} Mapel`;
    if (badgeMts) badgeMts.textContent = `${countMts} Mapel`;
    if (badgeMa) badgeMa.textContent = `${countMa} Mapel`;
}

async function saveEditedTeacherAccount(e) {
    e.preventDefault();
    const id = document.getElementById('edit-teacher-id').value;
    const idx = appData.teachers.findIndex(t => t.id === id);
    if (idx === -1) {
        showToast('Data guru tidak ditemukan!', 'error');
        return;
    }

    const oldTeacher = appData.teachers[idx];
    let madrasah = document.getElementById('edit-teacher-madrasah').value || 'MTs';
    const name = document.getElementById('edit-teacher-name').value.trim();
    const nip = document.getElementById('edit-teacher-nip').value.trim() || '-';
    const username = document.getElementById('edit-teacher-username').value.trim();
    const password = document.getElementById('edit-teacher-password').value.trim();

    if (!name || !username || !password) {
        showToast('Nama, username, dan password wajib diisi!', 'error');
        return;
    }

    if (appData.teachers.some(t => t.id !== id && t.username.toLowerCase() === username.toLowerCase())) {
        showToast('Username sudah digunakan oleh guru lain!', 'error');
        return;
    }

    let mtsSubjects = [];
    let maSubjects = [];
    let combinedSubjects = [];
    const classMappings = collectClassSubjectMappings('edit-teacher-class-mappings');
    const classMappedSubjects = Object.values(classMappings).flat();

    const mappedMads = new Set(Object.keys(classMappings).map(cls => inferMadrasahFromClass(cls)));
    if ((mappedMads.has('MTs') && mappedMads.has('MA')) ||
        (mappedMads.has('MTs') && madrasah === 'MA') ||
        (mappedMads.has('MA') && madrasah === 'MTs')) {
        madrasah = 'MTs & MA';
    }

    if (madrasah === 'MTs & MA') {
        const checkedMts = Array.from(document.querySelectorAll('input[name="edit_teacher_subject_mts"]:checked')).map(cb => cb.value);
        const checkedMa = Array.from(document.querySelectorAll('input[name="edit_teacher_subject_ma"]:checked')).map(cb => cb.value);
        const checkedSingle = Array.from(document.querySelectorAll('input[name="edit_teacher_subject"]:checked')).map(cb => cb.value);
        const mappedMts = Object.entries(classMappings).filter(([cls]) => inferMadrasahFromClass(cls) === 'MTs').flatMap(([, s]) => s);
        const mappedMa = Object.entries(classMappings).filter(([cls]) => inferMadrasahFromClass(cls) === 'MA').flatMap(([, s]) => s);

        mtsSubjects = Array.from(new Set([...checkedMts, ...checkedSingle, ...mappedMts]));
        maSubjects = Array.from(new Set([...checkedMa, ...checkedSingle, ...mappedMa]));

        if (mtsSubjects.length === 0 && maSubjects.length === 0) {
            showToast('Pilih minimal 1 mata pelajaran untuk MTs atau MA!', 'error');
            return;
        }
        combinedSubjects = Array.from(new Set([...mtsSubjects, ...maSubjects, ...classMappedSubjects]));
    } else {
        const selectedSubjects = Array.from(document.querySelectorAll('input[name="edit_teacher_subject"]:checked')).map(cb => cb.value);
        if (selectedSubjects.length === 0 && classMappedSubjects.length === 0) {
            showToast('Pilih minimal 1 mata pelajaran yang diampu!', 'error');
            return;
        }
        combinedSubjects = Array.from(new Set([...selectedSubjects, ...classMappedSubjects]));
        if (madrasah === 'MTs') mtsSubjects = combinedSubjects;
        if (madrasah === 'MA') maSubjects = combinedSubjects;
    }

    appData.teachers[idx] = {
        ...oldTeacher,
        madrasah,
        name,
        nip,
        subjects: combinedSubjects,
        subjectsByMadrasah: {
            MTs: mtsSubjects,
            MA: maSubjects
        },
        subjectsByClass: classMappings,
        subject: combinedSubjects.join(', '),
        username,
        password
    };

    if (oldTeacher.name !== name) {
        appData.journals.forEach(j => {
            if (j.teacherName === oldTeacher.name) {
                j.teacherName = name;
            }
        });
    }

    manageTeacherMadrasahTab = madrasah;
    await saveData();
    setupTeacherJournalField();
    refreshAllViews();
    closeModal('modal-edit-teacher');
    showToast(`Data guru ${name} berhasil diperbarui!`, 'success');
}

function deleteTeacher(id) {
    openConfirmModal('Hapus Akun Guru', 'Yakin ingin menghapus akun guru ini?', async () => {
        appData.teachers = appData.teachers.filter(t => t.id !== id);
        await saveData();
        setupTeacherJournalField();
        renderManageTeachers();
        showToast('Akun guru dihapus', 'success');
    });
}

async function saveKepalaMadrasah(e) {
    e.preventDefault();
    const mtsName = document.getElementById('km-mts-name-input').value.trim();
    const mtsNip = document.getElementById('km-mts-nip-input').value.trim() || '-';
    const maName = document.getElementById('km-ma-name-input').value.trim();
    const maNip = document.getElementById('km-ma-nip-input').value.trim() || '-';
    const city = document.getElementById('km-city-input').value.trim() || 'Nurul Chalik';
    if (!mtsName || !maName) return;

    appData.kepalaMadrasah = {
        MTs: { name: mtsName, nip: mtsNip, city },
        MA: { name: maName, nip: maNip, city },
        city
    };
    await saveData();
    showToast('Data Kepala Madrasah MTs & MA berhasil disimpan!', 'success');
}

function parseDelimitedLine(line) {
    const delimiter = line.includes(';') ? ';' : (line.includes('\t') ? '\t' : ',');
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            inQuotes = !inQuotes;
        } else if (ch === delimiter && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current.trim());
    return result;
}

function downloadStudentExcelTemplate() {
    const rows = [
        ['Kelas', 'NIS', 'Nama Lengkap Siswa', 'Jenis Kelamin (L/P)'],
        ['VII', '2026101', 'Ahmad Zulfikar', 'L'],
        ['VII', '2026102', 'Nurul Hidayah', 'P'],
        ['VIII', '2026103', 'Muhammad Akbar', 'L']
    ];
    downloadCSVFile('Template_Import_Data_Siswa.csv', rows.map(r => r.join(',')).join('\n'));
    showToast('Template Excel/CSV Data Siswa berhasil disiapkan', 'success');
}

function triggerStudentExcelUpload() {
    const el = document.getElementById('student-excel-file-input');
    if (el) el.click();
}

function handleStudentExcelFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        const text = String(ev.target.result || '');
        const added = await importStudentsFromRawText(text, currentClass);
        if (added > 0) {
            showToast(`${added} data siswa berhasil diimpor dari file Excel/CSV!`, 'success');
        } else {
            showToast('Tidak ada baris data siswa valid di dalam file.', 'error');
        }
        e.target.value = '';
    };
    reader.readAsText(file);
}

async function importStudentsFromRawText(rawText, defaultCls) {
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let addedCount = 0;
    lines.forEach((line, idx) => {
        const clean = parseDelimitedLine(line);
        if (idx === 0 && clean.some(c => /^nis$|^nama/i.test(c))) return;

        let cls = defaultCls, nis = '', name = '', gender = 'L';
        if (clean.length >= 4) {
            cls = (clean[0] || defaultCls).toUpperCase();
            nis = clean[1];
            name = clean[2];
            gender = (clean[3] || 'L').toUpperCase().startsWith('P') ? 'P' : 'L';
        } else if (clean.length === 3) {
            nis = clean[0];
            name = clean[1];
            gender = (clean[2] || 'L').toUpperCase().startsWith('P') ? 'P' : 'L';
        } else if (clean.length === 2) {
            nis = clean[0];
            name = clean[1];
        } else {
            nis = String(Date.now()).slice(-6) + idx;
            name = clean[0];
        }

        if (name) {
            const inferredMad = inferMadrasahFromClass(cls);
            if (!appData.classesByMadrasah) appData.classesByMadrasah = { MTs: ['VII', 'VIII', 'IX'], MA: ['X', 'XI', 'XII'] };
            if (!appData.classesByMadrasah[inferredMad].includes(cls)) {
                appData.classesByMadrasah[inferredMad].push(cls);
            }
            if (!appData.classes.includes(cls)) {
                appData.classes.push(cls);
                appData.students[cls] = [];
            }
            if (!Array.isArray(appData.students[cls])) appData.students[cls] = [];
            appData.students[cls].push({
                id: 'S' + Date.now() + '_' + idx + '_' + Math.floor(Math.random() * 100),
                madrasah: inferredMad,
                nis: nis || '-',
                name,
                gender
            });
            addedCount++;
        }
    });

    if (addedCount > 0) {
        await saveData();
        populateClassDropdown();
        refreshAllViews();
    }
    return addedCount;
}

function downloadTeacherExcelTemplate() {
    const rows = [
        ['Unit (MTs / MA / MTs & MA)', 'Nama Guru & Gelar', 'NIP', 'Mata Pelajaran (pisahkan dengan ; atau format MTs: Mapel | MA: Mapel)', 'Username', 'Password'],
        ['MTs', 'Drs. Budi Santoso, M.Pd.', '198504122010011005', 'Matematika; Informatika', 'budi', '1234'],
        ['MA', 'Rina Marlina, S.Pd.', '199002142015022001', 'Bahasa Indonesia', 'rina', '1234'],
        ['MTs & MA', 'Ahmad Fauzi, S.Pd.', '198701012011011002', 'MTs: IPA | MA: Fisika; Kimia', 'fauzi', '1234']
    ];
    downloadCSVFile('Template_Import_Akun_Guru_MTs_MA.csv', rows.map(r => r.join(',')).join('\n'));
    showToast('Template Excel/CSV Akun Guru (MTs & MA) berhasil disiapkan', 'success');
}

function triggerTeacherExcelUpload() {
    const el = document.getElementById('teacher-excel-file-input');
    if (el) el.click();
}

function handleTeacherExcelFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        const text = String(ev.target.result || '');
        const added = await importTeachersFromRawText(text);
        if (added > 0) {
            showToast(`${added} akun guru berhasil diimpor dari file Excel/CSV!`, 'success');
        } else {
            showToast('Tidak ada data akun guru baru yang valid di dalam file.', 'error');
        }
        e.target.value = '';
    };
    reader.readAsText(file);
}

function fillBulkTeacherExample() {
    const ta = document.getElementById('bulk-teachers-textarea');
    if (ta) {
        ta.value = `MTs, Drs. Budi Santoso, 198504122010011005, Matematika; Informatika, budi, 1234\nMA, Rina Marlina S.Pd., 199002142015022001, Bahasa Indonesia, rina, 1234\nMTs & MA, Ahmad Fauzi S.Pd., 198701012011011002, MTs: IPA | MA: Fisika; Kimia, fauzi, 1234`;
    }
}

async function processBulkTeachers(e) {
    e.preventDefault();
    const rawText = document.getElementById('bulk-teachers-textarea').value;
    const defaultMad = document.getElementById('bulk-teacher-default-madrasah')?.value || 'MTs';
    const added = await importTeachersFromRawText(rawText, defaultMad);
    if (added > 0) {
        document.getElementById('bulk-teachers-textarea').value = '';
        closeModal('modal-bulk-teachers');
        showToast(`${added} akun guru berhasil ditambahkan secara massal!`, 'success');
    } else {
        showToast('Format baris tidak valid atau username sudah terdaftar.', 'error');
    }
}

async function importTeachersFromRawText(rawText, fallbackMadrasah = 'MTs') {
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let addedCount = 0;

    lines.forEach((line, idx) => {
        const clean = parseDelimitedLine(line);
        if (idx === 0 && clean.some(c => /^nama|^username/i.test(c))) return;

        let madrasah = fallbackMadrasah, name = '', nip = '-', rawSubjects = '', username = '', password = '123';
        const firstUpper = (clean[0] || '').toUpperCase().replace(/\s+/g, '');
        const isUnitCol = firstUpper === 'MTS' || firstUpper === 'MA' || firstUpper === 'MTS&MA' || firstUpper === 'KEDUANYA';

        if (isUnitCol) {
            if (firstUpper === 'MA') madrasah = 'MA';
            else if (firstUpper === 'MTS&MA' || firstUpper === 'KEDUANYA') madrasah = 'MTs & MA';
            else madrasah = 'MTs';

            if (clean.length >= 6) {
                name = clean[1];
                nip = clean[2] || '-';
                rawSubjects = clean[3] || '';
                username = clean[4];
                password = clean[5] || '123';
            } else if (clean.length === 5) {
                name = clean[1];
                rawSubjects = clean[2] || '';
                username = clean[3];
                password = clean[4] || '123';
            }
        } else if (clean.length >= 5) {
            name = clean[0];
            nip = clean[1] || '-';
            rawSubjects = clean[2] || '';
            username = clean[3];
            password = clean[4] || '123';
        } else if (clean.length === 4) {
            name = clean[0];
            rawSubjects = clean[1] || '';
            username = clean[2];
            password = clean[3] || '123';
        }

        let mtsSubj = [];
        let maSubj = [];
        let subjList = [];

        if (rawSubjects.includes('|') || /mts\s*:|ma\s*:/i.test(rawSubjects)) {
            madrasah = 'MTs & MA';
            const segments = rawSubjects.split('|');
            segments.forEach(seg => {
                const trimmed = seg.trim();
                if (/^mts\s*:/i.test(trimmed)) {
                    mtsSubj = trimmed.replace(/^mts\s*:/i, '').split(/[;,]/).map(s => s.trim()).filter(Boolean);
                } else if (/^ma\s*:/i.test(trimmed)) {
                    maSubj = trimmed.replace(/^ma\s*:/i, '').split(/[;,]/).map(s => s.trim()).filter(Boolean);
                }
            });
            subjList = Array.from(new Set([...mtsSubj, ...maSubj]));
        } else {
            subjList = rawSubjects.split(/[;,]/).map(s => s.trim()).filter(Boolean);
            if (madrasah === 'MTs') mtsSubj = subjList;
            else if (madrasah === 'MA') maSubj = subjList;
            else {
                mtsSubj = subjList;
                maSubj = subjList;
            }
        }

        if (name && username && !appData.teachers.some(t => t.username.toLowerCase() === username.toLowerCase())) {
            appData.teachers.push({
                id: 'G' + Date.now() + '_' + idx + '_' + Math.floor(Math.random() * 100),
                madrasah,
                name,
                nip,
                subjects: subjList,
                subjectsByMadrasah: {
                    MTs: mtsSubj,
                    MA: maSubj
                },
                subject: subjList.join(', '),
                username,
                password
            });
            addedCount++;
        }
    });

    if (addedCount > 0) {
        await saveData();
        setupTeacherJournalField();
        renderManageTeachers();
    }
    return addedCount;
}

async function addSubjectItem(e) {
    e.preventDefault();
    const code = document.getElementById('new-subject-code').value.trim().toUpperCase() || 'MP-' + (appData.subjects.length + 1);
    const name = document.getElementById('new-subject-name').value.trim();
    if (!name) return;

    appData.subjects.push({
        id: 'MP' + Date.now(),
        code,
        name
    });

    await saveData();
    populateSubjectDropdowns();
    renderManageSubjects();
    e.target.reset();
    showToast(`Mata pelajaran ${name} ditambahkan`, 'success');
}

function renderManageSubjects() {
    const tbody = document.getElementById('manage-subjects-body');
    const badge = document.getElementById('subject-count-badge');
    if (!tbody) return;
    if (badge) badge.textContent = `${appData.subjects.length} Mapel`;

    if (appData.subjects.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-xs text-slate-400">Belum ada mata pelajaran terdaftar.</td></tr>`;
        return;
    }

    tbody.innerHTML = appData.subjects.map((s, idx) => `
        <tr class="hover:bg-slate-50">
            <td class="py-3 px-4 text-center text-xs font-semibold text-slate-500">${idx + 1}</td>
            <td class="py-3 px-4"><span class="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">${s.code}</span></td>
            <td class="py-3 px-4 font-semibold text-slate-800">${s.name}</td>
            <td class="py-3 px-4 text-center">
                <button type="button" onclick="deleteSubject('${s.id}')" class="text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg" title="Hapus Mapel">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </td>
        </tr>
    `).join('');
    if (window.lucide) lucide.createIcons();
}

function deleteSubject(id) {
    openConfirmModal('Hapus Mata Pelajaran', 'Hapus mata pelajaran ini dari daftar?', async () => {
        appData.subjects = appData.subjects.filter(s => s.id !== id);
        await saveData();
        populateSubjectDropdowns();
        renderManageSubjects();
        showToast('Mata pelajaran dihapus', 'success');
    });
}

// ==========================================
// 11. BACKUP / RESTORE JSON & FIREBASE CONFIG
// ==========================================
function exportFullBackup() {
    const jsonStr = JSON.stringify(appData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Backup_Jurnal_Nurul_Chalik_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('File backup JSON berhasil diunduh', 'success');
}

function triggerRestoreBackup() {
    const input = document.getElementById('restore-backup-input');
    if (input) input.click();
}

function handleRestoreBackupFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const parsed = JSON.parse(String(ev.target.result || '{}'));
            appData = mergeWithSchema(parsed);
            await saveData();
            populateMadrasahDropdown();
            populateAcademicYearDropdown();
            populateSemesterDropdown();
            populateClassDropdown();
            populateSubjectDropdowns();
            refreshAllViews();
            showToast('Data backup JSON berhasil dipulihkan!', 'success');
        } catch (err) {
            showToast('File backup JSON tidak valid: ' + err.message, 'error');
        }
        e.target.value = '';
    };
    reader.readAsText(file);
}

async function saveCustomFirebaseConfig(e) {
    e.preventDefault();
    const raw = document.getElementById('firebase-config-input').value.trim();
    try {
        const parsed = JSON.parse(raw);
        if (!parsed.apiKey || !parsed.projectId) {
            showToast('Config JSON harus memiliki apiKey dan projectId!', 'error');
            return;
        }
        localStorage.setItem('jnc_custom_firebase_config', JSON.stringify(parsed));
        await initFirebaseConnection(parsed);
        showToast('Konfigurasi Firebase berhasil diterapkan!', 'success');
    } catch (err) {
        showToast('Format JSON Firebase Config tidak valid: ' + err.message, 'error');
    }
}

async function forcePushToFirebase() {
    if (!db || !currentAuthUser) {
        await initFirebaseConnection();
    }
    await saveData();
    showToast('Sinkronisasi data ke Firebase Cloud selesai!', 'success');
}

function copyFirestoreRules() {
    const ta = document.getElementById('firestore-rules-textarea');
    if (!ta) return;
    ta.select();
    navigator.clipboard?.writeText(ta.value);
    showToast('Firestore Rules berhasil disalin ke clipboard', 'success');
}

// ==========================================
// 12. EKSPOR CSV, CETAK LAPORAN, MODAL & TOAST
// ==========================================
function escapeCSVCell(val) {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function downloadCSVFile(filename, csvContent) {
    try {
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();

        // Siapkan juga modal cadangan jika unduhan otomatis diblokir iframe/webview
        const directLink = document.getElementById('csv-direct-download-link');
        const textarea = document.getElementById('csv-export-textarea');
        if (directLink) {
            directLink.href = url;
            directLink.download = filename;
        }
        if (textarea) textarea.value = csvContent;
    } catch (e) {
        const textarea = document.getElementById('csv-export-textarea');
        if (textarea) textarea.value = csvContent;
        openModal('modal-csv-export');
    }
}

function copyCSVToClipboard() {
    const ta = document.getElementById('csv-export-textarea');
    if (!ta) return;
    ta.select();
    navigator.clipboard?.writeText(ta.value);
    showToast('Data CSV berhasil disalin ke clipboard', 'success');
}

function exportAttendanceCSV() {
    const students = appData.students[currentClass] || [];
    const monthFilter = document.getElementById('rekap-month-filter')?.value || 'ALL';
    const matchingKeys = getMatchingAttendanceKeysForClass(currentClass, currentAcademicYear, currentSemester, monthFilter);

    const rows = [
        ['No', 'NIS', 'Nama Siswa', 'Hadir (H)', 'Sakit (S)', 'Izin (I)', 'Alpa (A)', 'Total Pertemuan', 'Persentase Kehadiran']
    ];

    students.forEach((s, idx) => {
        let H = 0, S = 0, I = 0, A = 0;
        matchingKeys.forEach(k => {
            const st = appData.attendance[k][s.id];
            if (st === 'H') H++;
            else if (st === 'S') S++;
            else if (st === 'I') I++;
            else if (st === 'A') A++;
        });
        const total = H + S + I + A;
        const pct = total > 0 ? Math.round((H / total) * 100) + '%' : '0%';
        rows.push([idx + 1, s.nis, s.name, H, S, I, A, total, pct].map(escapeCSVCell));
    });

    const filename = `Rekap_Absensi_${currentMadrasah}_Kelas_${currentClass}_${currentAcademicYear.replace('/', '-')}.csv`;
    downloadCSVFile(filename, rows.map(r => r.join(',')).join('\n'));
    showToast('File CSV Rekap Absensi berhasil diunduh', 'success');
}

function exportJournalCSV() {
    const list = getFilteredArchiveJournals();
    const rows = [
        ['No', 'Tanggal', 'Jam Ke', 'Unit', 'Kelas', 'Guru Pengajar', 'Mata Pelajaran', 'Materi Pokok', 'Kegiatan Pembelajaran', 'Rekap Absen', 'Siswa Tidak Hadir', 'Catatan', 'Lokasi']
    ];

    list.forEach((j, idx) => {
        const sum = j.attendanceSummary || { H: 0, S: 0, I: 0, A: 0 };
        rows.push([
            idx + 1,
            j.date || '',
            j.hours || '',
            resolveJournalMadrasah(j),
            j.className || '',
            j.teacherName || '',
            j.subject || '',
            j.topic || '',
            j.activity || '',
            `H:${sum.H} S:${sum.S} I:${sum.I} A:${sum.A}`,
            j.absentDetails || '',
            j.notes || '',
            j.location || ''
        ].map(escapeCSVCell));
    });

    const filename = `Arsip_Jurnal_Kelas_${currentAcademicYear.replace('/', '-')}_${currentSemester}.csv`;
    downloadCSVFile(filename, rows.map(r => r.join(',')).join('\n'));
    showToast('File CSV Arsip Jurnal Kelas berhasil diunduh', 'success');
}

function exportTeacherRecapCSV() {
    const list = getFilteredTeacherJournals();
    const rows = [
        ['No', 'Tanggal', 'Jam Ke', 'Unit', 'Kelas', 'Nama Guru', 'Mata Pelajaran', 'Materi', 'Kehadiran', 'Lokasi']
    ];

    list.forEach((j, idx) => {
        const sum = j.attendanceSummary || { H: 0, S: 0, I: 0, A: 0 };
        rows.push([
            idx + 1,
            j.date || '',
            j.hours || '',
            j.madrasah || inferMadrasahFromClass(j.className),
            j.className || '',
            j.teacherName || '',
            j.subject || '',
            j.topic || '',
            `H:${sum.H} S:${sum.S} I:${sum.I} A:${sum.A}`,
            j.location || ''
        ].map(escapeCSVCell));
    });

    const filename = `Rekap_Guru_Mengajar_${currentAcademicYear.replace('/', '-')}_${currentSemester}.csv`;
    downloadCSVFile(filename, rows.map(r => r.join(',')).join('\n'));
    showToast('File CSV Rekap Guru Mengajar berhasil diunduh', 'success');
}

function buildPrintDocumentHTML(title, subtitle, tableInnerHTML, madrasahCode = currentMadrasah) {
    const kmData = appData.kepalaMadrasah?.[madrasahCode] || appData.kepalaMadrasah?.MTs || {
        name: 'Kepala Madrasah',
        nip: '-',
        city: 'Nurul Chalik'
    };
    const city = kmData.city || appData.kepalaMadrasah?.city || 'Nurul Chalik';
    const todayFormatted = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    return `
        <div class="space-y-4 text-slate-900">
            <div class="text-center border-b-2 border-slate-800 pb-3">
                <h2 class="text-lg font-bold uppercase tracking-wide">${getMadrasahFullName(madrasahCode)}</h2>
                <h3 class="text-base font-bold mt-0.5">${title}</h3>
                <p class="text-xs text-slate-600 mt-0.5">${subtitle}</p>
            </div>
            <div>${tableInnerHTML}</div>
            <div class="pt-8 flex justify-end">
                <div class="text-xs text-center w-64">
                    <p>${city}, ${todayFormatted}</p>
                    <p class="font-semibold">Mengetahui, Kepala ${madrasahCode}</p>
                    <div class="h-16"></div>
                    <p class="font-bold underline">${kmData.name}</p>
                    <p>NIP. ${kmData.nip || '-'}</p>
                </div>
            </div>
        </div>
    `;
}

function openPrintPreviewModal(title, subtitle, elementId, madrasahCode = currentMadrasah) {
    const sourceEl = document.getElementById(elementId);
    if (!sourceEl) return;
    const html = buildPrintDocumentHTML(title, subtitle, sourceEl.innerHTML, madrasahCode);

    document.getElementById('print-modal-title').textContent = title;
    document.getElementById('print-modal-body').innerHTML = html;
    document.getElementById('print-area-container').innerHTML = html;
    openModal('modal-print-preview');
}

function printAttendanceRecap() {
    openPrintPreviewModal(
        'LAPORAN REKAPITULASI KEHADIRAN SISWA',
        `Unit ${currentMadrasah} • Kelas ${currentClass} • TP ${currentAcademicYear} (Semester ${currentSemester})`,
        'rekap-absen-printable',
        currentMadrasah
    );
}

function printJournalRecap() {
    const madFilter = document.getElementById('jurnal-madrasah-filter')?.value || 'ALL';
    const targetMad = madFilter === 'MA' ? 'MA' : 'MTs';
    openPrintPreviewModal(
        'ARSIP JURNAL KEGIATAN MENGAJAR KELAS',
        `TP ${currentAcademicYear} • Semester ${currentSemester}`,
        'rekap-jurnal-printable',
        targetMad
    );
}

function printTeacherRecap() {
    const madFilter = document.getElementById('filter-rg-madrasah')?.value || 'ALL';
    const targetMad = madFilter === 'MA' ? 'MA' : 'MTs';
    openPrintPreviewModal(
        'REKAPITULASI KEHADIRAN GURU MASUK KELAS',
        `TP ${currentAcademicYear} • Semester ${currentSemester}`,
        'rekap-guru-printable',
        targetMad
    );
}

function triggerNativePrint() {
    window.print();
}

function openModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) {
        el.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    }
}

function closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.add('hidden');
}

function openConfirmModal(title, message, onConfirmCallback) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    const btn = document.getElementById('confirm-action-btn');
    btn.onclick = async () => {
        closeModal('modal-confirm');
        await onConfirmCallback();
    };
    openModal('modal-confirm');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const palette = {
        success: 'bg-emerald-600 text-white border-emerald-500',
        error: 'bg-rose-600 text-white border-rose-500',
        info: 'bg-slate-800 text-white border-slate-700'
    };

    const toast = document.createElement('div');
    toast.className = `pointer-events-auto px-4 py-3 rounded-xl shadow-lg border text-xs sm:text-sm font-semibold transition-all duration-300 ${palette[type] || palette.info}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(8px)';
        setTimeout(() => toast.remove(), 300);
    }, 3200);
}

function refreshAllViews() {
    loadAttendanceForDate();
    updateDashboardStats();
    populateMonthFilters();
    renderAttendanceRecap();
    populateJournalRecapFilters();
    renderJournalRecap();
    populateTeacherRecapFilters();
    renderTeacherClassRecap();
    renderManageStudents();
    renderManageTeachers();
    renderManageSubjects();
}

// ==========================================
// 13. EKSPOS FUNGSI KE GLOBAL WINDOW & BOOTSTRAP
// ==========================================
Object.assign(window, {
    selectLoginRole,
    handleLogin,
    handleLogout,
    toggleSidebar,
    switchTab,
    switchMobileInputStep,
    handleMadrasahChange,
    handleAcademicYearChange,
    addNewAcademicYear,
    handleSemesterChange,
    handleClassChange,
    loadAttendanceForDate,
    setStudentStatus,
    markAllPresent,
    saveAttendanceOnly,
    saveAttendanceAndJournal,
    captureAttendanceLocation,
    updateSelectedHoursCount,
    populateSubjectDropdowns,
    renderAttendanceRecap,
    deleteStudentAttendanceRecap,
    deleteAllFilteredAttendance,
    handleJournalMadrasahFilterChange,
    handleJournalClassFilterChange,
    renderJournalRecap,
    resetJournalFilters,
    deleteJournal,
    deleteAllFilteredJournals,
    handleTeacherRecapMadrasahFilterChange,
    renderTeacherClassRecap,
    resetTeacherRecapFilters,
    addNewClass,
    updateNewStudentClassSuggestions,
    addStudent,
    openBulkStudentModal,
    fillBulkExample,
    processBulkStudents,
    renderManageStudents,
    deleteStudent,
    downloadStudentExcelTemplate,
    triggerStudentExcelUpload,
    handleStudentExcelFileUpload,
    saveKepalaMadrasah,
    toggleTeacherSubjectMode,
    updateSelectedTeacherSubjectsCount,
    addClassSubjectMappingRow,
    syncTeacherUnitFromClassMappings,
    addTeacherAccount,
    switchManageTeacherMadrasah,
    openEditTeacherModal,
    toggleEditTeacherSubjectMode,
    updateEditTeacherSubjectsCount,
    saveEditedTeacherAccount,
    deleteTeacher,
    downloadTeacherExcelTemplate,
    triggerTeacherExcelUpload,
    handleTeacherExcelFileUpload,
    fillBulkTeacherExample,
    processBulkTeachers,
    addSubjectItem,
    deleteSubject,
    exportFullBackup,
    triggerRestoreBackup,
    handleRestoreBackupFile,
    saveCustomFirebaseConfig,
    forcePushToFirebase,
    copyFirestoreRules,
    exportAttendanceCSV,
    exportJournalCSV,
    exportTeacherRecapCSV,
    copyCSVToClipboard,
    printAttendanceRecap,
    printJournalRecap,
    printTeacherRecap,
    triggerNativePrint,
    openModal,
    closeModal
});

function bootstrapApplication() {
    if (window.lucide) lucide.createIcons();
    restoreActiveSession();
    initFirebaseConnection();
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', bootstrapApplication);
} else {
    bootstrapApplication();
}
