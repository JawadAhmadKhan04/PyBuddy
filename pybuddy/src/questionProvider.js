const vscode = require('vscode');
const fs = require('fs');

class QuestionProvider {
	constructor(extensionUri) {
		this._extensionUri = extensionUri;
		this._webviewView = null;
		this._questions = [];
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
				case 'saveQuestions':
					this._questions = data.questions;
					break;
				case 'loadQuestions':
					// Send saved questions back to webview
					webviewView.webview.postMessage({
						type: 'loadQuestions',
						questions: this._questions
					});
					break;
				case 'questionsCleared':
					this._questions = [];
					break;
			}
		});
	}

	_getHtmlForWebview(webview) {
		const webviewFolder = vscode.Uri.joinPath(this._extensionUri, 'webview');
		const htmlPath = vscode.Uri.joinPath(webviewFolder, 'question.html');
		const cssPath = vscode.Uri.joinPath(webviewFolder, 'question.css');
		const jsPath = vscode.Uri.joinPath(webviewFolder, 'question.js');

		let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
		const cssUri = webview.asWebviewUri(cssPath);
		const jsUri = webview.asWebviewUri(jsPath);

		html = html.replace('href="question.css"', `href="${cssUri}"`);
		html = html.replace('src="question.js"', `src="${jsUri}"`);

		return html;
	}
}


module.exports = QuestionProvider;