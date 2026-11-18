/* =========================================================
   STYLE.CSS - JURNAL NURUL CHALIK
   ========================================================= */

/* Custom Scrollbar */
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

/* Animasi Indikator GPS Real-Time */
@keyframes pulseRing {
    0% {
        transform: scale(0.95);
        opacity: 0.8;
    }
    70% {
        transform: scale(1.4);
        opacity: 0;
    }
    100% {
        transform: scale(0.95);
        opacity: 0;
    }
}

.gps-pulse-dot {
    position: relative;
}

.gps-pulse-dot::after {
    content: '';
    position: absolute;
    inset: -3px;
    border-radius: 9999px;
    background: currentColor;
    animation: pulseRing 1.8s infinite;
}

/* Animasi Transisi Halus */
.fade-in {
    animation: fadeIn 0.25s ease-out forwards;
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(4px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* Pengaturan Cetak Laporan (Print / PDF) */
@media print {
    body * {
        visibility: hidden;
    }
    #print-area,
    #print-area * {
        visibility: visible;
    }
    #print-area {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        padding: 16px;
        background: #ffffff;
    }
    .no-print {
        display: none !important;
    }
}