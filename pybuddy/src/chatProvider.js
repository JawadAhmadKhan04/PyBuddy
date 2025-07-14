const vscode = require('vscode');
const fs = require('fs');

class ChatProvider {
	constructor(extensionUri) {
		this._extensionUri = extensionUri;
		this._webviewView = null;
		this._messages = [];
	}

	resolveWebviewView(webviewView) {
		this._webviewView = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'webview')]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(async data => {
			switch (data.type) {
				case 'saveMessages':
					this._messages = data.messages;
					break;
				case 'loadMessages':
					// Send saved messages back to webview
					webviewView.webview.postMessage({
						type: 'loadMessages',
						messages: this._messages
					});
					break;
				case 'chatCleared':
					this._messages = [];
					break;
			}
		});
	}



	_getHtmlForWebview(webview) {
		const webviewFolder = vscode.Uri.joinPath(this._extensionUri, 'webview');
		const htmlPath = vscode.Uri.joinPath(webviewFolder, 'chat.html');
		const cssPath = vscode.Uri.joinPath(webviewFolder, 'chat.css');
		const jsPath = vscode.Uri.joinPath(webviewFolder, 'chat.js');

		let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
		const cssUri = webview.asWebviewUri(cssPath);
		const jsUri = webview.asWebviewUri(jsPath);

		html = html.replace('href="chat.css"', `href="${cssUri}"`);
		html = html.replace('src="chat.js"', `src="${jsUri}"`);

		return html;
	}
}

module.exports = ChatProvider;