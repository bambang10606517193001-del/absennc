/* =========================================================
   APP.JS - LOGIKA APLIKASI JURNAL NURUL CHALIK
   ========================================================= */

// ==========================================
// 1. KONFIGURASI FIREBASE & STATE APLIKASI
// ==========================================
// ... existing code ...
        // ==========================================
        // 3. KONEKSI FIREBASE CLOUD (OPSIONAL / OTOMATIS)
        // ==========================================
        async function initFirebaseConnection() {
            const syncDot = document.getElementById('login-sync-dot');
            const syncText = document.getElementById('login-sync-text');

            try {
                if (typeof __firebase_config === 'undefined') {
                    if (syncDot) syncDot.className = 'w-2 h-2 rounded-full bg-emerald-400';
                    if (syncText) syncText.textContent = 'Mode Penyimpanan Perangkat Siap';
                    return;
                }

                const [{ initializeApp }, { getAuth, signInAnonymously, signInWithCustomToken }, { getFirestore, doc, setDoc, onSnapshot }] = await Promise.all([
                    import("https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js"),
                    import("https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js"),
                    import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js")
                ]);
                window._firestoreSetDoc = setDoc;
                window._firestoreDoc = doc;

                const firebaseConfig = JSON.parse(__firebase_config);
                const app = initializeApp(firebaseConfig);
                auth = getAuth(app);
                db = getFirestore(app);
// ... existing code ...
        async function saveData() {
            saveLocalCacheOnly();
            if (db && firebaseUser && window._firestoreDoc && window._firestoreSetDoc) {
                try {
                    const docRef = window._firestoreDoc(db, 'artifacts', appId, 'public', 'data', 'master', 'state');
                    await window._firestoreSetDoc(docRef, appData, { merge: true });
                } catch (err) {
                    console.warn('Sinkronisasi cloud tertunda (mode lokal aktif):', err.message);
                }
            }
        }
// ... existing code ...
// Inisialisasi saat halaman dimuat (aman baik sebelum maupun sesudah DOMContentLoaded)
function bootstrapApp() {
    if (window.lucide) lucide.createIcons();
    restoreActiveSession();
    initFirebaseConnection();
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
    bootstrapApp();
}
