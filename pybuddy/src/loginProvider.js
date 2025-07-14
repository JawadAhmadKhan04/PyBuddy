const vscode = require('vscode');
const fs = require('fs');

class LoginProvider {
	constructor(extensionUri) {
		this._extensionUri = extensionUri;
		this._webviewView = null;
	}

			resolveWebviewView(webviewView) {
		this._webviewView = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'webview')]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		let isLoading = false;

		webviewView.webview.onDidReceiveMessage(async data => {
			switch (data.type) {
				case 'login':
					vscode.window.showInformationMessage('Login pressed');
					vscode.commands.executeCommand('setContext', 'pybuddyLoggedIn', true);
					// Hide the login button in the webview
					webviewView.webview.postMessage({ type: 'hideLogin' });
					break;
				case 'logout':
					vscode.window.showInformationMessage('Logout Pressed');
					vscode.commands.executeCommand('setContext', 'pybuddyLoggedIn', false);
					// Show the login button in the webview
					webviewView.webview.postMessage({ type: 'showLogin' });
					break;
			}
		});
	}

	_getHtmlForWebview(webview) {
		const webviewFolder = vscode.Uri.joinPath(this._extensionUri, 'webview');
		const htmlPath = vscode.Uri.joinPath(webviewFolder, 'login.html');
		const cssPath = vscode.Uri.joinPath(webviewFolder, 'login.css');
		const jsPath = vscode.Uri.joinPath(webviewFolder, 'login.js');

		let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
		const cssUri = webview.asWebviewUri(cssPath);
		const jsUri = webview.asWebviewUri(jsPath);

		html = html.replace('href="login.css"', `href="${cssUri}"`);
		html = html.replace('src="login.js"', `src="${jsUri}"`);

		return html;
	}
}

module.exports = LoginProvider;