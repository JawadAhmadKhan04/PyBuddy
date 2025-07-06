const vscode = acquireVsCodeApi();

function login() {
    vscode.postMessage({ type: 'login' });
}

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.querySelector('.login-button');
    if (btn) btn.style.display = '';
});

window.addEventListener('message', event => {
    const message = event.data;
    const btn = document.querySelector('.login-button');
    if (!btn) return;
    if (message.type === 'hideLogin') {
        btn.style.display = 'none';
    } else if (message.type === 'showLogin') {
        btn.style.display = '';
    }
}); 