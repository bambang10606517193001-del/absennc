/* =========================================================
STYLE.CSS - JURNAL NURUL CHALIK
========================================================= */

/* Custom scrollbar untuk tampilan lebih bersih */
::-webkit-scrollbar {
width: 6px;
height: 6px;
}

::-webkit-scrollbar-track {
background: #f1f5f9;
}

::-webkit-scrollbar-thumb {
background: #cbd5e1;
border-radius: 9999px;
}

::-webkit-scrollbar-thumb:hover {
background: #94a3b8;
}

/* Pengaturan Cetak Laporan (Print / PDF) */
@media print {
.no-print {
display: none !important;
}

#app-wrapper,
#login-screen,
#modal-add-year,
#modal-add-class,
#modal-bulk-students,
#modal-bulk-teachers,
#modal-csv-export,
#modal-confirm,
#modal-print-preview,
#modal-edit-teacher,
#toast-container {
    display: none !important;
}

#print-area-container {
    display: block !important;
    position: static !important;
    width: 100% !important;
    background: white !important;
    padding: 0 !important;
    margin: 0 !important;
}

body {
    background-color: white !important;
}

.print-full {
    width: 100% !important;
    max-width: 100% !important;
    box-shadow: none !important;
    border: none !important;
}


}
