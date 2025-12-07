// 유틸리티 모듈 - 토스트 알림, 다크모드, 공통 기능

// ============================================
// 토스트 알림 시스템
// ============================================
const Toast = {
    container: null,

    init() {
        if (this.container) return;

        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        this.container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
        `;
        document.body.appendChild(this.container);
    },

    show(message, type = 'info', duration = 3000) {
        this.init();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icons = {
            success: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
            error: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
            warning: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
            info: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
        };

        const colors = {
            success: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            error: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            warning: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            info: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
        };

        toast.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 14px 20px;
            background: ${colors[type]};
            color: white;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
            font-size: 14px;
            font-weight: 500;
            pointer-events: auto;
            transform: translateX(120%);
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            backdrop-filter: blur(10px);
            max-width: 350px;
        `;

        toast.innerHTML = `
            <span class="toast-icon">${icons[type]}</span>
            <span class="toast-message">${message}</span>
            <button class="toast-close" style="background: none; border: none; color: white; cursor: pointer; padding: 0; margin-left: 8px; opacity: 0.7;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        `;

        this.container.appendChild(toast);

        // 애니메이션
        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(0)';
        });

        // 닫기 버튼
        toast.querySelector('.toast-close').addEventListener('click', () => {
            this.hide(toast);
        });

        // 자동 숨김
        if (duration > 0) {
            setTimeout(() => this.hide(toast), duration);
        }

        return toast;
    },

    hide(toast) {
        toast.style.transform = 'translateX(120%)';
        setTimeout(() => toast.remove(), 300);
    },

    success(message, duration) { return this.show(message, 'success', duration); },
    error(message, duration) { return this.show(message, 'error', duration); },
    warning(message, duration) { return this.show(message, 'warning', duration); },
    info(message, duration) { return this.show(message, 'info', duration); }
};

// ============================================
// 다크 모드 관리
// ============================================
const DarkMode = {
    storageKey: 'aiedap-dark-mode',

    init() {
        const saved = localStorage.getItem(this.storageKey);
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        if (saved === 'true' || (saved === null && prefersDark)) {
            this.enable();
        }

        // 시스템 설정 변경 감지
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (localStorage.getItem(this.storageKey) === null) {
                e.matches ? this.enable() : this.disable();
            }
        });
    },

    toggle() {
        document.body.classList.contains('dark-mode') ? this.disable() : this.enable();
    },

    enable() {
        document.body.classList.add('dark-mode');
        localStorage.setItem(this.storageKey, 'true');
        this.updateToggleButton();
    },

    disable() {
        document.body.classList.remove('dark-mode');
        localStorage.setItem(this.storageKey, 'false');
        this.updateToggleButton();
    },

    updateToggleButton() {
        const btn = document.getElementById('darkModeToggle');
        if (btn) {
            const isDark = document.body.classList.contains('dark-mode');
            btn.innerHTML = isDark
                ? '<i data-lucide="sun" class="w-5 h-5"></i>'
                : '<i data-lucide="moon" class="w-5 h-5"></i>';
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    },

    isDark() {
        return document.body.classList.contains('dark-mode');
    }
};

// ============================================
// 확인 모달
// ============================================
const Modal = {
    confirm(message, title = '확인') {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(4px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                opacity: 0;
                transition: opacity 0.2s;
            `;

            const modal = document.createElement('div');
            modal.className = 'modal-content';
            modal.style.cssText = `
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(20px);
                border-radius: 16px;
                padding: 24px;
                max-width: 400px;
                width: 90%;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                transform: scale(0.9);
                transition: transform 0.2s;
            `;

            modal.innerHTML = `
                <h3 style="margin: 0 0 12px; color: #4c1d95; font-size: 18px;">${title}</h3>
                <p style="margin: 0 0 20px; color: #666; line-height: 1.5;">${message}</p>
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button class="modal-cancel btn btn-secondary" style="padding: 10px 20px;">취소</button>
                    <button class="modal-confirm btn btn-primary" style="padding: 10px 20px;">확인</button>
                </div>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            // 애니메이션
            requestAnimationFrame(() => {
                overlay.style.opacity = '1';
                modal.style.transform = 'scale(1)';
            });

            const close = (result) => {
                overlay.style.opacity = '0';
                modal.style.transform = 'scale(0.9)';
                setTimeout(() => overlay.remove(), 200);
                resolve(result);
            };

            modal.querySelector('.modal-cancel').addEventListener('click', () => close(false));
            modal.querySelector('.modal-confirm').addEventListener('click', () => close(true));
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) close(false);
            });
        });
    },

    prompt(message, title = '입력', defaultValue = '') {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(4px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                opacity: 0;
                transition: opacity 0.2s;
            `;

            const modal = document.createElement('div');
            modal.className = 'modal-content';
            modal.style.cssText = `
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(20px);
                border-radius: 16px;
                padding: 24px;
                max-width: 400px;
                width: 90%;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                transform: scale(0.9);
                transition: transform 0.2s;
            `;

            modal.innerHTML = `
                <h3 style="margin: 0 0 12px; color: #4c1d95; font-size: 18px;">${title}</h3>
                <p style="margin: 0 0 12px; color: #666; line-height: 1.5;">${message}</p>
                <input type="text" class="modal-input glass-input" value="${defaultValue}" style="width: 100%; margin-bottom: 20px; padding: 12px; border-radius: 10px;">
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button class="modal-cancel btn btn-secondary" style="padding: 10px 20px;">취소</button>
                    <button class="modal-confirm btn btn-primary" style="padding: 10px 20px;">확인</button>
                </div>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            const input = modal.querySelector('.modal-input');
            input.focus();
            input.select();

            // 애니메이션
            requestAnimationFrame(() => {
                overlay.style.opacity = '1';
                modal.style.transform = 'scale(1)';
            });

            const close = (result) => {
                overlay.style.opacity = '0';
                modal.style.transform = 'scale(0.9)';
                setTimeout(() => overlay.remove(), 200);
                resolve(result);
            };

            modal.querySelector('.modal-cancel').addEventListener('click', () => close(null));
            modal.querySelector('.modal-confirm').addEventListener('click', () => close(input.value));
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') close(input.value);
                if (e.key === 'Escape') close(null);
            });
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) close(null);
            });
        });
    },

    // 비밀번호 입력 모달
    password(message, title = '비밀번호 입력') {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(4px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                opacity: 0;
                transition: opacity 0.2s;
            `;

            const modal = document.createElement('div');
            modal.className = 'modal-content';
            modal.style.cssText = `
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(20px);
                border-radius: 16px;
                padding: 24px;
                max-width: 400px;
                width: 90%;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                transform: scale(0.9);
                transition: transform 0.2s;
            `;

            modal.innerHTML = `
                <h3 style="margin: 0 0 12px; color: #4c1d95; font-size: 18px;">${title}</h3>
                <p style="margin: 0 0 12px; color: #666; line-height: 1.5;">${message}</p>
                <input type="password" class="modal-input glass-input" placeholder="비밀번호" style="width: 100%; margin-bottom: 20px; padding: 12px; border-radius: 10px;">
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button class="modal-cancel btn btn-secondary" style="padding: 10px 20px;">취소</button>
                    <button class="modal-confirm btn btn-primary" style="padding: 10px 20px;">확인</button>
                </div>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            const input = modal.querySelector('.modal-input');
            input.focus();

            // 애니메이션
            requestAnimationFrame(() => {
                overlay.style.opacity = '1';
                modal.style.transform = 'scale(1)';
            });

            const close = (result) => {
                overlay.style.opacity = '0';
                modal.style.transform = 'scale(0.9)';
                setTimeout(() => overlay.remove(), 200);
                resolve(result);
            };

            modal.querySelector('.modal-cancel').addEventListener('click', () => close(null));
            modal.querySelector('.modal-confirm').addEventListener('click', () => close(input.value));
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') close(input.value);
                if (e.key === 'Escape') close(null);
            });
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) close(null);
            });
        });
    }
};

// ============================================
// 로딩 오버레이
// ============================================
const Loading = {
    overlay: null,

    show(message = '로딩 중...') {
        if (this.overlay) return;

        this.overlay = document.createElement('div');
        this.overlay.className = 'loading-overlay';
        this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.2s;
        `;

        this.overlay.innerHTML = `
            <div style="background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(20px); border-radius: 16px; padding: 30px 40px; text-align: center; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);">
                <div class="spinner" style="border: 4px solid #f3f3f3; border-top: 4px solid #8b5cf6; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 15px;"></div>
                <p style="color: #4c1d95; font-weight: 500; margin: 0;">${message}</p>
            </div>
        `;

        document.body.appendChild(this.overlay);

        requestAnimationFrame(() => {
            this.overlay.style.opacity = '1';
        });
    },

    hide() {
        if (!this.overlay) return;

        this.overlay.style.opacity = '0';
        setTimeout(() => {
            if (this.overlay) {
                this.overlay.remove();
                this.overlay = null;
            }
        }, 200);
    },

    async wrap(promise, message = '처리 중...') {
        this.show(message);
        try {
            return await promise;
        } finally {
            this.hide();
        }
    }
};

// ============================================
// 콘텐츠 내보내기
// ============================================
const Exporter = {
    downloadHTML(htmlContent, filename = 'content.html') {
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    async downloadPDF(htmlContent, filename = 'content.pdf') {
        // 간단한 프린트 기반 PDF 생성
        const printWindow = window.open('', '_blank');
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();

        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 500);
    },

    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            Toast.success('클립보드에 복사되었습니다');
        }).catch(() => {
            Toast.error('복사에 실패했습니다');
        });
    }
};

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    Toast.init();
    DarkMode.init();
});
